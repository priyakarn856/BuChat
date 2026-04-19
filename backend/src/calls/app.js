const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const jwt = require('jsonwebtoken');
const { getCorsHeaders, handlePreflight, createResponse, getHeaderCaseInsensitive } = require('./shared/cors');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.APP_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';

const verifyToken = (event) => {
  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return { valid: false };
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded.sub || decoded.id;
    console.log('Token decoded - userId:', userId, 'full payload:', JSON.stringify(decoded));
    return { valid: true, userId };
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return { valid: false };
  }
};

async function initiateCall(event, userId) {
  const { recipientId, callType, offer } = JSON.parse(event.body);
  
  if (!recipientId || !callType || !offer) {
    return createResponse(event, 400, { message: "recipientId, callType, and offer required" });
  }

  console.log('Initiate call - callerId:', userId, 'recipientId:', recipientId, 'callType:', callType);

  const callId = `CALL#${Date.now()}#${userId}`;
  const timestamp = new Date().toISOString();

  const call = {
    PK: callId,
    SK: "METADATA",
    callerId: userId,
    recipientId: recipientId,
    callType,
    status: "ringing",
    offer,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: Math.floor(Date.now() / 1000) + 60
  };

  console.log('Storing call with recipientId:', call.recipientId);
  await ddb.send(new PutCommand({ TableName: TABLE, Item: call }));

  const notification = {
    PK: `USER#${recipientId}`,
    SK: `NOTIFICATION#${Date.now()}`,
    GSI1PK: `USERID#${recipientId}`,
    GSI1SK: `NOTIFICATION#${Date.now()}`,
    type: "call",
    callId,
    callerId: userId,
    callType,
    status: "ringing",
    createdAt: timestamp,
    read: false
  };

  console.log('Creating notification for recipientId:', recipientId, 'PK:', notification.PK, 'GSI1PK:', notification.GSI1PK);
  await ddb.send(new PutCommand({ TableName: TABLE, Item: notification }));

  return createResponse(event, 201, { callId, status: "ringing" });
}

async function answerCall(event, userId, callId) {
  const { answer } = JSON.parse(event.body);
  
  if (!answer) {
    return createResponse(event, 400, { message: "answer required" });
  }

  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" }
  }));

  console.log('Answer call - userId from token:', userId, 'recipientId in call:', result.Item?.recipientId, 'callId:', callId);

  if (!result.Item) {
    return createResponse(event, 404, { message: "call not found" });
  }
  
  // CRITICAL FIX: Normalize both IDs for comparison (handle string/object mismatches)
  const normalizedTokenUserId = String(userId || '').trim();
  const normalizedRecipientId = String(result.Item.recipientId || '').trim();
  
  const isRecipient = normalizedTokenUserId === normalizedRecipientId;
  
  if (!isRecipient) {
    console.error('Authorization failed - Token userId:', normalizedTokenUserId, 'Call recipientId:', normalizedRecipientId);
    return createResponse(event, 403, { 
      message: "not authorized - you are not the recipient of this call",
      tokenUserId: normalizedTokenUserId,
      callRecipientId: normalizedRecipientId
    });
  }
  
  if (result.Item.status !== "ringing") {
    return createResponse(event, 400, { message: `call not ringing - status: ${result.Item.status}` });
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" },
    UpdateExpression: "SET #status = :status, answer = :answer, answeredAt = :timestamp, updatedAt = :timestamp",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": "active",
      ":answer": answer,
      ":timestamp": new Date().toISOString()
    }
  }));

  return createResponse(event, 200, { status: "active", answer });
}

async function endCall(event, userId, callId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" }
  }));

  if (!result.Item) {
    return createResponse(event, 404, { message: "call not found" });
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedCallerId = String(result.Item.callerId || '').trim();
  const normalizedRecipientId = String(result.Item.recipientId || '').trim();
  
  const isAuthorized = normalizedUserId === normalizedCallerId || normalizedUserId === normalizedRecipientId;
  
  if (!isAuthorized) {
    console.error('End call auth failed - userId:', normalizedUserId, 'callerId:', normalizedCallerId, 'recipientId:', normalizedRecipientId);
    return createResponse(event, 403, { message: "not authorized" });
  }

  const endedAt = new Date().toISOString();
  const duration = result.Item.answeredAt 
    ? Math.floor((new Date(endedAt) - new Date(result.Item.answeredAt)) / 1000)
    : 0;

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" },
    UpdateExpression: "SET #status = :status, endedAt = :endedAt, #duration = :duration, updatedAt = :timestamp",
    ExpressionAttributeNames: { "#status": "status", "#duration": "duration" },
    ExpressionAttributeValues: {
      ":status": "ended",
      ":endedAt": endedAt,
      ":duration": duration,
      ":timestamp": endedAt
    }
  }));

  return createResponse(event, 200, { status: "ended", duration });
}

