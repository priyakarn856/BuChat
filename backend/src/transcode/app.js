const { MediaConvertClient, CreateJobCommand, GetJobCommand } = require("@aws-sdk/client-mediaconvert");
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// MediaConvert client requires custom endpoint
const getMediaConvertClient = async () => {
  const endpoint = process.env.MEDIACONVERT_ENDPOINT;
  if (!endpoint) {
    throw new Error('MEDIACONVERT_ENDPOINT environment variable is required');
  }
  return new MediaConvertClient({ 
    endpoint,
    region: process.env.AWS_REGION || 'ap-south-1'
  });
};

// Video quality presets for adaptive streaming - COST OPTIMIZED
// Uses efficient encoding settings to minimize MediaConvert costs
const VIDEO_PRESETS = [
  // Mobile-first: Start with low bitrates for faster load
  { suffix: '360p', width: 640, height: 360, videoBitrate: 600000, audioBitrate: 64000 },
  { suffix: '480p', width: 854, height: 480, videoBitrate: 1000000, audioBitrate: 96000 },
  { suffix: '720p', width: 1280, height: 720, videoBitrate: 2000000, audioBitrate: 128000 },
  // Only generate 1080p for videos that warrant it
  { suffix: '1080p', width: 1920, height: 1080, videoBitrate: 4000000, audioBitrate: 128000 }
];

// Cost-saving: Skip unnecessary qualities based on source resolution
const getPresetsForResolution = (sourceHeight) => {
  if (sourceHeight <= 360) return VIDEO_PRESETS.filter(p => p.height <= 360);
  if (sourceHeight <= 480) return VIDEO_PRESETS.filter(p => p.height <= 480);
  if (sourceHeight <= 720) return VIDEO_PRESETS.filter(p => p.height <= 720);
  return VIDEO_PRESETS; // Full set for HD+ sources
};

/**
 * Create MediaConvert job for video transcoding
 */
