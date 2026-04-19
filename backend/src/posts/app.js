const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand, QueryCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.APP_TABLE;

// Import shared utilities
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');
const cache = require('./shared/cache');
const { batchGetUsers } = require('./shared/batchUtils');

exports.handler = async (event) => {
  
  // Handle OPTIONS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;
    
    // CREATE POST - POST /posts (global posts)
    if (method === "POST" && (path === "/posts" || path.endsWith("/posts")) && !event.pathParameters) {
      const body = JSON.parse(event.body || "{}");
      const { 
        body: content, 
        media, 
        userId, 
        tags, 
        flair, 
        spoiler,
        audience, // 'global', 'followers', 'group'
        group, // Optional - for posting to specific group
        ogContent // Original post if this is a crosspost
      } = body;

      // At least content or media is required
      if (!content && (!media || media.length === 0)) {
        return createResponse(event, 400, { message: "content or media required" });
      }

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      // Use group from body or default to 'global'
      const postgroup = group || 'global';

      // Validate audience
      const validAudiences = ['global', 'followers', 'group'];
      const postAudience = audience && validAudiences.includes(audience) ? audience : 
                          (postgroup === 'global' ? 'global' : 'group');

      // Validate and structure media array
      const processedMedia = (media || []).map(m => {
        return {
          type: m.type || 'image',
          url: m.url,
          thumbnail: m.thumbnail || m.url,
          metadata: {
            filename: m.metadata?.filename || '',
            size: m.metadata?.size || 0,
            mimeType: m.metadata?.mimeType || '',
            duration: m.metadata?.duration || null,
            dimensions: m.metadata?.dimensions || null,
            qualities: m.metadata?.qualities || null,
            hlsManifest: m.metadata?.hlsManifest || null
          },
          caption: m.caption || ''
        };
      });

      // Determine post type based on content
      let postType = 'text';
      if (processedMedia.length > 0) {
        const hasVideo = processedMedia.some(m => m.type === 'video');
        const hasImage = processedMedia.some(m => m.type === 'image' || m.type === 'gif');
        const hasAudio = processedMedia.some(m => m.type === 'audio');
        const hasDocument = processedMedia.some(m => m.type === 'document');
        
        if (hasVideo) postType = 'video';
        else if (hasImage) postType = 'image';
        else if (hasAudio) postType = 'audio';
        else if (hasDocument) postType = 'link';
      }

      const postId = uuidv4();
      const now = new Date().toISOString();

      const item = {
        PK: `GROUP#${postgroup}`,
        SK: `POST#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `CREATED#${now}`,
        GSI2PK: `USER#${userId}`,
        GSI2SK: `POST#${now}`,
        type: "post",
        postType,
        audience: postAudience,
        postId,
        group: postgroup,
        userId,
        body: content || "",
        media: processedMedia,
        tags: tags || [],
        flair: flair || null,
        spoiler: spoiler || false,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        commentCount: 0,
        viewCount: 0,
        shareCount: 0,
        awardCount: 0,
        status: "active",
        isCrosspost: !!ogContent,
        originalPost: ogContent || null,
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      // Increment post count in group (skip for followers audience)
      if (postAudience !== 'followers') {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: `GROUP#${postgroup}`, SK: "META" },
          UpdateExpression: "ADD postCount :inc SET updatedAt = :now",
          ExpressionAttributeValues: { 
            ":inc": 1,
            ":now": now
          }
        })).catch(() => {}); // Ignore if group doesn't exist
      }

      return createResponse(event, 201, { postId, createdAt: now });
    }
    
    // CREATE POST - POST /communities/{name}/posts
    if (method === "POST" && event.pathParameters && event.pathParameters.name && !path.includes("/search")) {
      const group = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { 
        body: content, 
        media, 
        userId, 
        tags, 
        flair, 
        spoiler,
        audience, // 'global', 'followers', 'group'
        ogContent // Original post if this is a crosspost
      } = body;

      // At least content or media is required
      if (!content && (!media || media.length === 0)) {
        return createResponse(event, 400, { message: "content or media required" });
      }

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      // Validate audience
      const validAudiences = ['global', 'followers', 'group'];
      const postAudience = audience && validAudiences.includes(audience) ? audience : 
                          (group === 'global' ? 'global' : 'group');

      // Validate and structure media array
      const processedMedia = (media || []).map(m => {
        // Each media item should have:
        // { type: 'image|video|gif|audio|document', url: 'S3_URL', thumbnail: 'THUMB_URL', metadata: {...} }
        return {
          type: m.type || 'image', // image, video, gif, audio, document
          url: m.url,
          thumbnail: m.thumbnail || m.url, // Fallback to original for images
          metadata: {
            filename: m.metadata?.filename || '',
            size: m.metadata?.size || 0,
            mimeType: m.metadata?.mimeType || '',
            duration: m.metadata?.duration || null, // For videos/audio
            dimensions: m.metadata?.dimensions || null, // { width, height }
            qualities: m.metadata?.qualities || null, // For videos: ['144p', '240p', '360p', '480p', '720p', '1080p']
            hlsManifest: m.metadata?.hlsManifest || null // HLS manifest URL for videos
          },
          caption: m.caption || '' // Optional caption for each media item
        };
      });

      // Determine post type based on content
      let postType = 'text';
      if (processedMedia.length > 0) {
        const hasVideo = processedMedia.some(m => m.type === 'video');
        const hasImage = processedMedia.some(m => m.type === 'image' || m.type === 'gif');
        const hasAudio = processedMedia.some(m => m.type === 'audio');
        const hasDocument = processedMedia.some(m => m.type === 'document');
        
        if (hasVideo) postType = 'video';
        else if (hasImage) postType = 'image';
        else if (hasAudio) postType = 'audio';
        else if (hasDocument) postType = 'link'; // Documents shown as links
      }

      const postId = uuidv4();
      const now = new Date().toISOString();

      const item = {
        PK: `GROUP#${group}`,
        SK: `POST#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `CREATED#${now}`,
        GSI2PK: `USER#${userId}`, // For user's posts
        GSI2SK: `POST#${now}`,
        type: "post",
        postType, // text, image, video, audio, link
        audience: postAudience, // 'global', 'followers', 'group'
        postId,
        group,
        userId,
        body: content || "",
        media: processedMedia,
        tags: tags || [],
        flair: flair || null,
        spoiler: spoiler || false,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        commentCount: 0,
        viewCount: 0,
        shareCount: 0,
        awardCount: 0,
        status: "active",
        isCrosspost: !!ogContent,
        originalPost: ogContent || null, // { postId, group, title, userId }
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      // Increment post count in group
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${group}`, SK: "META" },
        UpdateExpression: "ADD postCount :inc SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":inc": 1,
          ":now": now
        }
      }));

      return createResponse(event, 201, { postId, createdAt: now });
    }

    // EDIT POST - PUT /posts/{postId}
    if (method === "PUT" && event.pathParameters && event.pathParameters.postId) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, title, body: content, tags } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      // Find post
      const postResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!postResult.Items || postResult.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = postResult.Items[0];

      // Check ownership
      if (post.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      const now = new Date().toISOString();
      const updates = ["updatedAt = :now", "edited = :edited"];
      const values = { ":now": now, ":edited": true };

      if (title) {
        updates.push("title = :title");
        values[":title"] = title;
      }
      if (content !== undefined) {
        updates.push("body = :body");
        values[":body"] = content;
      }
      if (tags) {
        updates.push("tags = :tags");
        values[":tags"] = tags;
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeValues: values
      }));

      return createResponse(event, 200, { message: "post updated", updatedAt: now });
    }

    // DELETE POST - DELETE /posts/{postId}
    if (method === "DELETE" && event.pathParameters && event.pathParameters.postId && !path.includes("/save")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      // Find post
      const postResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!postResult.Items || postResult.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = postResult.Items[0];

      // Check ownership
      if (post.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      const now = new Date().toISOString();

      // Soft delete - clear media array
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "SET #status = :status, body = :body, media = :media, updatedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "deleted",
          ":body": "[deleted]",
          ":media": [],
          ":now": now
        }
      }));

      // Decrement group post count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${post.group}`, SK: "META" },
        UpdateExpression: "ADD postCount :dec SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":dec": -1,
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "post deleted" });
    }

    // LIST POSTS IN group - GET /groups/{name}/posts
    if (method === "GET" && event.pathParameters && event.pathParameters.name && !path.includes("/search")) {
      const group = event.pathParameters.name;
      const limit = parseInt(event.queryStringParameters?.limit || 25);
      const lastKey = event.queryStringParameters?.lastKey;
      const sort = event.queryStringParameters?.sort || "new"; // new, hot, top, controversial
      const userId = event.queryStringParameters?.userId; // Optional - to check membership

      // Check if user is a member, moderator, or owner of this group
      let isMember = false;
      let isOwner = false;
      let isModerator = false;
      if (userId) {
        try {
          // Check ownership
          const groupResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `GROUP#${group}`,
              ":sk": "META"
            },
            Limit: 1
          }));
          
          if (groupResult.Items && groupResult.Items[0]) {
            const groupData = groupResult.Items[0];
            isOwner = (groupData.creatorId === userId || groupData.creator === userId);
          }
          
          // Check membership and moderator status if not owner
          if (!isOwner) {
            const [memberResult, modResult] = await Promise.all([
              ddb.send(new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND SK = :sk",
                ExpressionAttributeValues: {
                  ":pk": `GROUP#${group}`,
                  ":sk": `MEMBER#${userId}`
                },
                Limit: 1
              })),
              ddb.send(new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND SK = :sk",
                ExpressionAttributeValues: {
                  ":pk": `GROUP#${group}`,
                  ":sk": `MODERATOR#${userId}`
                },
                Limit: 1
              }))
            ]);
            isMember = !!(memberResult.Items && memberResult.Items[0]);
            isModerator = !!(modResult.Items && modResult.Items[0] && modResult.Items[0].status === 'active');
          }
        } catch (error) {
          console.error('Error checking membership/ownership:', error);
        }
      }

      const params = {
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { 
          ":pk": `GROUP#${group}`,
          ":sk": "POST#"
        },
        Limit: limit * 2, // Get more to filter
        ScanIndexForward: false
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));
      let items = (result.Items || []).filter(item => {
        // Only show active posts
        if (item.status !== "active") return false;
        
        // If user is owner, moderator, or member, show all posts
        if (isOwner || isModerator || isMember) return true;
        
        // If user is NOT a member/owner/moderator, only show posts with audience='global'
        return item.audience === 'global';
      });

      // Sorting algorithms
      if (sort === "hot") {
        items = items.sort((a, b) => {
          const aHot = a.score / Math.pow((Date.now() - new Date(a.createdAt).getTime()) / 3600000 + 2, 1.5);
          const bHot = b.score / Math.pow((Date.now() - new Date(b.createdAt).getTime()) / 3600000 + 2, 1.5);
          return bHot - aHot;
        });
      } else if (sort === "top") {
        items = items.sort((a, b) => b.score - a.score);
      } else if (sort === "controversial") {
        items = items.sort((a, b) => {
          const aControversy = Math.min(a.upvotes, a.downvotes) * (a.upvotes + a.downvotes);
          const bControversy = Math.min(b.upvotes, b.downvotes) * (b.upvotes + b.downvotes);
          return bControversy - aControversy;
        });
      }

      // Limit to requested amount after filtering
      items = items.slice(0, limit);

      // Enrich with group displayName
      if (items.length > 0) {
        try {
          const groupResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `GROUP#${group}`,
              ":sk": "META"
            },
            Limit: 1
          }));
          
          if (groupResult.Items && groupResult.Items[0]) {
            const groupData = groupResult.Items[0];
            items = items.map(post => ({
              ...post,
              groupDisplayName: groupData.displayName || group
            }));
          }
        } catch (error) {
          console.error('Error fetching group data:', error);
        }
      }

      // Enrich with user data
      const userIds = [...new Set(items.map(p => p.userId))];
      const userDataMap = new Map();
      
      if (userIds.length > 0) {
        const userPromises = userIds.map(async (uid) => {
          try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
            
            let userResult;
            if (!isUuid) {
              userResult = await ddb.send(new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND SK = :sk",
                ExpressionAttributeValues: {
                  ":pk": `USER#${uid}`,
                  ":sk": "PROFILE"
                },
                Limit: 1
              }));
            }
            
            if (!userResult || !userResult.Items || userResult.Items.length === 0) {
              userResult = await ddb.send(new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
                ExpressionAttributeValues: {
                  ":pk": `USERID#${uid}`,
                  ":sk": "PROFILE"
                },
                Limit: 1
              }));
            }

            return { uid, result: userResult };
          } catch (error) {
            console.error(`Error fetching user ${uid}:`, error);
            return { uid, result: { Items: [] } };
          }
        });

        const userResults = await Promise.all(userPromises);
        userResults.forEach(({ uid, result }) => {
          if (result.Items && result.Items[0]) {
            const user = result.Items[0];
            userDataMap.set(uid, {
              username: user.username || uid,
              avatar: user.avatar || null,
              displayName: user.displayName || user.username || uid
            });
          }
        });
      }

      items = items.map(post => {
        const userData = userDataMap.get(post.userId) || {};
        return {
          ...post,
          username: userData.username,
          userAvatar: userData.avatar,
          userDisplayName: userData.displayName
        };
      });

      return createResponse(event, 200, {
          posts: items,
          lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
        });
    }

    // GET SINGLE POST - GET /posts/{postId}
    if (method === "GET" && path.includes("/posts/") && event.pathParameters && event.pathParameters.postId && !path.includes("/vote")) {
      const postId = event.pathParameters.postId;
      const userId = event.queryStringParameters?.userId; // Optional for user-specific data

      const params = {
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` }
      };

      const result = await ddb.send(new QueryCommand(params));
      const item = (result.Items && result.Items[0]) || null;
      
      if (!item) {
        return createResponse(event, 404, { message: "Post not found" });
      }

      // Check visibility permissions based on audience
      // NOTE: All groups are PUBLIC (anyone can join/view the group)
      // Posts have audience: 'global' (everyone) or 'group' (members only)
      const postAudience = item.audience || 'global'; // global, group, followers
      const postGroup = item.group || item.PK?.replace('GROUP#', '');
      let hasAccess = false;

      // Check if post is in a group (not 'global' profile posts)
      if (postGroup && postGroup !== 'global') {
        // Post is in a group - check post.audience
        if (postAudience === 'global') {
          // PUBLIC post in group = Everyone can see (even non-members)
          hasAccess = true;
        } else if (postAudience === 'group') {
          // PRIVATE post in group = Only group members/moderators/owners can see
          if (!userId) {
            return createResponse(event, 403, { message: "This post is only visible to group members. Please log in." });
          }
          
          try {
            // Check if user is owner
            const groupResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              KeyConditionExpression: "PK = :pk AND SK = :sk",
              ExpressionAttributeValues: {
                ":pk": `GROUP#${postGroup}`,
                ":sk": "META"
              },
              Limit: 1
            }));
            
            if (groupResult.Items && groupResult.Items[0]) {
              const groupData = groupResult.Items[0];
              const isOwner = (groupData.creatorId === userId || groupData.creator === userId);
              if (isOwner) {
                hasAccess = true;
              }
            }
            
            // Check membership and moderator status if not owner
            if (!hasAccess) {
              const [memberResult, modResult] = await Promise.all([
                ddb.send(new QueryCommand({
                  TableName: TABLE,
                  KeyConditionExpression: "PK = :pk AND SK = :sk",
                  ExpressionAttributeValues: {
                    ":pk": `GROUP#${postGroup}`,
                    ":sk": `MEMBER#${userId}`
                  },
                  Limit: 1
                })),
                ddb.send(new QueryCommand({
                  TableName: TABLE,
                  KeyConditionExpression: "PK = :pk AND SK = :sk",
                  ExpressionAttributeValues: {
                    ":pk": `GROUP#${postGroup}`,
                    ":sk": `MODERATOR#${userId}`
                  },
                  Limit: 1
                }))
              ]);
              const isMember = !!(memberResult.Items && memberResult.Items[0]);
              const isModerator = !!(modResult.Items && modResult.Items[0] && modResult.Items[0].status === 'active');
              hasAccess = isMember || isModerator;
            }
            
            if (!hasAccess) {
              return createResponse(event, 403, { message: "This post is only visible to group members. Join the group to view." });
            }
          } catch (error) {
            console.error('Error checking group membership:', error);
            hasAccess = false;
          }
        } else {
          // Invalid audience for group post
          hasAccess = true;
        }
      } 
      // Profile posts (not in a group)
      else if (postAudience === 'global') {
        // Global profile posts are visible to everyone
        hasAccess = true;
      } else if (postAudience === 'followers') {
        // Followers-only posts - check if user follows the author or is the author
        if (!userId) {
          return createResponse(event, 403, { message: "This post is only visible to followers" });
        }
        
        if (userId === item.userId) {
          // User is the author
          hasAccess = true;
        } else {
          // Check if user follows the author
          try {
            const followResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              KeyConditionExpression: "PK = :pk AND SK = :sk",
              ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":sk": `FOLLOWING#${item.userId}`
              },
              Limit: 1
            }));
            hasAccess = !!(followResult.Items && followResult.Items[0]);
          } catch (error) {
            console.error('Error checking follow status:', error);
            hasAccess = false;
          }
        }
      }

      if (!hasAccess) {
        return createResponse(event, 403, { message: "You don't have access to view this post" });
      }

      // Increment view count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: "ADD viewCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      item.viewCount = (item.viewCount || 0) + 1;

      // Enrich with user data
      let enrichedPost = { ...item };
      
      if (item.userId) {
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.userId);
          
          let userResult;
          if (!isUuid) {
            // Try username lookup
            userResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              KeyConditionExpression: "PK = :pk AND SK = :sk",
              ExpressionAttributeValues: {
                ":pk": `USER#${item.userId}`,
                ":sk": "PROFILE"
              },
              Limit: 1
            }));
          }
          
          if (!userResult || !userResult.Items || userResult.Items.length === 0) {
            // Use GSI1 to query by userId (UUID)
            userResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              IndexName: "GSI1",
              KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
              ExpressionAttributeValues: {
                ":pk": `USERID#${item.userId}`,
                ":sk": "PROFILE"
              },
              Limit: 1
            }));
          }

          if (userResult.Items && userResult.Items[0]) {
            const user = userResult.Items[0];
            enrichedPost.username = user.username || item.userId;
            enrichedPost.userAvatar = user.avatar || null;
            enrichedPost.userDisplayName = user.displayName || user.username || item.userId;
          }
        } catch (error) {
          console.error(`Error fetching user ${item.userId}:`, error);
        }
      }

      // Get user-specific data if userId provided
      if (userId) {
        try {
          // Get user's vote
          const voteResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": `VOTE#${postId}`
            },
            Limit: 1
          }));

          if (voteResult.Items && voteResult.Items[0]) {
            enrichedPost.userVoteStatus = voteResult.Items[0].vote;
          } else {
            enrichedPost.userVoteStatus = 0;
          }

          // Get user's save status
          const saveResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": `SAVED#${postId}`
            },
            Limit: 1
          }));

          enrichedPost.userSaved = !!(saveResult.Items && saveResult.Items[0]);
        } catch (error) {
          console.error(`Error fetching user-specific data:`, error);
        }
      }

      return createResponse(event, 200, { post: enrichedPost });
    }

    // UNIFIED FEED API - GET /posts
    // Supports: New (Global), Trending (Global), Following (Users + Communities)
    if (method === "GET" && (path === "/posts" || path.endsWith("/posts")) && !event.pathParameters && !path.includes("/search") && !path.includes("/trending")) {
      const feedType = event.queryStringParameters?.feedType || "new"; // new, trending, following
      const limit = parseInt(event.queryStringParameters?.limit || 25);
      const lastKey = event.queryStringParameters?.lastKey;
      const userId = event.queryStringParameters?.userId; // Required for 'following' feed

      const now = Date.now();
      let posts = [];

      // FOLLOWING FEED - Posts from followed users + joined communities
      if (feedType === "following") {
        if (!userId) {
          return createResponse(event, 400, { message: "userId required for following feed" });
        }

        // Get users that this user follows
        const followingResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "FOLLOWING#"
          }
        }));

        const followingUserIds = (followingResult.Items || []).map(f => f.followingId);

        // Get communities user is member of
        const membershipResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "MEMBER#"
          }
        }));

        const joinedCommunities = (membershipResult.Items || []).map(m => m.group);

        // Fetch posts from followed users using GSI2
        let userPosts = [];
        if (followingUserIds.length > 0) {
          const userPostPromises = followingUserIds.map(uid => 
            ddb.send(new QueryCommand({
              TableName: TABLE,
              IndexName: "GSI2",
              KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :sk)",
              FilterExpression: "#status = :status",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":pk": `USER#${uid}`,
                ":sk": "POST#",
                ":status": "active"
              },
              Limit: 50,
              ScanIndexForward: false
            }))
          );
          const userPostResults = await Promise.all(userPostPromises);
          userPosts = userPostResults.flatMap(r => r.Items || []);
        }

        // Fetch posts from joined communities
        let groupPosts = [];
        if (joinedCommunities.length > 0) {
          const groupPostPromises = joinedCommunities.map(comm => 
            ddb.send(new QueryCommand({
              TableName: TABLE,
              KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
              FilterExpression: "#status = :status",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":pk": `GROUP#${comm}`,
                ":sk": "POST#",
                ":status": "active"
              },
              Limit: 50,
              ScanIndexForward: false
            }))
          );
          const groupPostResults = await Promise.all(groupPostPromises);
          groupPosts = groupPostResults.flatMap(r => r.Items || []);
        }

        // Combine and deduplicate
        const postMap = new Map();
        [...userPosts, ...groupPosts].forEach(p => postMap.set(p.postId, p));
        posts = Array.from(postMap.values());

        if (posts.length === 0) {
          return createResponse(event, 200, { 
            posts: [], 
            count: 0,
            message: "Follow users or join communities to see posts" 
          });
        }

      } else {
        // NEW & TRENDING FEEDS - Query global group posts
        const params = {
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          FilterExpression: "#status = :status AND #audience = :audience",
          ExpressionAttributeNames: {
            "#status": "status",
            "#audience": "audience"
          },
          ExpressionAttributeValues: {
            ":pk": "GROUP#global",
            ":sk": "POST#",
            ":status": "active",
            ":audience": "global"
          },
          Limit: limit * 2,
          ScanIndexForward: false
        };

        if (lastKey) {
          params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
        }

        const result = await ddb.send(new QueryCommand(params));
        posts = result.Items || [];
      }

      // Apply sorting based on feed type
      if (feedType === "new" || feedType === "following") {
        posts = posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (feedType === "trending") {
        posts = posts.map(post => ({
          ...post,
          trendScore: (post.score + post.commentCount * 2 + post.viewCount * 0.1) / 
                     Math.pow((now - new Date(post.createdAt).getTime()) / 3600000 + 2, 1.5)
        })).sort((a, b) => b.trendScore - a.trendScore);
      }

      // Limit results
      posts = posts.slice(0, limit);

      // Enrich posts with author information (username and avatar)
      const userIds = [...new Set(posts.map(p => p.userId))];
      const userDataMap = new Map();
      
      if (userIds.length > 0) {
        // Query users by userId (UUID) using GSI1
        const userPromises = userIds.map(async (uid) => {
          try {
            // First try direct lookup if uid looks like a username (not a UUID)
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
            
            if (!isUuid) {
              // Try username lookup
              const userResult = await ddb.send(new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND SK = :sk",
                ExpressionAttributeValues: {
                  ":pk": `USER#${uid}`,
                  ":sk": "PROFILE"
                },
                Limit: 1
              }));
              
              if (userResult.Items && userResult.Items[0]) {
                return { uid, result: userResult };
              }
            }
            
            // Use GSI1 to query by userId (UUID)
            const userResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              IndexName: "GSI1",
              KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
              ExpressionAttributeValues: {
                ":pk": `USERID#${uid}`,
                ":sk": "PROFILE"
              },
              Limit: 1
            }));
            
            return { uid, result: userResult };
          } catch (error) {
            console.error(`Error fetching user ${uid}:`, error);
            return { uid, result: { Items: [] } };
          }
        });

        const userResults = await Promise.all(userPromises);
        userResults.forEach(({ uid, result }) => {
          if (result.Items && result.Items[0]) {
            const user = result.Items[0];
            userDataMap.set(uid, {
              username: user.username || uid,
              avatar: user.avatar || null,
              displayName: user.displayName || user.username || uid
            });
          } else {
            // Fallback if user not found
            userDataMap.set(uid, {
              username: uid,
              avatar: null,
              displayName: uid
            });
          }
        });
      }

      // Enrich posts with user-specific data if userId provided
      if (userId) {
        const postIds = posts.map(p => p.postId);
        
        // Get user votes
        const votePromises = postIds.map(id => 
          ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": `VOTE#${id}`
            },
            Limit: 1
          }))
        );

        // Get user saves
        const savePromises = postIds.map(id => 
          ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": `SAVED#${id}`
            },
            Limit: 1
          }))
        );

        const [voteResults, saveResults] = await Promise.all([
          Promise.all(votePromises),
          Promise.all(savePromises)
        ]);

        // Create maps for quick lookup
        const voteMap = new Map();
        voteResults.forEach((result, index) => {
          if (result.Items && result.Items[0]) {
            voteMap.set(postIds[index], result.Items[0].vote);
          }
        });

        const saveMap = new Map();
        saveResults.forEach((result, index) => {
          if (result.Items && result.Items[0]) {
            saveMap.set(postIds[index], true);
          }
        });

        // Enrich posts
        posts = posts.map(post => {
          const userData = userDataMap.get(post.userId) || {};
          return {
            ...post,
            username: userData.username,
            userAvatar: userData.avatar,
            userDisplayName: userData.displayName,
            userVoteStatus: voteMap.get(post.postId) || 0,
            userSaved: saveMap.get(post.postId) || false
          };
        });
      } else {
        // Even without userId, enrich with author data
        posts = posts.map(post => {
          const userData = userDataMap.get(post.userId) || {};
          return {
            ...post,
            username: userData.username,
            userAvatar: userData.avatar,
            userDisplayName: userData.displayName
          };
        });
      }

      return createResponse(event, 200, {
          posts,
          count: posts.length,
          feedType
        });
    }

    // VOTE ON POST - POST /posts/{postId}/vote
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/vote")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, vote } = body; // vote: 1 (upvote), -1 (downvote), 0 (remove vote)

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      if (vote !== 1 && vote !== -1 && vote !== 0) {
        return createResponse(event, 400, { message: "vote must be 1, -1, or 0" });
      }

      // Find the post to get PK and SK
      const postResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!postResult.Items || postResult.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = postResult.Items[0];

      // Check if user already voted
      const existingVoteResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND SK = :sk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": `VOTE#${postId}`
        },
        Limit: 1
      }));

      const existingVote = (existingVoteResult.Items && existingVoteResult.Items[0]) || null;
      const oldVote = existingVote ? existingVote.vote : 0;

      // Calculate score change
      let scoreDelta = vote - oldVote;
      let upvotesDelta = 0;
      let downvotesDelta = 0;

      if (oldVote === 1 && vote !== 1) upvotesDelta = -1;
      if (oldVote === -1 && vote !== -1) downvotesDelta = -1;
      if (vote === 1 && oldVote !== 1) upvotesDelta = 1;
      if (vote === -1 && oldVote !== -1) downvotesDelta = 1;

      const now = new Date().toISOString();

      if (vote === 0) {
        // Remove vote
        if (existingVote) {
          await ddb.send(new DeleteCommand({
            TableName: TABLE,
            Key: { PK: `USER#${userId}`, SK: `VOTE#${postId}` }
          }));
        }
      } else {
        // Add or update vote
        const voteItem = {
          PK: `USER#${userId}`,
          SK: `VOTE#${postId}`,
          GSI1PK: `POST#${postId}`,
          GSI1SK: `VOTE#${userId}`,
          type: "vote",
          userId,
          postId,
          vote, // 1 or -1
          votedAt: now
        };

        await ddb.send(new PutCommand({ TableName: TABLE, Item: voteItem }));
      }

      // Update post score
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "ADD score :score, upvotes :up, downvotes :down SET updatedAt = :now",
        ExpressionAttributeValues: {
          ":score": scoreDelta,
          ":up": upvotesDelta,
          ":down": downvotesDelta,
          ":now": now
        }
      }));

      const newScore = (post.score || 0) + scoreDelta;

      return createResponse(event, 200, { 
          message: "vote recorded", 
          score: newScore,
          userVoteStatus: vote
        });
    }

    // SAVE POST - POST /posts/{postId}/save
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/save")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      console.log('SAVE POST:', { postId, userId });

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const now = new Date().toISOString();

      const saveItem = {
        PK: `USER#${userId}`,
        SK: `SAVED#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `SAVED#${now}`,
        type: "saved",
        userId,
        postId,
        savedAt: now
      };

      console.log('Saving item:', saveItem);
      await ddb.send(new PutCommand({ TableName: TABLE, Item: saveItem }));
      console.log('Save successful');

      return createResponse(event, 200, { message: "post saved" });
    }

    // UNSAVE POST - DELETE /posts/{postId}/save
    if (method === "DELETE" && event.pathParameters && event.pathParameters.postId && path.includes("/save")) {
      const userId = event.queryStringParameters?.userId;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `SAVED#${postId}` }
      }));

      return createResponse(event, 200, { message: "post unsaved" });
    }



    // HIDE POST - POST /posts/{postId}/hide
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/hide") && !path.includes("/unhide")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const now = new Date().toISOString();

      const hideItem = {
        PK: `USER#${userId}`,
        SK: `HIDDEN#${postId}`,
        type: "hidden",
        userId,
        postId,
        hiddenAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: hideItem }));

      return createResponse(event, 200, { message: "post hidden" });
    }

    // UNHIDE POST - POST /posts/{postId}/unhide
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/unhide")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `HIDDEN#${postId}` }
      }));

      return createResponse(event, 200, { message: "post unhidden" });
    }

    // AWARD POST - POST /posts/{postId}/award
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/award")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, awardType, isAnonymous } = body;

      if (!userId || !awardType) {
        return createResponse(event, 400, { message: "userId and awardType required" });
      }

      const awardId = uuidv4();
      const now = new Date().toISOString();

      const award = {
        PK: `POST#${postId}`,
        SK: `AWARD#${awardId}`,
        GSI1PK: `AWARD#${awardId}`,
        GSI1SK: `CREATED#${now}`,
        type: "award",
        awardId,
        postId,
        givenBy: isAnonymous ? "anonymous" : userId,
        awardType, // silver, gold, platinum, custom
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: award }));

      // Increment award count on post
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${postId.split('#')[0]}`, SK: `POST#${postId}` },
        UpdateExpression: "ADD awardCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      return createResponse(event, 200, { awardId, message: "award given" });
    }

    // SET POST FLAIR - PUT /posts/{postId}/flair
    if (method === "PUT" && event.pathParameters && event.pathParameters.postId && path.includes("/flair")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, flairId, flairText } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = result.Items[0];

      if (post.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "SET flairId = :flairId, flairText = :flairText, updatedAt = :now",
        ExpressionAttributeValues: {
          ":flairId": flairId || null,
          ":flairText": flairText || null,
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "flair updated" });
    }

    // CROSSPOST - POST /posts/{postId}/crosspost
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/crosspost")) {
      const originalPostId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, group, title } = body;

      if (!userId || !group || !title) {
        return createResponse(event, 400, { message: "userId, group, and title required" });
      }

      const postId = uuidv4();
      const now = new Date().toISOString();

      const crosspost = {
        PK: `GROUP#${group}`,
        SK: `POST#${postId}`,
        GSI1PK: `POST#${postId}`,
        GSI1SK: `CREATED#${now}`,
        type: "post",
        postId,
        group,
        userId,
        title,
        isCrosspost: true,
        originalPostId,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        commentCount: 0,
        viewCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: crosspost }));

      return createResponse(event, 201, { postId, message: "crossposted successfully" });
    }

    // GET POST MEDIA - GET /posts/{postId}/media
    if (method === "GET" && event.pathParameters && event.pathParameters.postId && path.includes("/media")) {
      const postId = event.pathParameters.postId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = result.Items[0];
      return createResponse(event, 200, { 
          postId, 
          postType: post.postType,
          media: post.media || [],
          spoiler: post.spoiler || false
        });
    }

    // TRACK MEDIA VIEW - POST /posts/{postId}/media/view
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/media/view")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, mediaIndex, duration } = body; // duration = seconds watched for videos

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = result.Items[0];

      // Track view analytics
      const viewId = uuidv4();
      const now = new Date().toISOString();

      const viewRecord = {
        PK: `POST#${postId}`,
        SK: `VIEW#${viewId}`,
        type: "media_view",
        userId: userId || 'anonymous',
        mediaIndex: mediaIndex || 0,
        duration: duration || 0,
        timestamp: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: viewRecord }));

      // Increment view count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "ADD viewCount :inc",
        ExpressionAttributeValues: { ":inc": 1 }
      }));

      return createResponse(event, 200, { message: "view tracked" });
    }

    // UPDATE POST MEDIA - PUT /posts/{postId}/media
    if (method === "PUT" && event.pathParameters && event.pathParameters.postId && path.includes("/media")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, media } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return createResponse(event, 404, { message: "post not found" });
      }

      const post = result.Items[0];

      if (post.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      // Process new media
      const processedMedia = (media || []).map(m => ({
        type: m.type || 'image',
        url: m.url,
        thumbnail: m.thumbnail || m.url,
        metadata: {
          filename: m.metadata?.filename || '',
          size: m.metadata?.size || 0,
          mimeType: m.metadata?.mimeType || '',
          duration: m.metadata?.duration || null,
          dimensions: m.metadata?.dimensions || null,
          qualities: m.metadata?.qualities || null,
          hlsManifest: m.metadata?.hlsManifest || null
        },
        caption: m.caption || ''
      }));

      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: post.PK, SK: post.SK },
        UpdateExpression: "SET media = :media, updatedAt = :now",
        ExpressionAttributeValues: {
          ":media": processedMedia,
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "media updated" });
    }

    return createResponse(event, 400, { message: "bad request" });
  } catch (err) {
    console.error("posts error", err);
    return createResponse(event, 500, { message: "internal error", error: err.message });
  }
};
