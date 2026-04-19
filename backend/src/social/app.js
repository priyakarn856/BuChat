const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');
const cache = require('./shared/cache');
const { batchGetUsers } = require('./shared/batchUtils');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand, BatchWriteCommand, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.APP_TABLE;
const WEBSOCKET_TABLE = process.env.WEBSOCKET_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Message status constants (industry standard)
const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed'
};

const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  GIF: 'gif',
  VOICE: 'voice'
};

// Helper: Verify JWT and return decoded payload (SECURITY CRITICAL)
const checkAuth = (event) => {
  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('Missing or invalid Authorization header');
      return false;
    }
    
    const token = authHeader.substring(7).trim();
    if (!token || token.length < 10) {
      console.warn('Invalid or empty token');
      return false;
    }
    
    // VERIFY signature (not just decode)
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded; // Returns { userId, username, email, iat, exp }
  } catch (error) {
    console.warn('Auth verification failed:', error.message);
    return false;
  }
};

// Helper: Extract user ID from verified token
const extractUserIdFromToken = (event) => {
  const decoded = checkAuth(event);
  if (!decoded) return null;
  return decoded.userId || decoded.sub || decoded.id;
};

// Helper: Format a raw DynamoDB message item for client consumption
const formatMessageForClient = (dbItem) => {
  if (!dbItem) return null;
  return {
    messageId: dbItem.messageId,
    conversationId: dbItem.conversationId,
    senderId: dbItem.senderId,
    recipientId: dbItem.recipientId,
    messageType: dbItem.messageType,
    encrypted: dbItem.encrypted,
    encryptedData: dbItem.encryptedData,
    encryptedMedia: dbItem.encryptedMedia,
    replyTo: dbItem.replyTo || null,
    reactions: dbItem.reactions || [],
    starred: dbItem.starred || false,
    pinned: dbItem.pinned || false,
    status: dbItem.status,
    createdAt: dbItem.createdAt,
    deliveredAt: dbItem.deliveredAt,
    readAt: dbItem.readAt,
    edited: dbItem.edited,
    deleted: dbItem.deleted,
    deletedBySender: dbItem.deletedBySender,
    deletedByRecipient: dbItem.deletedByRecipient,
    deletedForBoth: dbItem.deletedForBoth,
    deletedAt: dbItem.deletedAt
  };
};

// CORS headers