const createTranscodeJob = async (s3Key, fileId) => {
  const mediaConvert = await getMediaConvertClient();
  
  const bucketName = process.env.MEDIA_BUCKET;
  const region = process.env.AWS_REGION || 'ap-south-1';
  const inputPath = `s3://${bucketName}/${s3Key}`;
  const outputPath = `s3://${bucketName}/transcoded/${fileId}/`;
  
  // Get video metadata to determine which qualities to generate
  const headResult = await s3.send(new HeadObjectCommand({
    Bucket: bucketName,
    Key: s3Key
  }));
  
  const fileSize = headResult.ContentLength;
  
  // Filter presets based on original video size (don't upscale)
  // For simplicity, generate all qualities up to 1080p
  const outputGroups = VIDEO_PRESETS.map(preset => ({
    Name: `HLS ${preset.suffix}`,
    OutputGroupSettings: {
      Type: 'HLS_GROUP_SETTINGS',
      HlsGroupSettings: {
        SegmentLength: 6,
        MinSegmentLength: 0,
        Destination: `${outputPath}${preset.suffix}/`,
        ManifestDurationFormat: 'INTEGER',
        SegmentControl: 'SINGLE_FILE'
      }
    },
    Outputs: [{
      ContainerSettings: {
        Container: 'M3U8',
        M3u8Settings: {
          AudioFramesPerPes: 4,
          PcrControl: 'PCR_EVERY_PES_PACKET',
          PmtPid: 480,
          PrivateMetadataPid: 503,
          ProgramNumber: 1,
          PatInterval: 0,
          PmtInterval: 0,
          VideoPid: 481,
          AudioPids: [482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492]
        }
      },
      VideoDescription: {
        Width: preset.width,
        Height: preset.height,
        ScalingBehavior: 'DEFAULT',
        TimecodeInsertion: 'DISABLED',
        AntiAlias: 'ENABLED',
        Sharpness: 50,
        CodecSettings: {
          Codec: 'H_264',
          H264Settings: {
            InterlaceMode: 'PROGRESSIVE',
            NumberReferenceFrames: 2, // Reduced for faster encoding
            Syntax: 'DEFAULT',
            Softness: 0,
            GopClosedCadence: 1,
            GopSize: 48, // Shorter GOP for better seeking
            Slices: 1,
            GopBReference: 'DISABLED',
            SlowPal: 'DISABLED',
            SpatialAdaptiveQuantization: 'ENABLED',
            TemporalAdaptiveQuantization: 'ENABLED',
            FlickerAdaptiveQuantization: 'DISABLED',
            EntropyEncoding: 'CABAC',
            Bitrate: preset.videoBitrate,
            FramerateControl: 'INITIALIZE_FROM_SOURCE',
            RateControlMode: 'QVBR', // Quality-based VBR is more cost-efficient
            QvbrSettings: {
              QvbrQualityLevel: 7, // Good quality at lower bitrate
              QvbrQualityLevelFineTune: 0
            },
            CodecProfile: 'HIGH', // Better compression
            Telecine: 'NONE',
            MinIInterval: 0,
            AdaptiveQuantization: 'HIGH',
            CodecLevel: 'AUTO',
            FieldEncoding: 'PAFF',
            SceneChangeDetect: 'ENABLED',
            QualityTuningLevel: 'SINGLE_PASS', // Faster, cheaper
            FramerateConversionAlgorithm: 'DUPLICATE_DROP',
            UnregisteredSeiTimecode: 'DISABLED',
            GopSizeUnits: 'FRAMES',
            ParControl: 'INITIALIZE_FROM_SOURCE',
            NumberBFramesBetweenReferenceFrames: 2,
            RepeatPps: 'DISABLED',
            DynamicSubGop: 'ADAPTIVE' // Better compression
          }
        },
        AfdSignaling: 'NONE',
        DropFrameTimecode: 'ENABLED',
        RespondToAfd: 'NONE',
        ColorMetadata: 'INSERT'
      },
      AudioDescriptions: [{
        AudioTypeControl: 'FOLLOW_INPUT',
        CodecSettings: {
          Codec: 'AAC',
          AacSettings: {
            AudioDescriptionBroadcasterMix: 'NORMAL',
            Bitrate: preset.audioBitrate,
            RateControlMode: 'CBR',
            CodecProfile: 'LC',
            CodingMode: 'CODING_MODE_2_0',
            RawFormat: 'NONE',
            SampleRate: 48000,
            Specification: 'MPEG4'
          }
        },
        LanguageCodeControl: 'FOLLOW_INPUT'
      }],
      NameModifier: `_${preset.suffix}`
    }]
  }));

  // Add master manifest output group
  outputGroups.push({
    Name: 'HLS Master Playlist',
    OutputGroupSettings: {
      Type: 'HLS_GROUP_SETTINGS',
      HlsGroupSettings: {
        SegmentLength: 6,
        Destination: `${outputPath}`,
        ManifestDurationFormat: 'INTEGER',
        SegmentControl: 'SINGLE_FILE',
        DirectoryStructure: 'SINGLE_DIRECTORY'
      }
    },
    Outputs: [{
      ContainerSettings: {
        Container: 'M3U8'
      },
      NameModifier: '_master'
    }]
  });

  const jobSettings = {
    OutputGroups: outputGroups,
    Inputs: [{
      FileInput: inputPath,
      AudioSelectors: {
        'Audio Selector 1': {
          Offset: 0,
          DefaultSelection: 'DEFAULT',
          ProgramSelection: 1
        }
      },
      VideoSelector: {
        ColorSpace: 'FOLLOW'
      },
      TimecodeSource: 'ZEROBASED'
    }]
  };

  const params = {
    Role: process.env.MEDIACONVERT_ROLE,
    Settings: jobSettings,
    Queue: process.env.MEDIACONVERT_QUEUE || 'Default',
    UserMetadata: {
      fileId,
      s3Key
    }
  };

  const command = new CreateJobCommand(params);
  const result = await mediaConvert.send(command);
  
  return result.Job;
};

/**
 * Generate HLS master manifest with all quality variants
 */
