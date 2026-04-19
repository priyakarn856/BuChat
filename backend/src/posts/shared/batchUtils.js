const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Batch get users by userId (UUID) using the GSI.
const batchGetUsers = async (ddb, TABLE, userIds) => {
  if (!userIds || userIds.length === 0) return {};
  
  const uniqueIds = [...new Set(userIds)];
  const userMap = {};

  // Create a promise for each user ID to query the GSI.
  const promises = uniqueIds.map(id => {
      return ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1', // Query the secondary index
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `USERID#${id}`, // Use the correct GSI PK format
          ':sk': 'PROFILE'
        },
        ProjectionExpression: 'userId, username, avatar, displayName',
        Limit: 1
      }));
  });

  // Wait for all queries to complete
  const results = await Promise.all(promises);
  
  // Process the results and build the map
  results.forEach(result => {
    if (result.Items && result.Items.length > 0) {
      const user = result.Items[0];
      userMap[user.userId] = {
        username: user.username,
        avatar: user.avatar,
        displayName: user.displayName
      };
    }
  });
  
  return userMap;
};

module.exports = { batchGetUsers };