exports.handler = async (event) => {
  console.log('=== INCOMING REQUEST ===');
  console.log('Method:', event.requestContext?.httpMethod || event.httpMethod);
  console.log('Path:', event.path);
  console.log('Headers:', JSON.stringify(event.headers));
  console.log('Query:', JSON.stringify(event.queryStringParameters));
  
  // Handle OPTIONS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    console.log('Returning preflight response');
    return preflightResponse;
  }

  try {
    const method = event.httpMethod || event.requestContext?.httpMethod;
    const path = event.path;
    console.log('Processing:', method, path);

    // FOLLOW USER - POST /users/{username}/follow
    if (method === "POST" && event.pathParameters && event.pathParameters.username && path.includes("/follow")) {
      const targetUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;
      const now = new Date().toISOString();

      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `FOLLOWING#${targetUserId}` }
      }));

      if (existing.Item) {
        return { statusCode: 409, headers: getCorsHeaders(event), body: JSON.stringify({ message: "already following" }) };
      }

      const follow = {
        PK: `USER#${userId}`,
        SK: `FOLLOWING#${targetUserId}`,
        GSI1PK: `USER#${targetUserId}`,
        GSI1SK: `FOLLOWER#${userId}`,
        type: "follow",
        followerId: userId,
        followingId: targetUserId,
        followingUsername: targetUsername,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: follow }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ message: "now following", followedAt: now }) };
    }

    // UNFOLLOW USER - DELETE /users/{username}/follow
    if (method === "DELETE" && event.pathParameters && event.pathParameters.username && path.includes("/follow")) {
      const targetUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `FOLLOWING#${targetUserId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ message: "unfollowed" }) };
    }

    // BLOCK USER - POST /users/{userId}/block
    // BLOCK USER - POST /users/{username}/block
    if (method === "POST" && path.match(/^\/users\/[^\/]+\/block$/)) {
      const blockedUsername = event.pathParameters?.username;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      if (!blockedUsername) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid user to block" }) };
      }

      // Look up the user by username to get their userId
      const userResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${blockedUsername}`, SK: "PROFILE" }
      }));

      if (!userResult.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "User not found" }) };
      }

      const blockedUserId = userResult.Item.userId;
      
      if (authUserId === blockedUserId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Cannot block yourself" }) };
      }

      const now = new Date().toISOString();
      
      // Check if already blocked
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${authUserId}`, SK: `BLOCKED#${blockedUserId}` }
      }));

      if (existing.Item) {
        return { statusCode: 409, headers: getCorsHeaders(event), body: JSON.stringify({ error: "User already blocked" }) };
      }

      // Create block record
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${authUserId}`,
          SK: `BLOCKED#${blockedUserId}`,
          blockedUserId,
          blockedUsername,
          blockedAt: now,
          type: 'BLOCK'
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        success: true, 
        message: "User blocked successfully",
        blockedUserId,
        blockedUsername,
        blockedAt: now
      }) };
    }

    // UNBLOCK USER - DELETE /users/{username}/block
    if (method === "DELETE" && path.match(/^\/users\/[^\/]+\/block$/)) {
      const blockedUsername = event.pathParameters?.username;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      if (!blockedUsername) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid username" }) };
      }

      // Look up the user by username to get their userId
      const userResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${blockedUsername}`, SK: "PROFILE" }
      }));

      if (!userResult.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "User not found" }) };
      }

      const blockedUserId = userResult.Item.userId;

      // Delete block record
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${authUserId}`, SK: `BLOCKED#${blockedUserId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        success: true,
        message: "User unblocked successfully" 
      }) };
    }

    // CHECK IF USER IS BLOCKED - GET /users/{userId}/blocked
    if (method === "GET" && path.match(/^\/users\/[^\/]+\/blocked$/)) {
      const targetUserId = event.pathParameters?.userId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const blocked = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${authUserId}`, SK: `BLOCKED#${targetUserId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        isBlocked: !!blocked.Item,
        blockedAt: blocked.Item?.blockedAt || null
      }) };
    }

    // GET BLOCKED USERS LIST - GET /users/blocked-list
    if (method === "GET" && path === "/users/blocked-list") {
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${authUserId}`,
          ":sk": "BLOCKED#"
        }
      }));

      const blockedUsers = (result.Items || []).map(item => ({
        userId: item.blockedUserId,
        username: item.blockedUsername,
        blockedAt: item.blockedAt
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ blockedUsers }) };
    }

    // GET BLOCKED USERS - GET /users/blocked (template.yaml route)
    if (method === "GET" && path === "/users/blocked") {
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${authUserId}`,
          ":sk": "BLOCKED#"
        }
      }));

      const blockedUsers = (result.Items || []).map(item => ({
        userId: item.blockedUserId,
        username: item.blockedUsername,
        blockedAt: item.blockedAt
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ blockedUsers }) };
    }

    // SET READ RECEIPT PREFERENCE - PUT /conversations/{conversationId}/read-receipts
    if (method === "PUT" && path.match(/^\/conversations\/[^\/]+\/read-receipts$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const body = JSON.parse(event.body || '{}');
      const { enabled } = body;

      if (typeof enabled !== 'boolean') {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid enabled value" }) };
      }

      // Store preference
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${authUserId}`,
          SK: `RECEIPT_PREF#${conversationId}`,
          conversationId,
          enabled,
          updatedAt: new Date().toISOString(),
          type: 'READ_RECEIPT_PREFERENCE'
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        success: true,
        conversationId,
        enabled
      }) };
    }

    // GET READ RECEIPT PREFERENCE - GET /conversations/{conversationId}/read-receipts
    if (method === "GET" && path.match(/^\/conversations\/[^\/]+\/read-receipts$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${authUserId}`, SK: `RECEIPT_PREF#${conversationId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        enabled: result.Item?.enabled !== false // Default to true
      }) };
    }

    // SET SELF-DESTRUCT TIMER - PUT /conversations/{conversationId}/self-destruct
    if (method === "PUT" && path.match(/^\/conversations\/[^\/]+\/self-destruct$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const body = JSON.parse(event.body || '{}');
      const { timer } = body; // in seconds: 0 = off, or values like 10, 30, 60, 3600, 86400

      if (typeof timer !== 'number' || timer < 0) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Invalid timer value" }) };
      }

      // Store self-destruct setting for conversation
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `CONVERSATION#${conversationId}`,
          SK: `SELF_DESTRUCT`,
          conversationId,
          timer,
          setBy: authUserId,
          updatedAt: new Date().toISOString(),
          type: 'SELF_DESTRUCT_SETTING'
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        success: true,
        conversationId,
        timer
      }) };
    }

    // GET SELF-DESTRUCT TIMER - GET /conversations/{conversationId}/self-destruct
    if (method === "GET" && path.match(/^\/conversations\/[^\/]+\/self-destruct$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `CONVERSATION#${conversationId}`, SK: `SELF_DESTRUCT` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        timer: result.Item?.timer || 0,
        setBy: result.Item?.setBy || null,
        updatedAt: result.Item?.updatedAt || null
      }) };
    }

    // ARCHIVE CONVERSATION - PUT /conversations/{conversationId}/archive
    if (method === "PUT" && path.match(/^\/conversations\/[^\/]+\/archive$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const now = new Date().toISOString();

      // Store archive status
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${authUserId}`,
          SK: `ARCHIVED#${conversationId}`,
          conversationId,
          archivedAt: now,
          type: 'ARCHIVED_CONVERSATION'
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        success: true,
        conversationId,
        archivedAt: now
      }) };
    }

    // UNARCHIVE CONVERSATION - DELETE /conversations/{conversationId}/archive
    if (method === "DELETE" && path.match(/^\/conversations\/[^\/]+\/archive$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      // Remove archive record
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${authUserId}`, SK: `ARCHIVED#${conversationId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        success: true,
        message: "Conversation unarchived"
      }) };
    }

    // CHECK IF CONVERSATION IS ARCHIVED - GET /conversations/{conversationId}/archived
    if (method === "GET" && path.match(/^\/conversations\/[^\/]+\/archived$/)) {
      const conversationId = event.pathParameters?.conversationId;
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${authUserId}`, SK: `ARCHIVED#${conversationId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        isArchived: !!result.Item,
        archivedAt: result.Item?.archivedAt || null
      }) };
    }

    // GET ARCHIVED CONVERSATIONS LIST - GET /conversations/archived-list
    if (method === "GET" && path === "/conversations/archived-list") {
      const authUserId = extractUserIdFromToken(event);
      
      if (!authUserId) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${authUserId}`,
          ":sk": "ARCHIVED#"
        }
      }));

      const archivedConversations = (result.Items || []).map(item => ({
        conversationId: item.conversationId,
        archivedAt: item.archivedAt
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ archivedConversations }) };
    }

    // GET FOLLOWERS - GET /users/{username}/followers
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/followers")) {
      const username = event.pathParameters.username;
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      const user = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!user.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const userId = user.Item.userId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "FOLLOWER#"
        },
        Limit: limit
      }));

      const followerIds = (result.Items || []).map(f => f.followerId);
      const followers = [];
      
      for (const fId of followerIds) {
        try {
          const followerResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USERID#${fId}`,
              ":sk": "PROFILE"
            },
            Limit: 1
          }));
          
          if (followerResult.Items && followerResult.Items[0]) {
            const follower = followerResult.Items[0];
            delete follower.password;
            delete follower.verificationCode;
            delete follower.resetCode;
            followers.push(follower);
          }
        } catch (error) {
          console.error(`Error fetching follower ${fId}:`, error);
        }
      }

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({
          followers,
          count: followers.length
        })
      };
    }

    // GET FOLLOWING - GET /users/{username}/following
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/following")) {
      const username = event.pathParameters.username;
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      const user = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!user.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const userId = user.Item.userId;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "FOLLOWING#"
        },
        Limit: limit
      }));

      const followingIds = (result.Items || []).map(f => f.followingId);
      const following = [];
      
      for (const fId of followingIds) {
        try {
          const followingResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USERID#${fId}`,
              ":sk": "PROFILE"
            },
            Limit: 1
          }));
          
          if (followingResult.Items && followingResult.Items[0]) {
            const followedUser = followingResult.Items[0];
            delete followedUser.password;
            delete followedUser.verificationCode;
            delete followedUser.resetCode;
            following.push(followedUser);
          }
        } catch (error) {
          console.error(`Error fetching following user ${fId}:`, error);
        }
      }

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({
          following,
          count: following.length
        })
      };
    }

    // SEND MESSAGE - POST /messages (E2E Encrypted)
    if (method === "POST" && path === "/messages") {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }
      
      const body = JSON.parse(event.body || "{}");
      const { recipientId, messageType, encryptedData, encryptedMedia, encrypted } = body;
      const senderId = extractUserIdFromToken(event);

      if (!senderId || !recipientId || !encrypted || !encryptedData || typeof encryptedData.body !== 'string' || encryptedData.body.length === 0) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Encrypted message required with a non-empty body" }) };
      }

      // ✅ CHECK IF SENDER IS BLOCKED BY RECIPIENT OR VICE VERSA
      const [senderBlocksRecipient, recipientBlocksSender] = await Promise.all([
        ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${senderId}`, SK: `BLOCKED#${recipientId}` }
        })),
        ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${recipientId}`, SK: `BLOCKED#${senderId}` }
        }))
      ]);

      if (senderBlocksRecipient.Item) {
        return { statusCode: 403, headers: getCorsHeaders(event), body: JSON.stringify({ 
          error: "BLOCKED_BY_YOU",
          message: "You have blocked this user. Unblock to send messages." 
        }) };
      }

      if (recipientBlocksSender.Item) {
        return { statusCode: 403, headers: getCorsHeaders(event), body: JSON.stringify({ 
          error: "BLOCKED_BY_RECIPIENT",
          message: "You cannot send messages to this user." 
        }) };
      }

      const messageId = uuidv4();
      const now = new Date().toISOString();
      const conversationId = [senderId, recipientId].sort().join("#");

      const message = {
        PK: `CONV#${conversationId}`,
        SK: `MSG#${now}#${messageId}`,
        GSI1PK: `USER#${recipientId}`,
        GSI1SK: `INBOX#${now}`,
        messageId,
        conversationId,
        senderId,
        recipientId,
        messageType: messageType || MESSAGE_TYPES.TEXT,
        encrypted: true,
        encryptedData,
        encryptedMedia: encryptedMedia || null,
        status: MESSAGE_STATUS.SENT,
        createdAt: now,
        deliveredAt: null,
        readAt: null,
        edited: false,
        deleted: false,
        type: "message"
      };

      try {
        const conversationMeta = {
          PK: `CONV#${conversationId}`,
          SK: "META",
          type: "conversation",
          conversationId,
          participants: [senderId, recipientId],
          lastMessageAt: now,
          lastMessagePreview: messageType === MESSAGE_TYPES.TEXT ? '🔒 Encrypted message' : `🔒 ${messageType}`,
          unreadCount: { [senderId]: 0, [recipientId]: 1 },
          updatedAt: now
        };

        const senderConvLink = {
            PK: `USER#${senderId}`,
            SK: `CONV#${conversationId}`,
            type: "conversation_link",
            conversationId,
            userId: senderId,
            lastMessageAt: now
        };
        
        const recipientConvLink = {
            PK: `USER#${recipientId}`,
            SK: `CONV#${conversationId}`,
            type: "conversation_link",
            conversationId,
            userId: recipientId,
            lastMessageAt: now
        };

        await Promise.all([
          ddb.send(new PutCommand({ TableName: TABLE, Item: message })),
          ddb.send(new PutCommand({ TableName: TABLE, Item: conversationMeta })),
          ddb.send(new PutCommand({ TableName: TABLE, Item: senderConvLink })),
          ddb.send(new PutCommand({ TableName: TABLE, Item: recipientConvLink }))
        ]);

        return { 
          statusCode: 201, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ 
            success: true,
            message: formatMessageForClient(message)
          })
        };
      } catch (error) {
        console.error('Failed to send message:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to send message", details: error.message }) };
      }
    }
    
    if (method === "POST" && path === "/messages/v2") {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }
      
      const body = JSON.parse(event.body || "{}");
      const { recipientId, messageType, encryptedData, encryptedMedia, encrypted, replyTo } = body;
      const senderId = extractUserIdFromToken(event);

      // Validate required fields - support both legacy (body) and dual payload formats
      const hasDualPayload = encryptedData && encryptedData.scheme === 'dual' && encryptedData.recipientData;
      const hasLegacyPayload = encryptedData && typeof encryptedData.body === 'string' && encryptedData.body.length > 0;
      
      // Additional validation: check that recipientData.body is not empty
      const hasDualPayloadWithBody = hasDualPayload && 
        encryptedData.recipientData.body && 
        encryptedData.recipientData.body.length > 0;
      
      console.log('Message validation:', {
        senderId,
        recipientId,
        hasDualPayload,
        hasDualPayloadWithBody,
        hasLegacyPayload,
        recipientDataBodyLength: encryptedData?.recipientData?.body?.length || 0,
        recipientDataType: encryptedData?.recipientData?.type
      });
      
      if (!senderId || !recipientId || !encrypted || !encryptedData) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Missing required fields" }) };
      }
      
      if (!hasDualPayloadWithBody && !hasLegacyPayload) {
        // Log the actual received data for debugging
        console.error('Invalid payload received:', {
          scheme: encryptedData?.scheme,
          hasRecipientData: !!encryptedData?.recipientData,
          recipientDataKeys: encryptedData?.recipientData ? Object.keys(encryptedData.recipientData) : [],
          recipientBodyType: typeof encryptedData?.recipientData?.body,
          recipientBodyValue: encryptedData?.recipientData?.body?.substring?.(0, 50) || encryptedData?.recipientData?.body
        });
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ 
          error: "Encrypted message body is empty or invalid. Please try again.",
          debug: {
            hasDualPayload,
            hasRecipientData: !!encryptedData?.recipientData,
            bodyLength: encryptedData?.recipientData?.body?.length || 0
          }
        }) };
      }

      const messageId = uuidv4();
      const now = new Date().toISOString();
      const conversationId = [senderId, recipientId].sort().join("#");

      const message = {
        PK: `CONV#${conversationId}`,
        SK: `MSG#${now}#${messageId}`,
        GSI1PK: `USER#${recipientId}`,
        GSI1SK: `INBOX#${now}`,
        messageId,
        conversationId,
        senderId,
        recipientId,
        messageType: messageType || MESSAGE_TYPES.TEXT,
        encrypted: true,
        encryptedData,
        encryptedMedia: encryptedMedia || null,
        replyTo: replyTo || null,
        status: MESSAGE_STATUS.SENT,
        createdAt: now,
        deliveredAt: null,
        readAt: null,
        edited: false,
        deleted: false,
        type: "message"
      };

      try {
        const conversationMeta = {
          PK: `CONV#${conversationId}`,
          SK: "META",
          type: "conversation",
          conversationId,
          participants: [senderId, recipientId],
          lastMessageAt: now,
          lastMessagePreview: messageType === MESSAGE_TYPES.TEXT ? '🔒 Encrypted message' : `🔒 ${messageType}`,
          unreadCount: { [senderId]: 0, [recipientId]: 1 },
          updatedAt: now
        };
          
        const senderConvLink = {
            PK: `USER#${senderId}`,
            SK: `CONV#${conversationId}`,
            type: "conversation_link",
            conversationId,
            userId: senderId,
            lastMessageAt: now
        };
        
        const recipientConvLink = {
            PK: `USER#${recipientId}`,
            SK: `CONV#${conversationId}`,
            type: "conversation_link",
            conversationId,
            userId: recipientId,
            lastMessageAt: now
        };

        await Promise.all([
          ddb.send(new PutCommand({ TableName: TABLE, Item: message })),
          ddb.send(new PutCommand({ TableName: TABLE, Item: conversationMeta })),
          ddb.send(new PutCommand({ TableName: TABLE, Item: senderConvLink })),
          ddb.send(new PutCommand({ TableName: TABLE, Item: recipientConvLink }))
        ]);
        
        // Get WebSocket connections for BOTH sender and recipient for real-time updates
        const [senderConnections, recipientConnections] = await Promise.all([
          ddb.send(new QueryCommand({
            TableName: WEBSOCKET_TABLE,
            IndexName: 'userId-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': senderId }
          })),
          ddb.send(new QueryCommand({
            TableName: WEBSOCKET_TABLE,
            IndexName: 'userId-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': recipientId }
          }))
        ]);
        
        // Combine all connections (both sender's and recipient's)
        const allConnections = [
          ...(senderConnections.Items || []),
          ...(recipientConnections.Items || [])
        ];
        
        console.log('📤 WebSocket broadcast - connections found:', allConnections.length);
        
        // Use WebSocket API endpoint from environment variable
        const wsEndpoint = process.env.WEBSOCKET_API_ENDPOINT;
        console.log('📤 WebSocket endpoint:', wsEndpoint);
        
        if (!wsEndpoint) {
          console.warn('WEBSOCKET_API_ENDPOINT not configured, skipping real-time push');
        }
        
        if (wsEndpoint && allConnections.length > 0) {
          const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
              endpoint: wsEndpoint
          });

          const clientMessage = formatMessageForClient(message);
          const postData = JSON.stringify({ type: 'new_message', message: clientMessage });
          
          console.log('📤 Broadcasting new_message to', allConnections.length, 'connections');

          const postToConnection = async (connectionId) => {
              try {
                  await apiGatewayManagementApi.send(new PostToConnectionCommand({ 
                    ConnectionId: connectionId, 
                    Data: postData 
                  }));
                  console.log('✅ Sent to connection:', connectionId);
                  return { success: true, connectionId };
              } catch (e) {
                  console.error('❌ WebSocket push error for', connectionId, ':', e.message, e.statusCode);
                  if (e.statusCode === 410 || e.$metadata?.httpStatusCode === 410) {
                      console.log(`Found stale connection, deleting ${connectionId}`);
                      await ddb.send(new DeleteCommand({ TableName: WEBSOCKET_TABLE, Key: { connectionId } }));
                  }
                  return { success: false, connectionId, error: e.message };
              }
          };

          const results = await Promise.all(allConnections.map(conn => postToConnection(conn.connectionId)));
          console.log('📤 Broadcast results:', results);
        }
        
        const clientMessage = formatMessageForClient(message);

        return { 
          statusCode: 201, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ 
            success: true,
            message: clientMessage
          })
        };
      } catch (error) {
        console.error('Failed to send message:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to send message", details: error.message }) };
      }
    }

    // GET CONVERSATION MESSAGES - GET /conversations/{conversationId}/messages
    if (method === "GET" && path.match(/^\/conversations\/[^\/]+\/messages$/)) {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const conversationId = decodeURIComponent(event.pathParameters.conversationId);
      const userId = extractUserIdFromToken(event);
      const limit = parseInt(event.queryStringParameters?.limit || '50');
      const lastKey = event.queryStringParameters?.lastKey;
      
      const separator = conversationId.includes('#') ? '#' : '-';
      const participants = conversationId.split(separator);
      
      if (!participants.includes(userId)) {
        return { statusCode: 403, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Access denied" }) };
      }

      const params = {
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CONV#${conversationId}`,
          ":sk": "MSG#"
        },
        Limit: limit,
        ScanIndexForward: false
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));
      
      // Filter out deleted messages based on user
      const filteredItems = (result.Items || []).filter(msg => {
        // Exclude messages deleted for everyone
        if (msg.deletedForBoth) return false;
        
        // Check if current user is sender or recipient
        const isSender = msg.senderId === userId;
        const isRecipient = msg.recipientId === userId;
        
        // Exclude if deleted by sender and user is sender
        if (isSender && msg.deletedBySender) return false;
        
        // Exclude if deleted by recipient and user is recipient
        if (isRecipient && msg.deletedByRecipient) return false;
        
        return true;
      });
      
      // Get user's starred and pinned messages for this conversation
      const [starredResult, pinnedResult] = await Promise.all([
        ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'STAR#'
          }
        })),
        ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `PIN#${conversationId}#`
          }
        }))
      ]);
      
      const starredMessageIds = new Set((starredResult.Items || []).map(s => s.messageId));
      const pinnedMessageIds = new Set((pinnedResult.Items || []).map(p => p.messageId));
      
      // Return encrypted messages as-is (client will decrypt) with starred/pinned enrichment
      const messages = filteredItems.reverse().map(msg => {
        const formatted = formatMessageForClient(msg);
        formatted.starred = starredMessageIds.has(msg.messageId);
        formatted.pinned = pinnedMessageIds.has(msg.messageId);
        return formatted;
      });
      
      // Also return pinned messages separately for the pinned bar
      const pinnedMessages = messages.filter(m => m.pinned);
      
      return { 
        statusCode: 200, 
        headers: getCorsHeaders(event), 
        body: JSON.stringify({
          success: true,
          messages,
          pinnedMessages,
          pagination: {
            lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null,
            hasMore: !!result.LastEvaluatedKey
          }
        })
      };
    }

    // GET USER CONVERSATIONS - GET /conversations OR /messages/inbox OR /messages/conversations
    if (method === "GET" && (path === "/conversations" || path === "/messages/inbox" || path === "/messages/conversations" || path.endsWith("/conversations"))) {
        if (!checkAuth(event)) {
            return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
        }

        const userId = extractUserIdFromToken(event);
        const limit = parseInt(event.queryStringParameters?.limit || '50');

        // 1. Efficiently query for conversation links
        const linkResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":sk": "CONV#"
            },
            ScanIndexForward: false, // Sort by conversationId string. Not ideal, but ok.
            Limit: limit
        }));
        
        const convLinks = linkResult.Items || [];
        if (convLinks.length === 0) {
            return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, conversations: [], count: 0 }) };
        }
        
        // Sort by lastMessageAt, because ScanIndexForward on SK is not by time
        convLinks.sort((a,b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

        // 2. Batch get the full conversation metadata
        const conversationIds = convLinks.map(link => link.conversationId);
        const keys = conversationIds.map(id => ({ PK: `CONV#${id}`, SK: "META" }));
        
        if (keys.length === 0) {
            return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, conversations: [], count: 0 }) };
        }
        
        const batchGetResult = await ddb.send(new BatchGetCommand({
            RequestItems: {
                [TABLE]: { Keys: keys }
            }
        }));

        let conversations = batchGetResult.Responses?.[TABLE] || [];

        // 3. Get participant details and format response
        const allParticipantIds = [...new Set(conversations.flatMap(c => c.participants || []))];
        const userMap = await batchGetUsers(ddb, TABLE, allParticipantIds);
        
        for (const conv of conversations) {
            conv.participantUsernames = (conv.participants || []).map(id => 
                userMap[id]?.username || id
            );
        }
        
        // Sort again to match the order from convLinks
        conversations.sort((a,b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

        return { 
            statusCode: 200, 
            headers: getCorsHeaders(event), 
            body: JSON.stringify({
                success: true,
                conversations,
                count: conversations.length
            })
        };
    }

    // MARK MESSAGE AS DELIVERED - PUT /messages/{messageId}/delivered
    if (method === "PUT" && path.match(/^\/messages\/[^\/]+\/delivered$/)) {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const messageId = event.pathParameters.messageId;
      const userId = extractUserIdFromToken(event);
      const now = new Date().toISOString();

      // Use MessageIdIndex for full message lookup (has ALL projection)
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "MessageIdIndex",
        KeyConditionExpression: "messageId = :mid",
        FilterExpression: "recipientId = :uid",
        ExpressionAttributeValues: { ":mid": messageId, ":uid": userId },
        Limit: 1
      }));

      if (result.Items?.[0]) {
        const message = result.Items[0];
        // Only update if not already delivered or read (one-directional)
        if (message.status === MESSAGE_STATUS.SENT && !message.deliveredAt) {
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: message.PK, SK: message.SK },
            UpdateExpression: "SET #status = :status, deliveredAt = :time",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":status": MESSAGE_STATUS.DELIVERED,
              ":time": now
            }
          }));

          // NOTIFY SENDER - Send WebSocket delivery receipt for real-time tick update
          try {
            const senderConnections = await ddb.send(new QueryCommand({
              TableName: WEBSOCKET_TABLE,
              IndexName: 'userId-index',
              KeyConditionExpression: 'userId = :userId',
              ExpressionAttributeValues: { ':userId': message.senderId }
            }));

            if (senderConnections.Items?.length > 0 && process.env.WEBSOCKET_API_ENDPOINT) {
              const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
              const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
                endpoint: endpoint
              });

              const deliveryReceiptData = JSON.stringify({
                type: 'message_delivered',
                messageId: messageId,
                conversationId: message.conversationId,
                deliveredAt: now,
                deliveredTo: userId
              });

              await Promise.all(senderConnections.Items.map(async (conn) => {
                try {
                  await apiGatewayManagementApi.send(new PostToConnectionCommand({
                    ConnectionId: conn.connectionId,
                    Data: deliveryReceiptData
                  }));
                } catch (e) {
                  if (e.statusCode === 410) {
                    await ddb.send(new DeleteCommand({ TableName: WEBSOCKET_TABLE, Key: { connectionId: conn.connectionId } }));
                  }
                }
              }));
            }
          } catch (wsError) {
            console.error('Failed to send delivery receipt via WebSocket:', wsError);
          }
        }
      }

      return { 
        statusCode: 200, 
        headers: getCorsHeaders(event), 
        body: JSON.stringify({
          success: true,
          status: MESSAGE_STATUS.DELIVERED,
          timestamp: now
        })
      };
    }

    // MARK CONVERSATION AS READ - PUT /conversations/{conversationId}/read
    if (method === "PUT" && path.match(/^\/conversations\/[^\/]+\/read$/)) {
      if (!checkAuth(event)) {
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      }

      const conversationId = decodeURIComponent(event.pathParameters.conversationId);
      const userId = extractUserIdFromToken(event);

      try {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: `CONV#${conversationId}`, SK: "META" },
          UpdateExpression: "SET unreadCount.#user = :zero",
          ExpressionAttributeNames: { "#user": userId },
          ExpressionAttributeValues: { ":zero": 0 }
        }));
      } catch (e) {
        console.debug('Mark conversation read error:', e);
      }

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
    }

    // MARK MESSAGE AS READ - PUT /messages/{messageId}/read
    if (method === "PUT" && path.match(/^\/messages\/[^\/]+\/read$/)) {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const messageId = event.pathParameters?.messageId || path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      const now = new Date().toISOString();

      // Use MessageIdIndex for full message lookup (has ALL projection)
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "MessageIdIndex",
        KeyConditionExpression: "messageId = :mid",
        FilterExpression: "recipientId = :uid",
        ExpressionAttributeValues: { ":mid": messageId, ":uid": userId },
        Limit: 1
      }));

      if (result.Items?.[0]) {
        const message = result.Items[0];
        
        // Only update if not already read (one-directional)
        if (message.status !== MESSAGE_STATUS.READ && !message.readAt) {
          await Promise.all([
            ddb.send(new UpdateCommand({
              TableName: TABLE,
              Key: { PK: message.PK, SK: message.SK },
              UpdateExpression: "SET #status = :status, readAt = :time, deliveredAt = if_not_exists(deliveredAt, :time)",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":status": MESSAGE_STATUS.READ,
                ":time": now
              }
            })),
            ddb.send(new UpdateCommand({
              TableName: TABLE,
              Key: { PK: `CONV#${message.conversationId}`, SK: "META" },
              UpdateExpression: "SET unreadCount.#user = :zero",
              ExpressionAttributeNames: { "#user": userId },
              ExpressionAttributeValues: { ":zero": 0 }
            }))
          ]);

          // NOTIFY SENDER - Send WebSocket read receipt for real-time tick update
          try {
            const senderConnections = await ddb.send(new QueryCommand({
              TableName: WEBSOCKET_TABLE,
              IndexName: 'userId-index',
              KeyConditionExpression: 'userId = :userId',
              ExpressionAttributeValues: { ':userId': message.senderId }
            }));

            if (senderConnections.Items?.length > 0 && process.env.WEBSOCKET_API_ENDPOINT) {
              const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
              const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
                endpoint: endpoint
              });

              const readReceiptData = JSON.stringify({
                type: 'message_read',
                messageId: messageId,
                conversationId: message.conversationId,
                readAt: now,
                readBy: userId
              });

              await Promise.all(senderConnections.Items.map(async (conn) => {
                try {
                  await apiGatewayManagementApi.send(new PostToConnectionCommand({
                    ConnectionId: conn.connectionId,
                    Data: readReceiptData
                  }));
                } catch (e) {
                  if (e.statusCode === 410) {
                    await ddb.send(new DeleteCommand({ TableName: WEBSOCKET_TABLE, Key: { connectionId: conn.connectionId } }));
                  }
                }
              }));
            }
          } catch (wsError) {
            console.error('Failed to send read receipt via WebSocket:', wsError);
            // Don't fail the request if WebSocket notification fails
          }
        }
      }

      return { 
        statusCode: 200, 
        headers: getCorsHeaders(event), 
        body: JSON.stringify({
          success: true,
          status: MESSAGE_STATUS.READ,
          timestamp: now
        })
      };
    }

    // TYPING INDICATOR - POST /conversations/{conversationId}/typing
    if (method === "POST" && path.match(/^\/conversations\/[^\/]+\/typing$/)) {
      try {
        const conversationId = decodeURIComponent(event.pathParameters.conversationId);
        const userId = extractUserIdFromToken(event);
        if (!userId) {
          return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
        }
        
        const body = JSON.parse(event.body || '{}');
        const { isTyping } = body;

        console.log('Typing indicator:', { conversationId, userId, isTyping });

        const ttl = Math.floor(Date.now() / 1000) + 5;

        if (isTyping) {
          await ddb.send(new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `CONV#${conversationId}`,
              SK: `TYPING#${userId}`,
              type: "typing",
              userId,
              isTyping: true,
              timestamp: new Date().toISOString(),
              ttl
            }
          }));
        } else {
          try {
            await ddb.send(new DeleteCommand({
              TableName: TABLE,
              Key: {
                PK: `CONV#${conversationId}`,
                SK: `TYPING#${userId}`
              }
            }));
          } catch (e) {
            console.log('Delete typing error:', e.message);
          }
        }

        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({
            success: true,
            isTyping,
            userId
          })
        };
      } catch (error) {
        console.error('Typing indicator error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to set typing indicator", details: error.message }) };
      }
    }

    // GET TYPING USERS - GET /conversations/{conversationId}/typing
    if (method === "GET" && path.match(/^\/conversations\/[^\/]+\/typing$/)) {
      try {
        if (!event.pathParameters || !event.pathParameters.conversationId) {
          return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, typingUsers: [], count: 0 }) };
        }
        
        const conversationId = decodeURIComponent(event.pathParameters.conversationId);
        const currentUserId = extractUserIdFromToken(event);
        const now = Date.now();

        const result = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `CONV#${conversationId}`,
            ":sk": "TYPING#"
          }
        }));

        const typingUsers = (result.Items || [])
          .filter(item => {
            if (!item.timestamp) return false;
            const isRecent = (now - new Date(item.timestamp).getTime()) < 5000;
            const isNotCurrentUser = item.userId !== currentUserId;
            return item.isTyping && isRecent && isNotCurrentUser;
          })
          .map(item => item.userId);

        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({
            success: true,
            typingUsers,
            count: typingUsers.length
          })
        };
      } catch (error) {
        console.error('Get typing users error:', error);
        // Always return 200 with empty array and CORS headers on error
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, typingUsers: [], count: 0, error: error.message }) };
      }
    }

    // ONLINE STATUS - PUT /users/online-status
    if (method === "PUT" && path === "/users/online-status") {
      try {
        const userId = extractUserIdFromToken(event);
        if (!userId) {
          return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
        }
        
        const body = JSON.parse(event.body || '{}');
        const { isOnline } = body;
        const now = new Date().toISOString();
        // TTL: 60 seconds for online status (requires heartbeat every 30s)
        const ttl = isOnline ? Math.floor(Date.now() / 1000) + 60 : null;

        if (isOnline) {
          await ddb.send(new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `USER#${userId}`,
              SK: "ONLINE_STATUS",
              type: "online_status",
              userId,
              isOnline: true,
              lastSeen: now,
              ttl
            }
          }));
        } else {
          // Update lastSeen but mark as offline
          await ddb.send(new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `USER#${userId}`,
              SK: "ONLINE_STATUS",
              type: "online_status",
              userId,
              isOnline: false,
              lastSeen: now,
              ttl: Math.floor(Date.now() / 1000) + 86400 // Keep for 24h for "last seen"
            }
          }));
        }

        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({
            success: true,
            status: isOnline ? 'online' : 'offline',
            timestamp: now
          })
        };
      } catch (error) {
        console.error('Set online status error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to set online status", details: error.message }) };
      }
    }

    // GET ONLINE STATUS - GET /users/{username}/online-status (accepts username or userId)
    if (method === "GET" && path.match(/^\/users\/[^\/]+\/online-status$/)) {
      const identifier = event.pathParameters.username; // Can be username or userId
      
      if (!identifier) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "identifier required" }) };
      }

      try {
        let userId = identifier;
        
        // Check if it's a UUID (userId) or username
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        if (!isUUID) {
          // It's a username, look up userId
          const userResult = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { PK: `USER#${identifier}`, SK: "PROFILE" }
          }));

          if (!userResult.Item) {
            return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, isOnline: false, lastSeen: null }) };
          }

          userId = userResult.Item.userId;
        }

        const result = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: {
            PK: `USER#${userId}`,
            SK: "ONLINE_STATUS"
          }
        }));

        const lastSeen = result.Item?.lastSeen || null;
        
        // Check if user is truly online (isOnline=true AND lastSeen within 60 seconds)
        let isOnline = false;
        if (result.Item?.isOnline === true && lastSeen) {
          const lastSeenTime = new Date(lastSeen).getTime();
          const now = Date.now();
          const sixtySecondsAgo = now - (60 * 1000);
          isOnline = lastSeenTime > sixtySecondsAgo;
        }

        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({
            success: true,
            isOnline,
            lastSeen,
            userId
          })
        };
      } catch (error) {
        console.error('Get online status error:', error);
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({
            success: true,
            isOnline: false,
            lastSeen: null
          })
        };
      }
    }

    // SEARCH MESSAGES - GET /messages/search
    if (method === "GET" && path === "/messages/search") {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const userId = extractUserIdFromToken(event);
      const query = event.queryStringParameters?.q;
      const limit = parseInt(event.queryStringParameters?.limit || '20');

      if (!query || query.length < 2) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Query must be at least 2 characters" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        FilterExpression: "contains(content, :query) AND #type = :msgType",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":query": query,
          ":msgType": "message"
        },
        Limit: limit
      }));

      return { 
        statusCode: 200, 
        headers: getCorsHeaders(event), 
        body: JSON.stringify({
          success: true,
          messages: result.Items || [],
          count: (result.Items || []).length,
          query
        })
      };
    }

    // CREATE STATUS - POST /status
    if (method === "POST" && path === "/status") {
      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || '{}');
      const { mediaUrl, mediaType = 'image', visibility = 'followers', caption = '' } = body;

      if (!mediaUrl) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "mediaUrl required" }) };
      }

      const statusId = `STATUS#${Date.now()}#${userId}`;
      const now = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

      const status = {
        PK: `USER#${userId}`,
        SK: statusId,
        GSI1PK: `STATUS#${visibility}`,
        GSI1SK: now,
        type: "status",
        statusId,
        userId,
        mediaUrl,
        mediaType,
        visibility,
        caption,
        views: [],
        viewCount: 0,
        createdAt: now,
        ttl
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: status }));

      return { statusCode: 201, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, status }) };
    }

    // GET STATUSES - GET /status
    if (method === "GET" && path === "/status") {
      const userId = extractUserIdFromToken(event);
      const includePublic = event.queryStringParameters?.includePublic === 'true';

      // Get user's following list
      const followingResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "FOLLOWING#"
        }
      }));

      const followingIds = (followingResult.Items || []).map(f => f.followingId);
      followingIds.push(userId);

      let allStatuses = [];

      // Get statuses from following users
      const followingPromises = followingIds.map(id =>
        ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${id}`,
            ":sk": "STATUS#"
          }
        }))
      );

      const followingResults = await Promise.all(followingPromises);
      allStatuses = followingResults.flatMap(r => r.Items || []);

      // Add public statuses from non-following users (recommendations)
      if (includePublic) {
        const publicResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: {
            ":pk": "STATUS#public"
          },
          Limit: 20
        }));

        const publicStatuses = (publicResult.Items || []).filter(s => !followingIds.includes(s.userId));
        allStatuses = allStatuses.concat(publicStatuses);
      }

      // Get user details for each status
      const userIds = [...new Set(allStatuses.map(s => s.userId))];
      const userMap = {};
      
      for (const id of userIds) {
        try {
          const userResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USERID#${id}`,
              ":sk": "PROFILE"
            },
            Limit: 1
          }));
          
          if (userResult.Items?.[0]) {
            const u = userResult.Items[0];
            userMap[id] = { username: u.username, avatar: u.avatar, displayName: u.displayName };
          }
        } catch (error) {
          console.error(`Error fetching user ${id}:`, error);
        }
      }

      // Attach user info and check if viewed
      allStatuses = allStatuses.map(s => {
        const viewsArray = s.views?.values ? Array.from(s.views.values) : (Array.isArray(s.views) ? s.views : []);
        return {
          ...s,
          user: userMap[s.userId],
          hasViewed: viewsArray.includes(userId),
          isOwn: s.userId === userId
        };
      });

      // Sort: own first, then unviewed following, then viewed following, then public recommendations
      allStatuses.sort((a, b) => {
        if (a.isOwn) return -1;
        if (b.isOwn) return 1;
        
        const aIsFollowing = followingIds.includes(a.userId);
        const bIsFollowing = followingIds.includes(b.userId);
        
        if (aIsFollowing && !bIsFollowing) return -1;
        if (!aIsFollowing && bIsFollowing) return 1;
        
        if (aIsFollowing && bIsFollowing) {
          if (!a.hasViewed && b.hasViewed) return -1;
          if (a.hasViewed && !b.hasViewed) return 1;
        }
        
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, statuses: allStatuses }) };
    }

    // VIEW STATUS - POST /status/{statusId}/view
    if (method === "POST" && path.match(/^\/status\/[^\/]+\/view$/)) {
      const statusId = decodeURIComponent(event.pathParameters.statusId);
      const userId = extractUserIdFromToken(event);

      const body = JSON.parse(event.body || '{}');
      const { ownerId } = body;

      if (!ownerId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "ownerId required" }) };
      }

      try {
        const status = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${ownerId}`, SK: statusId }
        }));

        if (!status.Item) {
          return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Status not found" }) };
        }

        const views = status.Item.views || [];
        if (!views.includes(userId)) {
          views.push(userId);
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: `USER#${ownerId}`, SK: statusId },
            UpdateExpression: "SET #views = :views, viewCount = :count",
            ExpressionAttributeNames: { "#views": "views" },
            ExpressionAttributeValues: {
              ":views": views,
              ":count": views.length
            }
          }));
        }
      } catch (error) {
        console.error('View status error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Failed to update view", error: error.message }) };
      }

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
    }

    // DELETE STATUS - DELETE /status/{statusId}
    if (method === "DELETE" && path.match(/^\/status\/[^\/]+$/)) {
      const statusId = decodeURIComponent(event.pathParameters.statusId);
      const userId = extractUserIdFromToken(event);

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: statusId }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
    }

    // BLOCK USER - POST /users/{username}/block
    if (method === "POST" && path.includes("/block") && event.pathParameters.username) {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Authentication required" }) };
      }
      
      const targetUsername = event.pathParameters.username;
      // Use extractUserIdFromToken instead of body
      const userId = extractUserIdFromToken(event);

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;
      
      if (userId === targetUserId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Cannot block yourself" }) };
      }

      const now = new Date().toISOString();

      const block = {
        PK: `USER#${userId}`,
        SK: `BLOCKED#${targetUserId}`,
        GSI1PK: `USER#${targetUserId}`,
        GSI1SK: `BLOCKEDBY#${userId}`,
        type: "block",
        blockerId: userId,
        blockedId: targetUserId,
        blockedUsername: targetUsername,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: block }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user blocked" })};
    }

    // UNBLOCK USER - DELETE /users/{username}/block
    if (method === "DELETE" && path.includes("/block") && event.pathParameters.username) {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Authentication required" }) };
      }
      
      const targetUsername = event.pathParameters.username;
      // Use extractUserIdFromToken instead of body
      const userId = extractUserIdFromToken(event);

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      const targetUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${targetUsername}`, SK: "PROFILE" }
      }));

      if (!targetUser.Item) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const targetUserId = targetUser.Item.userId;

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `BLOCKED#${targetUserId}` }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user unblocked" })};
    }

    // GET BLOCKED USERS - GET /users/blocked
    if (method === "GET" && path === "/users/blocked") {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }
      const userId = extractUserIdFromToken(event) || event.queryStringParameters?.userId;

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "BLOCKED#"
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({
        blocked: result.Items || [],
        count: (result.Items || []).length
      })};
    }

    // GET NOTIFICATIONS - GET /notifications
    if (method === "GET" && path === "/notifications") {
      try {
        const userId = event.queryStringParameters?.userId;
        const limit = parseInt(event.queryStringParameters?.limit || 50);

        if (!userId) {
          return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
        }

        const result = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "NOTIFICATION#"
          },
          Limit: limit,
          ScanIndexForward: false
        }));

        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({
          notifications: result.Items || [],
          unreadCount: (result.Items || []).filter(n => !n.read).length
        })};
      } catch (error) {
        console.error('Get notifications error:', error);
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ notifications: [], unreadCount: 0 }) };
      }
    }

    // CREATE NOTIFICATION - POST /notifications
    if (method === "POST" && path === "/notifications") {
      const body = JSON.parse(event.body || "{}");
      const { userId, fromUserId, notificationType, title, message, data } = body;

      if (!userId || !notificationType || !title) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId, notificationType, and title required" }) };
      }

      const notificationId = uuidv4();
      const now = new Date().toISOString();

      const notification = {
        PK: `USER#${userId}`,
        SK: `NOTIFICATION#${now}#${notificationId}`,
        GSI1PK: `NOTIFICATION#${notificationId}`,
        GSI1SK: `USER#${userId}`,
        type: "notification",
        notificationId,
        userId,
        fromUserId: fromUserId || null,
        notificationType,
        title,
        message: message || "",
        data: data || {},
        read: false,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: notification }));

      return { statusCode: 201, headers: getCorsHeaders(event), body: JSON.stringify({ 
        notificationId,
        createdAt: now
      })};
    }

    // MARK NOTIFICATION AS READ - PUT /notifications/{notificationId}/read
    if (method === "PUT" && path.includes("/notifications/") && path.includes("/read")) {
      const notificationId = event.pathParameters.notificationId;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      // OPTIMIZED: Use TypeIndex for notification lookup
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "TypeIndex",
        KeyConditionExpression: "#type = :type",
        FilterExpression: "notificationId = :nid AND userId = :uid",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":type": "notification",
          ":nid": notificationId,
          ":uid": userId
        },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "notification not found" }) };
      }

      const notification = result.Items[0];

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: notification.PK, SK: notification.SK },
        UpdateExpression: "SET #read = :read, readAt = :now",
        ExpressionAttributeNames: { "#read": "read" },
        ExpressionAttributeValues: {
          ":read": true,
          ":now": new Date().toISOString()
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ message: "notification marked as read" })};
    }

    // GET MESSAGE REQUESTS - GET /messages/requests
    if (method === "GET" && path === "/messages/requests") {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 20);

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }
      
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Authentication required" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "MSGREQ#"
        },
        Limit: limit,
        ScanIndexForward: false
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({
        requests: result.Items || [],
        count: (result.Items || []).length
      })};
    }

    // RESPOND TO MESSAGE REQUEST - PUT /messages/requests/{requestId}
    if (method === "PUT" && path.includes("/messages/requests/")) {
      const requestId = event.pathParameters.requestId;
      const body = JSON.parse(event.body || "{}");
      const { userId, action } = body;

      if (!userId || !action) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId and action required" }) };
      }

      // OPTIMIZED: Use TypeIndex for message request lookup
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "TypeIndex",
        KeyConditionExpression: "#type = :type",
        FilterExpression: "requestId = :rid AND recipientId = :uid",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":type": "message_request",
          ":rid": requestId,
          ":uid": userId
        },
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "request not found" }) };
      }

      const request = result.Items[0];
      const now = new Date().toISOString();

      if (action === 'accept') {
        const messageId = uuidv4();
        const conversationId = [request.senderId, request.recipientId].sort().join('#');
        
        const message = {
          PK: `CONV#${conversationId}`,
          SK: `MSG#${now}#${messageId}`,
          GSI1PK: `USER#${request.recipientId}`,
          GSI1SK: `INBOX#${now}`,
          messageId,
          conversationId,
          senderId: request.senderId,
          recipientId: request.recipientId,
          content: request.encryptedMessage,
          messageType: 'text',
          media: request.media || [],
          status: MESSAGE_STATUS.DELIVERED,
          createdAt: now,
          type: "message"
        };
        
        await ddb.send(new PutCommand({ TableName: TABLE, Item: message }));
        
        const conversationMeta = {
          PK: `CONV#${conversationId}`,
          SK: "META",
          type: "conversation",
          conversationId,
          participants: [request.senderId, request.recipientId],
          lastMessageAt: now,
          lastMessagePreview: "🔒 Message",
          updatedAt: now
        };
        
        await ddb.send(new PutCommand({ TableName: TABLE, Item: conversationMeta }));
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: request.PK, SK: request.SK },
        UpdateExpression: "SET #status = :status, respondedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": action === 'accept' ? 'accepted' : 'declined',
          ":now": now
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        message: `Request ${action}ed`,
        status: action === 'accept' ? 'accepted' : 'declined'
      })};
    }

    // POLL MESSAGES - GET /messages/conversations/{conversationId}/poll
    if (method === "GET" && path.includes("/conversations/") && path.includes("/poll")) {
      const conversationId = event.pathParameters.conversationId;
      const since = event.queryStringParameters?.since;
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 10);

      let keyCondition = "PK = :pk AND begins_with(SK, :sk)";
      const values = {
        ":pk": `CONV#${conversationId}`,
        ":sk": "MSG#"
      };

      if (since) {
        keyCondition += " AND SK > :since";
        values[":since"] = `MSG#${since}#`;
      }

      const params = {
        TableName: TABLE,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: values,
        Limit: limit,
        ScanIndexForward: true
      };

      const result = await ddb.send(new QueryCommand(params));
      
      const filteredMessages = (result.Items || []).filter(message => {
        if (message.deletedForBoth) return false;
        if (userId && message.deletedBySender && message.senderId === userId) return false;
        if (userId && message.deletedByRecipient && message.recipientId === userId) return false;
        return true;
      });

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({
        messages: filteredMessages,
        hasMore: !!result.LastEvaluatedKey
      })};
    }

    // CLEAR CONVERSATION - DELETE /conversations/{conversationId}/clear
    if (method === "DELETE" && path.match(/^\/conversations\/[^\/]+\/clear$/)) {
      console.log('Clear conversation endpoint hit');
      console.log('Path parameters:', event.pathParameters);
      
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ message: "Authentication required" }) };
      }

      const conversationId = decodeURIComponent(event.pathParameters.conversationId);
      // Use extractUserIdFromToken instead of body
      const userId = extractUserIdFromToken(event);
      
      console.log('Decoded conversationId:', conversationId);
      console.log('UserId from token:', userId);

      if (!userId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      const messages = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CONV#${conversationId}`,
          ":sk": "MSG#"
        }
      }));

      const now = new Date().toISOString();
      
      for (const message of messages.Items || []) {
        const deleteAttr = message.senderId === userId ? 'deletedBySender' : 'deletedByRecipient';
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: message.PK, SK: message.SK },
          UpdateExpression: "SET #deleteAttr = :deleted, deletedAt = :now",
          ExpressionAttributeNames: { "#deleteAttr": deleteAttr },
          ExpressionAttributeValues: {
            ":deleted": true,
            ":now": now
          }
        }));
      }

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ 
        message: "conversation cleared",
        deletedCount: (messages.Items || []).length
      })};
    }

    // STORE PUBLIC KEYS - POST /users/public-keys
    if (method === "POST" && path === "/users/public-keys") {
      const authResult = checkAuth(event);
      console.log('Auth check result:', authResult);
      console.log('Authorization header:', event.headers?.Authorization || event.headers?.authorization);
      if (!authResult) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || '{}');
      const { bundle } = body;

      if (!bundle) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "bundle required" }) };
      }

      const now = new Date().toISOString();

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${userId}`,
          SK: "PUBLIC_KEYS",
          type: "public_keys",
          userId,
          bundle,
          createdAt: now,
          updatedAt: now
        }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, message: "Public keys stored" }) };
    }

    // GET PUBLIC KEYS - GET /users/{username}/public-keys
    if (method === "GET" && path.match(/^\/users\/[^\/]+\/public-keys$/)) {
      const identifier = event.pathParameters.username;

      if (!identifier) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ error: "identifier required" }) };
      }

      try {
        let userId = identifier;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

        if (!isUUID) {
          const userResult = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { PK: `USER#${identifier}`, SK: "PROFILE" }
          }));

          if (!userResult.Item) {
            return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "User not found" }) };
          }

          userId = userResult.Item.userId;
        }

        const result = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userId}`, SK: "PUBLIC_KEYS" }
        }));

        if (!result.Item) {
          return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Public keys not found" }) };
        }

        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ bundle: result.Item.bundle }) };
      } catch (error) {
        console.error('Get public keys error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to get public keys" }) };
      }
    }

    // DELETE MESSAGE - DELETE /messages/{messageId}
    if (method === "DELETE" && path.match(/^\/messages\/[^\/]+$/) && !path.includes('/reactions') && !path.includes('/star') && !path.includes('/pin')) {
      if (!checkAuth(event)) {
        return { statusCode: 401, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const messageId = event.pathParameters?.messageId || path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const { deleteForEveryone } = body;
      const userId = extractUserIdFromToken(event);

      try {
        // Use MessageIdIndex GSI for efficient lookup
        const result = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: 'MessageIdIndex',
          KeyConditionExpression: 'messageId = :mid',
          ExpressionAttributeValues: { ':mid': messageId },
          Limit: 1
        }));

        if (!result.Items?.[0]) {
          return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Message not found" }) };
        }

        const message = result.Items[0];
        const now = new Date().toISOString();

        if (deleteForEveryone) {
          if (message.senderId !== userId) {
            return { statusCode: 403, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Only sender can delete for everyone" }) };
          }
          
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: message.PK, SK: message.SK },
            UpdateExpression: "SET deletedForBoth = :deleted, deletedAt = :now",
            ExpressionAttributeValues: {
              ":deleted": true,
              ":now": now
            }
          }));

          // Send WebSocket notification to both sender and recipient
          const recipientId = message.senderId !== userId ? message.senderId : message.recipientId;
          const notificationData = {
            type: 'message_deleted',
            messageId: messageId,
            conversationId: message.conversationId,
            deletedAt: now,
            deleteForEveryone: true
          };

          // Only send WebSocket notifications if we have the endpoint
          if (process.env.WEBSOCKET_API_ENDPOINT) {
            const wsEndpoint = process.env.WEBSOCKET_API_ENDPOINT;
            
            // Notify recipient
            try {
              const recipientConnections = await ddb.send(new QueryCommand({
                TableName: WEBSOCKET_TABLE,
                IndexName: "userId-index",
                KeyConditionExpression: "userId = :uid",
                ExpressionAttributeValues: { ":uid": recipientId }
              }));

              if (recipientConnections.Items?.length > 0) {
                const apiGateway = new ApiGatewayManagementApiClient({
                  endpoint: wsEndpoint
                });

                for (const conn of recipientConnections.Items) {
                  try {
                    await apiGateway.send(new PostToConnectionCommand({
                      ConnectionId: conn.connectionId,
                      Data: Buffer.from(JSON.stringify(notificationData))
                    }));
                  } catch (e) {
                    if (e.statusCode === 410) {
                      await ddb.send(new DeleteCommand({
                        TableName: WEBSOCKET_TABLE,
                        Key: { connectionId: conn.connectionId }
                      }));
                    }
                  }
                }
              }
            } catch (err) {
              console.error('Error sending WebSocket notification to recipient:', err);
            }

            // Also notify sender's other connections
            try {
              const senderConnections = await ddb.send(new QueryCommand({
                TableName: WEBSOCKET_TABLE,
                IndexName: "userId-index",
                KeyConditionExpression: "userId = :uid",
                ExpressionAttributeValues: { ":uid": userId }
              }));

              if (senderConnections.Items?.length > 0) {
                const apiGateway = new ApiGatewayManagementApiClient({
                  endpoint: wsEndpoint
                });

                for (const conn of senderConnections.Items) {
                  try {
                    await apiGateway.send(new PostToConnectionCommand({
                      ConnectionId: conn.connectionId,
                      Data: Buffer.from(JSON.stringify(notificationData))
                    }));
                  } catch (e) {
                    if (e.statusCode === 410) {
                      await ddb.send(new DeleteCommand({
                        TableName: WEBSOCKET_TABLE,
                        Key: { connectionId: conn.connectionId }
                      }));
                    }
                  }
                }
              }
            } catch (err) {
              console.error('Error sending WebSocket notification to sender:', err);
            }
          }
        } else {
          const deleteAttr = message.senderId === userId ? 'deletedBySender' : 'deletedByRecipient';
          await ddb.send(new UpdateCommand({
            TableName: TABLE,
            Key: { PK: message.PK, SK: message.SK },
            UpdateExpression: "SET #deleteAttr = :deleted, deletedAt = :now",
            ExpressionAttributeNames: { "#deleteAttr": deleteAttr },
            ExpressionAttributeValues: {
              ":deleted": true,
              ":now": now
            }
          }));
        }

        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, message: "Message deleted" }) };
      } catch (error) {
        console.error('Delete message error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to delete message" }) };
      }
    }

    // ADD REACTION TO MESSAGE - POST /messages/{messageId}/reactions
    if (method === "POST" && path.match(/^\/messages\/[^\/]+\/reactions$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || "{}");
      const { emoji } = body;
      
      try {
        // Get the message using MessageIdIndex GSI
        const msgResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: 'MessageIdIndex',
          KeyConditionExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': messageId
          },
          Limit: 1
        }));
        
        if (!msgResult.Items || msgResult.Items.length === 0) {
          return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Message not found" }) };
        }
        
        const message = msgResult.Items[0];
        
        // Add reaction
        const reactions = message.reactions || [];
        const existingReaction = reactions.find(r => r.userId === userId);
        
        if (existingReaction) {
          // Update existing reaction
          existingReaction.emoji = emoji;
          existingReaction.timestamp = new Date().toISOString();
        } else {
          // Add new reaction
          reactions.push({
            userId,
            emoji,
            timestamp: new Date().toISOString()
          });
        }
        
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: message.PK, SK: message.SK },
          UpdateExpression: 'SET reactions = :reactions',
          ExpressionAttributeValues: { ':reactions': reactions }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, reactions }) };
      } catch (error) {
        console.error('Add reaction error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to add reaction" }) };
      }
    }

    // REMOVE REACTION FROM MESSAGE - DELETE /messages/{messageId}/reactions
    if (method === "DELETE" && path.match(/^\/messages\/[^\/]+\/reactions$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      
      try {
        // Get the message using MessageIdIndex GSI
        const msgResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: 'MessageIdIndex',
          KeyConditionExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': messageId
          },
          Limit: 1
        }));
        
        if (!msgResult.Items || msgResult.Items.length === 0) {
          return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Message not found" }) };
        }
        
        const message = msgResult.Items[0];
        const reactions = (message.reactions || []).filter(r => r.userId !== userId);
        
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: message.PK, SK: message.SK },
          UpdateExpression: 'SET reactions = :reactions',
          ExpressionAttributeValues: { ':reactions': reactions }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, reactions }) };
      } catch (error) {
        console.error('Remove reaction error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to remove reaction" }) };
      }
    }

    // STAR MESSAGE - PUT /messages/{messageId}/star
    if (method === "PUT" && path.match(/^\/messages\/[^\/]+\/star$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      
      try {
        // Add star record
        const starId = `STAR#${userId}#${messageId}`;
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `USER#${userId}`,
            SK: starId,
            type: 'starred_message',
            messageId,
            userId,
            starredAt: new Date().toISOString()
          }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      } catch (error) {
        console.error('Star message error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to star message" }) };
      }
    }

    // UNSTAR MESSAGE - DELETE /messages/{messageId}/star
    if (method === "DELETE" && path.match(/^\/messages\/[^\/]+\/star$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      
      try {
        const starId = `STAR#${userId}#${messageId}`;
        await ddb.send(new DeleteCommand({
          TableName: TABLE,
          Key: {
            PK: `USER#${userId}`,
            SK: starId
          }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      } catch (error) {
        console.error('Unstar message error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to unstar message" }) };
      }
    }

    // GET STARRED MESSAGES - GET /messages/starred
    if (method === "GET" && path === "/messages/starred") {
      const userId = extractUserIdFromToken(event);
      
      try {
        const result = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'STAR#'
          }
        }));
        
        const starred = result.Items || [];
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ starred }) };
      } catch (error) {
        console.error('Get starred messages error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to get starred messages" }) };
      }
    }

    // PIN MESSAGE - PUT /messages/{messageId}/pin
    if (method === "PUT" && path.match(/^\/messages\/[^\/]+\/pin$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || "{}");
      const { conversationId } = body;
      
      try {
        const pinId = `PIN#${conversationId}#${messageId}`;
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `USER#${userId}`,
            SK: pinId,
            type: 'pinned_message',
            messageId,
            userId,
            conversationId,
            pinnedAt: new Date().toISOString()
          }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      } catch (error) {
        console.error('Pin message error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to pin message" }) };
      }
    }

    // UNPIN MESSAGE - DELETE /messages/{messageId}/pin
    if (method === "DELETE" && path.match(/^\/messages\/[^\/]+\/pin$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      const queryParams = event.queryStringParameters || {};
      const conversationId = queryParams.conversationId;
      
      try {
        const pinId = `PIN#${conversationId}#${messageId}`;
        await ddb.send(new DeleteCommand({
          TableName: TABLE,
          Key: {
            PK: `USER#${userId}`,
            SK: pinId
          }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      } catch (error) {
        console.error('Unpin message error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to unpin message" }) };
      }
    }

    // GET PINNED MESSAGES - GET /conversations/{conversationId}/pinned
    if (method === "GET" && path.match(/^\/conversations\/[^\/]+\/pinned$/)) {
      const conversationId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      
      try {
        const result = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `PIN#${conversationId}#`
          }
        }));
        
        const pinned = result.Items || [];
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ pinned }) };
      } catch (error) {
        console.error('Get pinned messages error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to get pinned messages" }) };
      }
    }

    // FORWARD MESSAGES - POST /messages/forward
    if (method === "POST" && path === "/messages/forward") {
      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || "{}");
      const { messageIds, recipientUserIds } = body;
      
      try {
        const forwardedMessages = [];
        
        for (const recipientId of recipientUserIds) {
          for (const messageId of messageIds) {
            // Get original message using MessageIdIndex GSI
            const msgResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              IndexName: 'MessageIdIndex',
              KeyConditionExpression: 'messageId = :messageId',
              ExpressionAttributeValues: {
                ':messageId': messageId
              },
              Limit: 1
            }));
            
            if (msgResult.Items && msgResult.Items.length > 0) {
              const originalMsg = msgResult.Items[0];
              
              // Create new message as forward
              const newMessageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
              const conversationId = [userId, recipientId].sort().join('_');
              const timestamp = new Date().toISOString();
              
              const forwardedMsg = {
                PK: `CONV#${conversationId}`,
                SK: `MSG#${Date.now()}#${newMessageId}`,
                messageId: newMessageId,
                conversationId,
                senderId: userId,
                recipientId,
                content: originalMsg.content,
                messageType: originalMsg.messageType || 'text',
                encrypted: originalMsg.encrypted || false,
                encryptedData: originalMsg.encryptedData,
                media: originalMsg.media,
                status: 'sent',
                createdAt: timestamp,
                type: 'message',
                forwarded: true,
                forwardedFrom: messageId
              };
              
              await ddb.send(new PutCommand({
                TableName: TABLE,
                Item: forwardedMsg
              }));
              
              forwardedMessages.push(forwardedMsg);
            }
          }
        }
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true, forwarded: forwardedMessages }) };
      } catch (error) {
        console.error('Forward messages error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to forward messages" }) };
      }
    }

    // REPORT MESSAGE - POST /messages/{messageId}/report
    if (method === "POST" && path.match(/^\/messages\/[^\/]+\/report$/)) {
      const messageId = path.split('/')[2];
      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || "{}");
      const { reason, details } = body;
      
      try {
        const reportId = `REPORT#${Date.now()}`;
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `MESSAGE#${messageId}`,
            SK: reportId,
            type: 'report',
            messageId,
            reporterId: userId,
            reason,
            details: details || '',
            reportedAt: new Date().toISOString(),
            status: 'pending'
          }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      } catch (error) {
        console.error('Report message error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to report message" }) };
      }
    }

    // SAVE BACKGROUND PREFERENCE - PUT /users/background
    if (method === "PUT" && path === "/users/background") {
      const userId = extractUserIdFromToken(event);
      const body = JSON.parse(event.body || "{}");
      const { background } = body;
      
      try {
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: {
            PK: `USER#${userId}`,
            SK: `PROFILE#${userId}`
          },
          UpdateExpression: 'SET chatBackground = :bg',
          ExpressionAttributeValues: { ':bg': background }
        }));
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ success: true }) };
      } catch (error) {
        console.error('Save background error:', error);
        return { statusCode: 500, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Failed to save background" }) };
      }
    }

    console.log('=== UNHANDLED REQUEST ===');
    console.log('Method:', method);
    console.log('Path:', path);
    return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ error: "Route not found" }) };

  } catch (error) {
    console.error('Handler error:', error);
    return { 
      statusCode: 500, 
      headers: getCorsHeaders(event), 
      body: JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      }) 
    };
  }
};