const generateMasterManifest = (fileId, availableQualities) => {
  let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
  
  availableQualities.forEach(quality => {
    const preset = VIDEO_PRESETS.find(p => p.suffix === quality);
    if (preset) {
      manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${preset.videoBitrate + preset.audioBitrate},RESOLUTION=${preset.width}x${preset.height}\n`;
      manifest += `${quality}/playlist.m3u8\n`;
    }
  });
  
  return manifest;
};

/**
 * Handle S3 upload event - trigger transcoding for videos
 */
exports.handler = async (event) => {
  console.log('Transcode handler invoked:', JSON.stringify(event, null, 2));

  try {
    // Handle S3 event
    if (event.Records && event.Records[0]?.s3) {
      const record = event.Records[0];
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      
      console.log(`Processing S3 upload: ${bucket}/${key}`);

      // Only process video uploads
      if (!key.includes('uploads/video/')) {
        console.log('Not a video upload, skipping');
        return { statusCode: 200, body: 'Not a video' };
      }

      // Extract file ID from key
      const fileId = key.split('/')[2]?.split('.')[0];
      if (!fileId) {
        console.error('Could not extract fileId from key:', key);
        return { statusCode: 400, body: 'Invalid key format' };
      }

      console.log(`Starting transcoding job for file: ${fileId}`);

      // Create transcoding job
      const job = await createTranscodeJob(key, fileId);
      
      console.log(`MediaConvert job created: ${job.Id}`);

      // Store job info in DynamoDB for tracking
      await docClient.send(new UpdateCommand({
        TableName: process.env.APP_TABLE,
        Key: {
          PK: `VIDEO#${fileId}`,
          SK: `TRANSCODE#${job.Id}`
        },
        UpdateExpression: 'SET jobStatus = :status, createdAt = :now, originalKey = :key',
        ExpressionAttributeValues: {
          ':status': 'IN_PROGRESS',
          ':now': new Date().toISOString(),
          ':key': key
        }
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Transcoding job started',
          jobId: job.Id,
          fileId
        })
      };
    }

    // Handle MediaConvert status callback
    if (event.detail && event.detail.status) {
      const { status, jobId, userMetadata, outputGroupDetails } = event.detail;
      const fileId = userMetadata?.fileId;

      console.log(`MediaConvert job ${jobId} status: ${status}`);

      if (status === 'COMPLETE' && fileId) {
        // Generate master manifest
        const qualities = VIDEO_PRESETS.map(p => p.suffix);
        const masterManifest = generateMasterManifest(fileId, qualities);
        
        const bucketName = process.env.MEDIA_BUCKET;
        const manifestKey = `transcoded/${fileId}/master.m3u8`;

        // Upload master manifest to S3
        await s3.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: manifestKey,
          Body: masterManifest,
          ContentType: 'application/vnd.apple.mpegurl',
          CacheControl: 'max-age=3600'
        }));

        const region = process.env.AWS_REGION || 'ap-south-1';
        const hlsManifestUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${manifestKey}`;

        // Update DynamoDB with completed status
        await docClient.send(new UpdateCommand({
          TableName: process.env.APP_TABLE,
          Key: {
            PK: `VIDEO#${fileId}`,
            SK: `TRANSCODE#${jobId}`
          },
          UpdateExpression: 'SET jobStatus = :status, completedAt = :now, hlsManifest = :manifest, qualities = :qualities',
          ExpressionAttributeValues: {
            ':status': 'COMPLETE',
            ':now': new Date().toISOString(),
            ':manifest': hlsManifestUrl,
            ':qualities': qualities
          }
        }));

        console.log(`Transcoding complete. HLS manifest: ${hlsManifestUrl}`);

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Transcoding complete',
            hlsManifest: hlsManifestUrl,
            qualities
          })
        };
      } else if (status === 'ERROR') {
        console.error(`MediaConvert job ${jobId} failed`);
        
        await docClient.send(new UpdateCommand({
          TableName: process.env.APP_TABLE,
          Key: {
            PK: `VIDEO#${fileId}`,
            SK: `TRANSCODE#${jobId}`
          },
          UpdateExpression: 'SET jobStatus = :status, failedAt = :now',
          ExpressionAttributeValues: {
            ':status': 'ERROR',
            ':now': new Date().toISOString()
          }
        }));

        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Transcoding failed' })
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event processed' })
    };

  } catch (error) {
    console.error('Transcoding error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Transcoding error',
        error: error.message
      })
    };
  }
};
