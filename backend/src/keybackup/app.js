const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getCorsHeaders, handlePreflight } = require('./shared/cors');

const TABLE_NAME = process.env.APP_TABLE;
const JWT_SECRET = process.env.JWT_SECRET;

// Verify JWT token and extract userId
function verifyToken(event) {
  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId || decoded.sub || decoded.id;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

exports.handler = async (event) => {
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  const path = event.path;
  const method = event.httpMethod;

  try {
    // Public key bundles can be fetched by anyone (needed for key exchange)
    // But backup/restore must be authenticated
    
    // Upload public key bundle (requires auth - user can only upload their own)
    if (method === 'POST' && path.includes('/keybackup/upload')) {
      const authenticatedUserId = verifyToken(event);
      const { userId, bundle } = JSON.parse(event.body);
      
      // Verify user is uploading their own bundle
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Not authorized to upload bundle for this user' })
        };
      }
      
      await dynamodb.put({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: 'KEYBUNDLE',
          bundle,
          updatedAt: Date.now()
        }
      }).promise();

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ success: true })
      };
    }

    // Get public key bundle
    if (method === 'GET' && path.includes('/keybackup/bundle')) {
      const userId = event.pathParameters?.userId;
      
      const result = await dynamodb.get({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'KEYBUNDLE' }
      }).promise();

      if (!result.Item?.bundle) {
        return {
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Bundle not found' })
        };
      }

      return {
        statusCode: 200,
        headers: {
          ...getCorsHeaders(event),
          // CRITICAL: Prevent caching of encryption bundles
          // Keys rotate frequently, must always fetch fresh from DynamoDB
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({ bundle: result.Item.bundle })
      };
    }

    // Delete public key bundle (used when clearing stale keys)
    if (method === 'DELETE' && path.includes('/keybackup/bundle')) {
      const authenticatedUserId = verifyToken(event);
      const userId = event.pathParameters?.userId;
      
      // Verify user is deleting their own bundle
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Not authorized to delete bundle for this user' })
        };
      }
      
      await dynamodb.delete({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'KEYBUNDLE' }
      }).promise();

      console.log(`Deleted stale KEYBUNDLE for user ${userId}`);
      
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ success: true, message: 'Bundle deleted' })
      };
    }

    // Backup encrypted keys to cloud (requires auth)
    if (method === 'POST' && path.includes('/keybackup/backup')) {
      const authenticatedUserId = verifyToken(event);
      const { userId, encryptedKeys } = JSON.parse(event.body);
      
      // Verify user is backing up their own keys
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Not authorized to backup keys for this user' })
        };
      }
      
      await dynamodb.put({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: 'BACKUP',
          encryptedKeys,
          updatedAt: Date.now()
        }
      }).promise();

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ success: true })
      };
    }

    // Restore keys from cloud (requires auth)
    if (method === 'GET' && path.includes('/keybackup/restore')) {
      const authenticatedUserId = verifyToken(event);
      const userId = event.pathParameters?.userId;
      
      // Verify user is restoring their own keys
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Not authorized to restore keys for this user' })
        };
      }
      
      const result = await dynamodb.get({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'BACKUP' }
      }).promise();

      if (!result.Item?.encryptedKeys) {
        return {
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'No backup found' })
        };
      }

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ encryptedKeys: result.Item.encryptedKeys })
      };
    }

    // Delete cloud backup and key bundle (requires auth)
    if (method === 'DELETE' && path.includes('/keybackup/reset')) {
      const authenticatedUserId = verifyToken(event);
      const userId = event.pathParameters?.userId;
      
      // Verify user is resetting their own keys
      if (!authenticatedUserId || authenticatedUserId !== userId) {
        return {
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ error: 'Not authorized to reset keys for this user' })
        };
      }
      
      // Delete both BACKUP and KEYBUNDLE
      await dynamodb.delete({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'BACKUP' }
      }).promise();
      
      await dynamodb.delete({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: 'KEYBUNDLE' }
      }).promise();

      console.log(`Deleted cloud backup and key bundle for user: ${userId}`);

      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ success: true, message: 'Cloud keys reset successfully' })
      };
    }

    return {
      statusCode: 404,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ error: error.message })
    };
  }
};
