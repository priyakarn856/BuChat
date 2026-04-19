const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const WEBSOCKET_TABLE = process.env.WEBSOCKET_TABLE;

/**
 * Send a message to a specific user across all their connected devices
 * @param {string} userId - The target user ID
 * @param {object} message - The message payload to send
 * @param {AWS.ApiGatewayManagementApi} apiGatewayManagementApi - The API Gateway management client
 * @returns {Promise<{sent: number, failed: number}>} - Number of successful and failed sends
 */
async function sendToUser(userId, message, apiGatewayManagementApi) {
    let sent = 0;
    let failed = 0;

    try {
        const result = await dynamodb.query({
            TableName: WEBSOCKET_TABLE,
            IndexName: 'userId-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': userId },
        }).promise();

        if (!result.Items || result.Items.length === 0) {
            console.log(`No connections found for user: ${userId}`);
            return { sent: 0, failed: 0 };
        }

        const postCalls = result.Items.map(async ({ connectionId }) => {
            try {
                await apiGatewayManagementApi.postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(message),
                }).promise();
                sent++;
            } catch (e) {
                if (e.statusCode === 410) {
                    // Connection is stale, clean up
                    console.log(`Cleaning up stale connection: ${connectionId}`);
                    await dynamodb.delete({
                        TableName: WEBSOCKET_TABLE,
                        Key: { connectionId },
                    }).promise();
                } else {
                    console.error(`Failed to send to ${connectionId}:`, e.message);
                }
                failed++;
            }
        });

        await Promise.all(postCalls);
    } catch (error) {
        console.error(`Error querying connections for user ${userId}:`, error);
    }

    return { sent, failed };
}

/**
 * Broadcast a message to all users subscribed to a conversation
 * @param {string} conversationId - The conversation ID to broadcast to
 * @param {object} message - The message payload to send
 * @param {AWS.ApiGatewayManagementApi} apiGatewayManagementApi - The API Gateway management client
 * @param {string} excludeConnectionId - Optional connection ID to exclude from broadcast
 * @returns {Promise<{sent: number, failed: number}>} - Number of successful and failed sends
 */
async function sendToConversation(conversationId, message, apiGatewayManagementApi, excludeConnectionId = null) {
    let sent = 0;
    let failed = 0;

    try {
        // Find all connections subscribed to this conversation
        const result = await dynamodb.scan({
            TableName: WEBSOCKET_TABLE,
            FilterExpression: 'contains(conversations, :convId)',
            ExpressionAttributeValues: {
                ':convId': conversationId
            }
        }).promise();

        if (!result.Items || result.Items.length === 0) {
            console.log(`No subscribers found for conversation: ${conversationId}`);
            return { sent: 0, failed: 0 };
        }

        const postCalls = result.Items
            .filter(item => item.connectionId !== excludeConnectionId)
            .map(async ({ connectionId }) => {
                try {
                    await apiGatewayManagementApi.postToConnection({
                        ConnectionId: connectionId,
                        Data: JSON.stringify(message),
                    }).promise();
                    sent++;
                } catch (e) {
                    if (e.statusCode === 410) {
                        // Connection is stale, clean up
                        console.log(`Cleaning up stale connection: ${connectionId}`);
                        await dynamodb.delete({
                            TableName: WEBSOCKET_TABLE,
                            Key: { connectionId },
                        }).promise();
                    } else {
                        console.error(`Failed to send to ${connectionId}:`, e.message);
                    }
                    failed++;
                }
            });

        await Promise.all(postCalls);
    } catch (error) {
        console.error(`Error broadcasting to conversation ${conversationId}:`, error);
    }

    return { sent, failed };
}

/**
 * Broadcast a message to multiple users
 * @param {string[]} userIds - Array of user IDs to send to
 * @param {object} message - The message payload to send
 * @param {AWS.ApiGatewayManagementApi} apiGatewayManagementApi - The API Gateway management client
 * @returns {Promise<{sent: number, failed: number}>} - Number of successful and failed sends
 */
async function sendToUsers(userIds, message, apiGatewayManagementApi) {
    let totalSent = 0;
    let totalFailed = 0;

    const results = await Promise.all(
        userIds.map(userId => sendToUser(userId, message, apiGatewayManagementApi))
    );

    results.forEach(({ sent, failed }) => {
        totalSent += sent;
        totalFailed += failed;
    });

    return { sent: totalSent, failed: totalFailed };
}

/**
 * Broadcast a message to all connected clients (use sparingly)
 * @param {object} message - The message payload to send
 * @param {AWS.ApiGatewayManagementApi} apiGatewayManagementApi - The API Gateway management client
 * @returns {Promise<{sent: number, failed: number}>} - Number of successful and failed sends
 */
async function broadcastToAll(message, apiGatewayManagementApi) {
    let sent = 0;
    let failed = 0;

    try {
        const result = await dynamodb.scan({
            TableName: WEBSOCKET_TABLE,
            ProjectionExpression: 'connectionId'
        }).promise();

        const postCalls = result.Items.map(async ({ connectionId }) => {
            try {
                await apiGatewayManagementApi.postToConnection({
                    ConnectionId: connectionId,
                    Data: JSON.stringify(message),
                }).promise();
                sent++;
            } catch (e) {
                if (e.statusCode === 410) {
                    await dynamodb.delete({
                        TableName: WEBSOCKET_TABLE,
                        Key: { connectionId },
                    }).promise();
                }
                failed++;
            }
        });

        await Promise.all(postCalls);
    } catch (error) {
        console.error('Error broadcasting to all:', error);
    }

    return { sent, failed };
}

/**
 * Get online status for multiple users
 * @param {string[]} userIds - Array of user IDs to check
 * @returns {Promise<Object<string, boolean>>} - Map of userId to online status
 */
async function getOnlineStatus(userIds) {
    const status = {};
    
    try {
        const queries = userIds.map(async (userId) => {
            const result = await dynamodb.query({
                TableName: WEBSOCKET_TABLE,
                IndexName: 'userId-index',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId },
                Select: 'COUNT'
            }).promise();
            
            status[userId] = result.Count > 0;
        });

        await Promise.all(queries);
    } catch (error) {
        console.error('Error getting online status:', error);
    }

    return status;
}

/**
 * Get all active connections for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - Array of connection items
 */
async function getUserConnections(userId) {
    try {
        const result = await dynamodb.query({
            TableName: WEBSOCKET_TABLE,
            IndexName: 'userId-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': userId }
        }).promise();

        return result.Items || [];
    } catch (error) {
        console.error(`Error getting connections for user ${userId}:`, error);
        return [];
    }
}

/**
 * Create an API Gateway Management API client
 * @param {string} endpoint - The WebSocket API endpoint (domain/stage)
 * @returns {AWS.ApiGatewayManagementApi} - The client
 */
function createApiGatewayClient(endpoint) {
    return new AWS.ApiGatewayManagementApi({
        endpoint: endpoint.startsWith('https://') ? endpoint : `https://${endpoint}`
    });
}

module.exports = { 
    sendToUser,
    sendToConversation,
    sendToUsers,
    broadcastToAll,
    getOnlineStatus,
    getUserConnections,
    createApiGatewayClient
};
