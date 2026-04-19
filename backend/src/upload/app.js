const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');

const s3 = new S3Client({});
const BUCKET_NAME = process.env.MEDIA_BUCKET;

exports.handler = async (event) => {
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;

    // PRESIGN UPLOAD URL - POST /upload/presign
    if (method === "POST" && path === "/upload/presign") {
      const body = JSON.parse(event.body || "{}");
      const { filename, contentType, size, mediaType } = body;

      if (!filename || !contentType) {
        return createResponse(event, 400, { message: "filename and contentType required" });
      }

      // Validate file size (10MB limit)
      if (size && size > 10 * 1024 * 1024) {
        return createResponse(event, 400, { message: "File size must be less than 10MB" });
      }

      const fileId = uuidv4();
      const fileExtension = filename.split('.').pop();
      const s3Key = `uploads/${mediaType || 'files'}/${fileId}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000'
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      return createResponse(event, 200, {
        uploadUrl,
        s3Key,
        fileId
      });
    }

    return createResponse(event, 400, { message: "bad request" });
  } catch (err) {
    console.error("upload error", err);
    return createResponse(event, 500, { message: "internal error", error: err.message });
  }
};