async function rejectCall(event, userId, callId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" }
  }));

  if (!result.Item) {
    return createResponse(event, 404, { message: "call not found" });
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedRecipientId = String(result.Item.recipientId || '').trim();
  
  if (normalizedUserId !== normalizedRecipientId) {
    console.error('Reject call auth failed - userId:', normalizedUserId, 'recipientId:', normalizedRecipientId);
    return createResponse(event, 403, { message: "not authorized - only recipient can reject" });
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" },
    UpdateExpression: "SET #status = :status, updatedAt = :timestamp",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": "rejected",
      ":timestamp": new Date().toISOString()
    }
  }));

  return createResponse(event, 200, { status: "rejected" });
}

async function getCallStatus(event, userId, callId) {
  try {
    console.log('Entering getCallStatus');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log(`Getting status for callId: ${callId} for userId: ${userId}`);

    const result = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: callId, SK: "METADATA" }
    }));

    console.log('DynamoDB result:', JSON.stringify(result, null, 2));

    if (!result.Item) {
      return createResponse(event, 404, { message: "call not found" });
    }

    const normalizedUserId = String(userId || '').trim();
    const normalizedCallerId = String(result.Item.callerId || '').trim();
    const normalizedRecipientId = String(result.Item.recipientId || '').trim();
    
    const isAuthorized = normalizedUserId === normalizedCallerId || normalizedUserId === normalizedRecipientId;
    
    if (!isAuthorized) {
      console.error('Get call status auth failed - userId:', normalizedUserId, 'callerId:', normalizedCallerId, 'recipientId:', normalizedRecipientId);
      return createResponse(event, 403, { message: "not authorized" });
    }

    return createResponse(event, 200, result.Item);
  } catch (error) {
    console.error('Error in getCallStatus:', error);
    // Re-throwing the error will cause the main handler's catch block to execute,
    // which returns a 500 internal error response.
    throw error;
  }
}

async function exchangeIceCandidate(event, userId, callId) {
  const { candidate } = JSON.parse(event.body);
  
  if (!candidate) {
    return createResponse(event, 400, { message: "candidate required" });
  }

  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" }
  }));

  if (!result.Item) {
    return createResponse(event, 404, { message: "call not found" });
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedCallerId = String(result.Item.callerId || '').trim();
  const normalizedRecipientId = String(result.Item.recipientId || '').trim();
  
  const isAuthorized = normalizedUserId === normalizedCallerId || normalizedUserId === normalizedRecipientId;
  
  if (!isAuthorized) {
    return createResponse(event, 403, { message: "not authorized" });
  }

  const candidateId = `ICE#${Date.now()}`;
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: callId,
      SK: candidateId,
      userId,
      candidate,
      createdAt: new Date().toISOString()
    }
  }));

  return createResponse(event, 201, { candidateId });
}

async function getIceCandidates(event, userId, callId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: callId, SK: "METADATA" }
  }));

  if (!result.Item) {
    return createResponse(event, 404, { message: "call not found" });
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedCallerId = String(result.Item.callerId || '').trim();
  const normalizedRecipientId = String(result.Item.recipientId || '').trim();
  
  const isAuthorized = normalizedUserId === normalizedCallerId || normalizedUserId === normalizedRecipientId;
  
  if (!isAuthorized) {
    return createResponse(event, 403, { message: "not authorized" });
  }

  const candidates = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": callId,
      ":sk": "ICE#"
    }
  }));

  return createResponse(event, 200, { candidates: candidates.Items || [] });
}

exports.handler = async (event) => {
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;

  try {
    const authResult = verifyToken(event);
    if (!authResult.valid) {
      return createResponse(event, 401, { message: "unauthorized" });
    }

    const userId = authResult.userId;
    const method = event.requestContext.httpMethod;
    const path = event.path;

    if (method === "POST" && path === "/calls") {
      return await initiateCall(event, userId);
    }

    if (method === "POST" && path.match(/^\/calls\/[^/]+\/answer$/)) {
      const callId = decodeURIComponent(path.split("/")[2]);
      return await answerCall(event, userId, callId);
    }

    if (method === "POST" && path.match(/^\/calls\/[^/]+\/end$/)) {
      const callId = decodeURIComponent(path.split("/")[2]);
      return await endCall(event, userId, callId);
    }

    if (method === "POST" && path.match(/^\/calls\/[^/]+\/reject$/)) {
      const callId = decodeURIComponent(path.split("/")[2]);
      return await rejectCall(event, userId, callId);
    }

    if (method === "GET" && path.match(/^\/calls\/[^/]+$/)) {
      const callId = decodeURIComponent(path.split("/")[2]);
      return await getCallStatus(event, userId, callId);
    }

    if (method === "POST" && path.match(/^\/calls\/[^/]+\/ice$/)) {
      const callId = decodeURIComponent(path.split("/")[2]);
      return await exchangeIceCandidate(event, userId, callId);
    }

    if (method === "GET" && path.match(/^\/calls\/[^/]+\/ice$/)) {
      const callId = decodeURIComponent(path.split("/")[2]);
      return await getIceCandidates(event, userId, callId);
    }

    return createResponse(event, 400, { message: "bad request" });
  } catch (err) {
    console.error("error", err);
    return createResponse(event, 500, { message: "internal error" });
  }
};
