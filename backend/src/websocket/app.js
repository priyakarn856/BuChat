const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const WEBSOCKET_TABLE = process.env.WEBSOCKET_TABLE;
const APP_TABLE = process.env.APP_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// TTL for connection - 24 hours in seconds
const CONNECTION_TTL_SECONDS = 24 * 60 * 60;

// Helper to extract userId from token
const getUserIdFromToken = (event) => {
    try {
        // Check for userId directly first (for testing)
        const userId = event.queryStringParameters?.userId;
        if (userId) return userId;
        
        // Otherwise, decode from JWT token
        const token = event.queryStringParameters?.token;
        if (!token) return null;
        
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.userId || decoded.sub || decoded.id;
    } catch (error) {
        console.error('Failed to decode token:', error.message);
        return null;
    }
};

// Get API Gateway Management API client
const getApiGatewayClient = (event) => {
    const { domainName, stage } = event.requestContext;
    return new AWS.ApiGatewayManagementApi({
        endpoint: `${domainName}/${stage}`
    });
};

// Send message to a specific connection
const sendToConnection = async (apiGateway, connectionId, payload) => {
    try {
        await apiGateway.postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify(payload)
        }).promise();
        return true;
    } catch (error) {
        if (error.statusCode === 410) {
            // Connection is stale, clean up
            console.log(`Cleaning up stale connection: ${connectionId}`);
            await dynamodb.delete({
                TableName: WEBSOCKET_TABLE,
                Key: { connectionId }
            }).promise();
        }
        return false;
    }
};

