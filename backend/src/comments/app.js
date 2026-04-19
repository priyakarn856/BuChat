const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');
const cache = require('./shared/cache');
const { batchGetUsers } = require('./shared/batchUtils');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.APP_TABLE;

exports.handler = async (event) => {
  
  // Handle OPTIONS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;

    // CREATE COMMENT - POST /posts/{postId}/comments
    if (method === "POST" && event.pathParameters && event.pathParameters.postId && path.includes("/posts/")) {
      const postId = event.pathParameters.postId;
      const body = JSON.parse(event.body || "{}");
      const { userId, body: commentBody, parentCommentId } = body;

      if (!userId || !commentBody) {
        return createResponse(event, 400, { message: "userId and body required" });
      }

      const commentId = uuidv4();
      const now = new Date().toISOString();

      // Determine depth and path for nested comments
      let depth = 0;
      let commentPath = commentId;

      if (parentCommentId) {
        // Get parent comment to determine depth
        const parentResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: { ":pk": `COMMENT#${parentCommentId}` },
          Limit: 1
        }));

        if (parentResult.Items && parentResult.Items.length > 0) {
          const parent = parentResult.Items[0];
          depth = (parent.depth || 0) + 1;
          commentPath = `${parent.commentPath}/${commentId}`;
        }
      }

      const item = {
        PK: `POST#${postId}`,
        SK: `COMMENT#${commentId}`,
        GSI1PK: `COMMENT#${commentId}`,
        GSI1SK: `CREATED#${now}`,
        type: "comment",
        commentId,
        postId,
        userId,
        body: commentBody,
        parentCommentId: parentCommentId || null,
        depth,
        commentPath,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        replyCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      // Increment comment count on post
      const postResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `POST#${postId}` },
        Limit: 1
      }));

      if (postResult.Items && postResult.Items.length > 0) {
        const post = postResult.Items[0];
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: post.PK, SK: post.SK },
          UpdateExpression: "ADD commentCount :inc SET updatedAt = :now",
          ExpressionAttributeValues: { 
            ":inc": 1,
            ":now": now
          }
        }));
      }

      // If reply, increment reply count on parent comment
      if (parentCommentId) {
        const parentResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: { ":pk": `COMMENT#${parentCommentId}` },
          Limit: 1
        }));

        if (parentResult.Items && parentResult.Items.length > 0) {
          const parent = parentResult.Items[0];
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: parent.PK, SK: parent.SK },
            UpdateExpression: "ADD replyCount :inc SET updatedAt = :now",
            ExpressionAttributeValues: { 
              ":inc": 1,
              ":now": now
            }
          }));
        }
      }

      return createResponse(event, 201, { 
          commentId, 
          createdAt: now,
          depth,
          parentCommentId: parentCommentId || null
        });
    }

    // GET COMMENTS FOR POST - GET /posts/{postId}/comments
    if (method === "GET" && event.pathParameters && event.pathParameters.postId && path.includes("/posts/")) {
      const postId = event.pathParameters.postId;
      const limit = event.queryStringParameters?.limit || 50;
      const sort = event.queryStringParameters?.sort || "best"; // best, new, top, controversial
      const lastKey = event.queryStringParameters?.lastKey;

      const params = {
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { 
          ":pk": `POST#${postId}`,
          ":sk": "COMMENT#"
        },
        Limit: parseInt(limit)
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));
      let comments = result.Items || [];

      // Sort comments
      if (sort === "best") {
        comments = comments.sort((a, b) => {
          const aScore = (a.upvotes + 1) / (a.upvotes + a.downvotes + 1);
          const bScore = (b.upvotes + 1) / (b.upvotes + b.downvotes + 1);
          return bScore - aScore;
        });
      } else if (sort === "new") {
        comments = comments.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else if (sort === "top") {
        comments = comments.sort((a, b) => b.score - a.score);
      } else if (sort === "controversial") {
        comments = comments.sort((a, b) => {
          const aControversy = Math.min(a.upvotes, a.downvotes);
          const bControversy = Math.min(b.upvotes, b.downvotes);
          return bControversy - aControversy;
        });
      }

      // Return flat list with parentCommentId for frontend tree building
      return createResponse(event, 200, {
        comments: comments,
        count: comments.length,
        lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
      });
    }

    // GET SINGLE COMMENT - GET /comments/{commentId}
    if (method === "GET" && event.pathParameters && event.pathParameters.commentId && path.includes("/comments/") && !path.includes("/vote")) {
      const commentId = event.pathParameters.commentId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` }
      }));

      const comment = result.Items && result.Items[0];
      if (!comment) {
        return createResponse(event, 404, { message: "comment not found" });
      }

      return createResponse(event, 200, comment);
    }

    // UPDATE COMMENT - PUT /comments/{commentId}
    if (method === "PUT" && event.pathParameters && event.pathParameters.commentId) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId, body: newBody } = body;

      if (!userId || !newBody) {
        return createResponse(event, 400, { message: "userId and body required" });
      }

      // Get comment to verify ownership
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` }
      }));

      const comment = result.Items && result.Items[0];
      if (!comment) {
        return createResponse(event, 404, { message: "comment not found" });
      }

      if (comment.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: comment.PK, SK: comment.SK },
        UpdateExpression: "SET body = :body, updatedAt = :now, edited = :edited",
        ExpressionAttributeValues: {
          ":body": newBody,
          ":now": now,
          ":edited": true
        }
      }));

      return createResponse(event, 200, { message: "comment updated", updatedAt: now });
    }

    // DELETE COMMENT - DELETE /comments/{commentId}
    if (method === "DELETE" && event.pathParameters && event.pathParameters.commentId) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      // Get comment to verify ownership
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` }
      }));

      const comment = result.Items && result.Items[0];
      if (!comment) {
        return createResponse(event, 404, { message: "comment not found" });
      }

      if (comment.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      const now = new Date().toISOString();

      // Soft delete - mark as deleted instead of removing
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: comment.PK, SK: comment.SK },
        UpdateExpression: "SET status = :status, body = :body, updatedAt = :now",
        ExpressionAttributeValues: {
          ":status": "deleted",
          ":body": "[deleted]",
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "comment deleted" });
    }

    // AWARD COMMENT - POST /comments/{commentId}/award
    if (method === "POST" && event.pathParameters && event.pathParameters.commentId && path.includes("/award")) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId, awardType, isAnonymous } = body;

      if (!userId || !awardType) {
        return createResponse(event, 400, { message: "userId and awardType required" });
      }

      const awardId = uuidv4();
      const now = new Date().toISOString();

      const award = {
        PK: `COMMENT#${commentId}`,
        SK: `AWARD#${awardId}`,
        GSI1PK: `AWARD#${awardId}`,
        GSI1SK: `CREATED#${now}`,
        type: "award",
        awardId,
        commentId,
        givenBy: isAnonymous ? "anonymous" : userId,
        awardType,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: award }));

      // Increment award count on comment
      const commentResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` },
        Limit: 1
      }));

      if (commentResult.Items && commentResult.Items.length > 0) {
        const comment = commentResult.Items[0];
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: comment.PK, SK: comment.SK },
          UpdateExpression: "ADD awardCount :inc",
          ExpressionAttributeValues: { ":inc": 1 }
        }));
      }

      return createResponse(event, 200, { awardId, message: "award given" });
    }

    // DISTINGUISH COMMENT (Moderator/Admin) - POST /comments/{commentId}/distinguish
    if (method === "POST" && event.pathParameters && event.pathParameters.commentId && path.includes("/distinguish")) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId, distinguishType } = body; // mod, admin, special

      if (!userId || !distinguishType) {
        return createResponse(event, 400, { message: "userId and distinguishType required" });
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return createResponse(event, 404, { message: "comment not found" });
      }

      const comment = result.Items[0];

      if (comment.userId !== userId) {
        return createResponse(event, 403, { message: "not authorized" });
      }

      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: comment.PK, SK: comment.SK },
        UpdateExpression: "SET distinguished = :dist, updatedAt = :now",
        ExpressionAttributeValues: {
          ":dist": distinguishType,
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "comment distinguished" });
    }

    // SAVE COMMENT - POST /comments/{commentId}/save
    if (method === "POST" && event.pathParameters && event.pathParameters.commentId && path.includes("/save")) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const now = new Date().toISOString();

      const saveItem = {
        PK: `USER#${userId}`,
        SK: `SAVED_COMMENT#${commentId}`,
        type: "saved_comment",
        userId,
        commentId,
        savedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: saveItem }));

      return createResponse(event, 200, { message: "comment saved" });
    }

    // UNSAVE COMMENT - DELETE /comments/{commentId}/save
    if (method === "DELETE" && event.pathParameters && event.pathParameters.commentId && path.includes("/save")) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `SAVED_COMMENT#${commentId}` }
      }));

      return createResponse(event, 200, { message: "comment unsaved" });
    }

    // ADD/TOGGLE REACTION - POST /comments/{commentId}/reactions
    if (method === "POST" && event.pathParameters && event.pathParameters.commentId && path.includes("/reactions")) {
      const commentId = event.pathParameters.commentId;
      const body = JSON.parse(event.body || "{}");
      const { userId, reactionType } = body;

      // Supported reactions: like, love, laugh, wow, sad, angry
      const validReactions = ['like', 'love', 'laugh', 'wow', 'sad', 'angry'];

      if (!userId || !reactionType) {
        return createResponse(event, 400, { message: "userId and reactionType required" });
      }

      if (!validReactions.includes(reactionType)) {
        return createResponse(event, 400, { message: "invalid reaction type" });
      }

      // Get comment first
      const commentResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `COMMENT#${commentId}` },
        Limit: 1
      }));

      if (!commentResult.Items || commentResult.Items.length === 0) {
        return createResponse(event, 404, { message: "comment not found" });
      }

      const comment = commentResult.Items[0];
      const now = new Date().toISOString();

      // Check for existing reaction from this user
      const existingReaction = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { 
          PK: `COMMENT#${commentId}`, 
          SK: `REACTION#${userId}` 
        }
      }));

      const previousReaction = existingReaction.Item?.reactionType;

      // If same reaction, remove it (toggle off)
      if (previousReaction === reactionType) {
        await ddb.send(new DeleteCommand({
          TableName: TABLE,
          Key: { PK: `COMMENT#${commentId}`, SK: `REACTION#${userId}` }
        }));

        // Decrement reaction count on comment
        const reactionField = `reactions_${previousReaction}`;
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: comment.PK, SK: comment.SK },
          UpdateExpression: `ADD ${reactionField} :dec, totalReactions :dec SET updatedAt = :now`,
          ExpressionAttributeValues: {
            ":dec": -1,
            ":now": now
          }
        }));

        return createResponse(event, 200, { message: "reaction removed", reactionType: null });
      }

      // If different reaction, update it
      if (previousReaction) {
        // Decrement old reaction count
        const oldField = `reactions_${previousReaction}`;
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: comment.PK, SK: comment.SK },
          UpdateExpression: `ADD ${oldField} :dec SET updatedAt = :now`,
          ExpressionAttributeValues: {
            ":dec": -1,
            ":now": now
          }
        }));
      }

      // Store new reaction
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `COMMENT#${commentId}`,
          SK: `REACTION#${userId}`,
          GSI1PK: `USER#${userId}`,
          GSI1SK: `REACTION#${now}`,
          type: "comment_reaction",
          commentId,
          userId,
          reactionType,
          createdAt: now
        }
      }));

      // Increment new reaction count
      const newField = `reactions_${reactionType}`;
      const addTotal = previousReaction ? 0 : 1; // Only add to total if new reaction
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: comment.PK, SK: comment.SK },
        UpdateExpression: `ADD ${newField} :inc, totalReactions :addTotal SET updatedAt = :now`,
        ExpressionAttributeValues: {
          ":inc": 1,
          ":addTotal": addTotal,
          ":now": now
        }
      }));

      return createResponse(event, 200, { 
        message: "reaction added",
        reactionType,
        previousReaction: previousReaction || null
      });
    }

    // GET USER'S REACTION ON COMMENT - GET /comments/{commentId}/reactions
    if (method === "GET" && event.pathParameters && event.pathParameters.commentId && path.includes("/reactions")) {
      const commentId = event.pathParameters.commentId;
      const userId = event.queryStringParameters?.userId;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const reaction = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { 
          PK: `COMMENT#${commentId}`, 
          SK: `REACTION#${userId}` 
        }
      }));

      return createResponse(event, 200, { 
        reactionType: reaction.Item?.reactionType || null 
      });
    }

    // GET ALL REACTIONS FOR COMMENT - GET /comments/{commentId}/reactions/all
    if (method === "GET" && event.pathParameters && event.pathParameters.commentId && path.includes("/reactions/all")) {
      const commentId = event.pathParameters.commentId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { 
          ":pk": `COMMENT#${commentId}`,
          ":sk": "REACTION#"
        }
      }));

      const reactions = result.Items || [];
      
      // Group by reaction type
      const reactionCounts = {
        like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0, total: 0
      };
      
      reactions.forEach(r => {
        if (reactionCounts[r.reactionType] !== undefined) {
          reactionCounts[r.reactionType]++;
          reactionCounts.total++;
        }
      });

      return createResponse(event, 200, { 
        reactions: reactionCounts,
        users: reactions.map(r => ({ userId: r.userId, reactionType: r.reactionType }))
      });
    }

    // BATCH GET USER REACTIONS - POST /comments/reactions/batch
    if (method === "POST" && path.includes("/comments/reactions/batch")) {
      const body = JSON.parse(event.body || "{}");
      const { userId, commentIds } = body;

      if (!userId || !commentIds || !Array.isArray(commentIds)) {
        return createResponse(event, 400, { message: "userId and commentIds array required" });
      }

      // Batch get user's reactions for multiple comments
      const userReactions = {};
      
      for (const commentId of commentIds.slice(0, 100)) { // Limit to 100
        const reaction = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { 
            PK: `COMMENT#${commentId}`, 
            SK: `REACTION#${userId}` 
          }
        }));
        userReactions[commentId] = reaction.Item?.reactionType || null;
      }

      return createResponse(event, 200, { userReactions });
    }

    return createResponse(event, 400, { message: "bad request" });
  } catch (err) {
    console.error("comments error", err);
    return createResponse(event, 500, { message: "internal error", error: err.message });
  }
};