exports.handler = async (event) => {
    const { routeKey, connectionId, domainName, stage } = event.requestContext;
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;

    console.log(`WebSocket ${routeKey}: connectionId=${connectionId}`);

    try {
        switch (routeKey) {
            case '$connect': {
                const userId = getUserIdFromToken(event);
                if (!userId) {
                    console.error('WebSocket $connect: No userId found in token or query params');
                    return { statusCode: 401, body: 'Unauthorized' };
                }
                
                console.log(`WebSocket $connect: Storing connection for user ${userId}`);
                
                // Store connection with TTL for automatic cleanup
                await dynamodb.put({
                    TableName: WEBSOCKET_TABLE,
                    Item: {
                        connectionId,
                        userId,
                        createdAt: now,
                        lastActivityAt: now,
                        ttl, // DynamoDB TTL for automatic cleanup
                        status: 'connected',
                        userAgent: event.headers?.['User-Agent'] || 'unknown',
                        endpoint: `${domainName}/${stage}`
                    },
                }).promise();

                // Update user's online status in main app table
                try {
                    await dynamodb.update({
                        TableName: APP_TABLE,
                        Key: { 
                            PK: `USER#${userId}`,
                            SK: 'PROFILE'
                        },
                        UpdateExpression: 'SET #online = :online, lastSeen = :now',
                        ExpressionAttributeNames: {
                            '#online': 'isOnline'
                        },
                        ExpressionAttributeValues: {
                            ':online': true,
                            ':now': now
                        }
                    }).promise();
                } catch (e) {
                    console.warn('Failed to update user online status:', e.message);
                }

                return { statusCode: 200, body: 'Connected' };
            }

            case '$disconnect': {
                console.log(`WebSocket $disconnect: Removing connection ${connectionId}`);
                
                // Get the user info before deleting
                let userId = null;
                try {
                    const result = await dynamodb.get({
                        TableName: WEBSOCKET_TABLE,
                        Key: { connectionId }
                    }).promise();
                    userId = result.Item?.userId;
                } catch (e) {
                    console.warn('Could not get userId for disconnect:', e.message);
                }

                // Delete the connection
                await dynamodb.delete({
                    TableName: WEBSOCKET_TABLE,
                    Key: { connectionId },
                }).promise();

                // Update user's online status if no other connections exist
                if (userId) {
                    try {
                        // Check if user has other active connections
                        const connections = await dynamodb.query({
                            TableName: WEBSOCKET_TABLE,
                            IndexName: 'userId-index',
                            KeyConditionExpression: 'userId = :userId',
                            ExpressionAttributeValues: { ':userId': userId }
                        }).promise();

                        // If no other connections, mark user as offline
                        if (connections.Items.length === 0) {
                            await dynamodb.update({
                                TableName: APP_TABLE,
                                Key: {
                                    PK: `USER#${userId}`,
                                    SK: 'PROFILE'
                                },
                                UpdateExpression: 'SET #online = :online, lastSeen = :now',
                                ExpressionAttributeNames: {
                                    '#online': 'isOnline'
                                },
                                ExpressionAttributeValues: {
                                    ':online': false,
                                    ':now': now
                                }
                            }).promise();
                        }
                    } catch (e) {
                        console.warn('Failed to update user offline status:', e.message);
                    }
                }

                return { statusCode: 200, body: 'Disconnected' };
            }

            case 'subscribe': {
                const body = JSON.parse(event.body || '{}');
                const { conversationId } = body;
                
                if (!conversationId) {
                    return { statusCode: 400, body: 'Missing conversationId' };
                }

                console.log(`WebSocket subscribe: ${connectionId} -> ${conversationId}`);
                
                await dynamodb.update({
                    TableName: WEBSOCKET_TABLE,
                    Key: { connectionId },
                    UpdateExpression: 'ADD conversations :c SET lastActivityAt = :now',
                    ExpressionAttributeValues: {
                        ':c': dynamodb.createSet([conversationId]),
                        ':now': now
                    },
                }).promise();

                return { statusCode: 200, body: 'Subscribed' };
            }
                
            case 'unsubscribe': {
                const body = JSON.parse(event.body || '{}');
                const { conversationId } = body;
                
                if (!conversationId) {
                    return { statusCode: 400, body: 'Missing conversationId' };
                }

                console.log(`WebSocket unsubscribe: ${connectionId} -> ${conversationId}`);
                
                await dynamodb.update({
                    TableName: WEBSOCKET_TABLE,
                    Key: { connectionId },
                    UpdateExpression: 'DELETE conversations :c SET lastActivityAt = :now',
                    ExpressionAttributeValues: {
                        ':c': dynamodb.createSet([conversationId]),
                        ':now': now
                    },
                }).promise();

                return { statusCode: 200, body: 'Unsubscribed' };
            }

            case 'ping': {
                // Heartbeat - update last activity time
                console.log(`WebSocket ping: ${connectionId}`);
                
                const newTtl = Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
                
                await dynamodb.update({
                    TableName: WEBSOCKET_TABLE,
                    Key: { connectionId },
                    UpdateExpression: 'SET lastActivityAt = :now, #ttl = :ttl',
                    ExpressionAttributeNames: {
                        '#ttl': 'ttl'
                    },
                    ExpressionAttributeValues: {
                        ':now': now,
                        ':ttl': newTtl
                    }
                }).promise();

                // Send pong response
                const apiGateway = getApiGatewayClient(event);
                await sendToConnection(apiGateway, connectionId, {
                    action: 'pong',
                    timestamp: now
                });

                return { statusCode: 200, body: 'Pong' };
            }

            case 'typing': {
                // Handle typing indicator
                const body = JSON.parse(event.body || '{}');
                const { conversationId, isTyping } = body;
                
                if (!conversationId) {
                    return { statusCode: 400, body: 'Missing conversationId' };
                }

                // Get the user for this connection
                const connResult = await dynamodb.get({
                    TableName: WEBSOCKET_TABLE,
                    Key: { connectionId }
                }).promise();

                if (!connResult.Item) {
                    return { statusCode: 404, body: 'Connection not found' };
                }

                const userId = connResult.Item.userId;

                // Find all users subscribed to this conversation
                const allConnections = await dynamodb.scan({
                    TableName: WEBSOCKET_TABLE,
                    FilterExpression: 'contains(conversations, :convId)',
                    ExpressionAttributeValues: {
                        ':convId': conversationId
                    }
                }).promise();

                const apiGateway = getApiGatewayClient(event);
                const typingPayload = {
                    action: 'typing',
                    conversationId,
                    userId,
                    isTyping: isTyping !== false,
                    timestamp: now
                };

                // Broadcast typing indicator to all subscribers except sender
                await Promise.all(
                    allConnections.Items
                        .filter(conn => conn.connectionId !== connectionId)
                        .map(conn => sendToConnection(apiGateway, conn.connectionId, typingPayload))
                );

                return { statusCode: 200, body: 'Typing sent' };
            }

            case 'presence': {
                // Get online users for a conversation
                const body = JSON.parse(event.body || '{}');
                const { conversationId } = body;

                if (!conversationId) {
                    return { statusCode: 400, body: 'Missing conversationId' };
                }

                // Get all connections subscribed to this conversation
                const allConnections = await dynamodb.scan({
                    TableName: WEBSOCKET_TABLE,
                    FilterExpression: 'contains(conversations, :convId)',
                    ExpressionAttributeValues: {
                        ':convId': conversationId
                    }
                }).promise();

                const onlineUsers = [...new Set(allConnections.Items.map(c => c.userId))];

                const apiGateway = getApiGatewayClient(event);
                await sendToConnection(apiGateway, connectionId, {
                    action: 'presence',
                    conversationId,
                    onlineUsers,
                    timestamp: now
                });

                return { statusCode: 200, body: 'Presence sent' };
            }

            case '$default':
            default: {
                // Handle unknown actions gracefully
                console.log(`WebSocket default route: ${event.body}`);
                
                const body = JSON.parse(event.body || '{}');
                const { action } = body;

                // Route based on action in body if not matched by routeKey
                if (action === 'ping') {
                    return exports.handler({ ...event, requestContext: { ...event.requestContext, routeKey: 'ping' } });
                }
                if (action === 'typing') {
                    return exports.handler({ ...event, requestContext: { ...event.requestContext, routeKey: 'typing' } });
                }
                if (action === 'subscribe') {
                    return exports.handler({ ...event, requestContext: { ...event.requestContext, routeKey: 'subscribe' } });
                }
                if (action === 'unsubscribe') {
                    return exports.handler({ ...event, requestContext: { ...event.requestContext, routeKey: 'unsubscribe' } });
                }
                if (action === 'presence') {
                    return exports.handler({ ...event, requestContext: { ...event.requestContext, routeKey: 'presence' } });
                }

                // Send back an acknowledgment for unknown actions
                const apiGateway = getApiGatewayClient(event);
                await sendToConnection(apiGateway, connectionId, {
                    action: 'ack',
                    message: 'Message received',
                    timestamp: now
                });

                return { statusCode: 200, body: 'Message received' };
            }
        }

    } catch (err) {
        console.error('WebSocket handler error:', err);
        return { statusCode: 500, body: 'Internal Server Error' };
    }
};
