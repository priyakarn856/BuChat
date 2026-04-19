const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');
const cache = require('./shared/cache');
const { batchGetUsers } = require('./shared/batchUtils');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = process.env.APP_TABLE;

// CORS headers


exports.handler = async (event) => {
  
  // Handle OPTIONS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;

    // CREATE GROUP - POST /groups
    if (method === "POST" && path === "/groups") {
      const body = JSON.parse(event.body || "{}");
      const { name, displayName, description, category, rules, creator, creatorId, avatar } = body;

      if (!name || !displayName || !creator) {
        return createResponse(event, 400, { message: "name, displayName, and creator required" });
      }

      // Check if group already exists
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" }
      }));

      if (existing.Item) {
        return createResponse(event, 409, { message: "group already exists" });
      }

      const now = new Date().toISOString();
      const groupId = uuidv4();

      const item = {
        PK: `GROUP#${name}`,
        SK: "META",
        GSI1PK: "GROUP",
        GSI1SK: `CREATED#${now}`,
        type: "group",
        groupId,
        name,
        displayName,
        description: description || "",
        category: category || "general",
        rules: rules || [],
        creator: creator,
        creatorId: creatorId || "",
        avatar: avatar || "",
        visibility: "public", // All groups are public
        memberCount: 0,
        postCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      return createResponse(event, 201, { 
          groupId, 
          name, 
          displayName,
          creator,
          createdAt: now 
        });
    }

    // GET GROUP - GET /groups/{name}
    if (method === "GET" && event.pathParameters && event.pathParameters.name) {
      const name = event.pathParameters.name;
      
      // Check if this is a membership check: /groups/{name}/members/{userId}
      if (path.includes("/members/")) {
        const pathParts = path.split('/');
        const userId = pathParts[pathParts.length - 1];
        
        // First check if user is the owner
        const groupResult = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `GROUP#${name}`, SK: "META" }
        }));
        
        if (groupResult.Item && groupResult.Item.creatorId === userId) {
          return createResponse(event, 200, { isMember: true, isOwner: true, role: 'owner' });
        }
        
        // Check membership
        const result = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `GROUP#${name}`, SK: `MEMBER#${userId}` }
        }));

        if (!result.Item) {
          return createResponse(event, 404, { isMember: false });
        }

        return createResponse(event, 200, { isMember: true, ...result.Item });
      }

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" }
      }));

      if (!result.Item) {
        return createResponse(event, 404, { message: "group not found" });
      }

      return createResponse(event, 200, result.Item);
    }

    // LIST ALL GROUPS - GET /groups
    if (method === "GET" && path === "/groups") {
      const limit = event.queryStringParameters?.limit || 20;
      const lastKey = event.queryStringParameters?.lastKey;
      const userId = event.queryStringParameters?.userId;

      const params = {
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": "GROUP" },
        Limit: parseInt(limit) * 3,
        ScanIndexForward: false
      };

      if (lastKey) {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      }

      const result = await ddb.send(new QueryCommand(params));
      let groups = result.Items || [];

      // If userId provided, get smart suggestions
      if (userId) {
        // Get user's joined groups
        const userGroupsResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "JOINED#"
          }
        }));
        const joinedGroupNames = (userGroupsResult.Items || []).map(m => m.groupName);

        // Get user's followed users
        const followsResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "FOLLOWING#"
          }
        }));
        const followedUserIds = (followsResult.Items || []).map(f => f.followingId);

        // Score groups
        const scoredGroups = await Promise.all(groups.map(async (group) => {
          let score = 0;
          
          // Skip user's own groups and joined groups
          if (group.creatorId === userId || joinedGroupNames.includes(group.name)) {
            return { ...group, score: -1, isMember: true };
          }

          // Check if followed users are members (score: 4)
          if (followedUserIds.length > 0) {
            const memberCheckResults = await Promise.all(
              followedUserIds.slice(0, 10).map(async (fUserId) => {
                try {
                  const memberResult = await ddb.send(new GetCommand({
                    TableName: TABLE,
                    Key: { PK: `GROUP#${group.name}`, SK: `MEMBER#${fUserId}` }
                  }));
                  return memberResult.Item ? 1 : 0;
                } catch {
                  return 0;
                }
              })
            );
            score += memberCheckResults.reduce((a, b) => a + b, 0) * 4;
          }

          // Popular groups (member count, score: 3)
          score += Math.min((group.memberCount || 0) / 10, 3);

          // New groups (created in last 7 days, score: 2)
          const daysSinceCreation = (Date.now() - new Date(group.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceCreation <= 7) {
            score += 2;
          }

          return { ...group, score, isMember: false, isNew: daysSinceCreation <= 7 };
        }));

        // Filter and sort
        let suggestedGroups = scoredGroups
          .filter(g => g.score >= 0)
          .sort((a, b) => b.score - a.score);

        // Ensure minimum 5 groups
        if (suggestedGroups.length < parseInt(limit)) {
          const neededCount = parseInt(limit) - suggestedGroups.length;
          const existingNames = new Set([...joinedGroupNames, ...suggestedGroups.map(g => g.name)]);
          
          const additionalGroups = groups
            .filter(g => !existingNames.has(g.name) && g.creatorId !== userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, neededCount)
            .map(g => ({ ...g, score: 0, isMember: false, isNew: true }));

          suggestedGroups = [...suggestedGroups, ...additionalGroups];
        }

        groups = suggestedGroups.slice(0, parseInt(limit));
      } else {
        groups = groups.slice(0, parseInt(limit));
      }

      return createResponse(event, 200, {
          groups,
          lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null
        });
    }

    // JOIN GROUP - POST /groups/{name}/join
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/join")) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const now = new Date().toISOString();

      // Add membership record
      const memberItem = {
        PK: `GROUP#${name}`,
        SK: `MEMBER#${userId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `JOINED#${now}`,
        type: "membership",
        userId,
        groupName: name,
        role: "member",
        joinedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: memberItem }));

      // Increment member count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" },
        UpdateExpression: "ADD memberCount :inc SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":inc": 1,
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "joined successfully", joinedAt: now });
    }

    // LEAVE GROUP - POST /groups/{name}/leave
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/leave")) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { userId } = body;

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      const now = new Date().toISOString();

      // Remove membership record
      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: `MEMBER#${userId}` }
      }));

      // Decrement member count
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" },
        UpdateExpression: "ADD memberCount :dec SET updatedAt = :now",
        ExpressionAttributeValues: { 
          ":dec": -1,
          ":now": now
        }
      }));

      return createResponse(event, 200, { message: "left successfully" });
    }

    // ADD GROUP FLAIR - POST /groups/{name}/flairs
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/flairs")) {
      const group = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { text, backgroundColor, textColor, moderatorOnly } = body;

      if (!text) {
        return createResponse(event, 400, { message: "flair text required" });
      }

      const flairId = uuidv4();
      const now = new Date().toISOString();

      const flair = {
        PK: `GROUP#${group}`,
        SK: `FLAIR#${flairId}`,
        type: "flair",
        flairId,
        text,
        backgroundColor: backgroundColor || "#0079d3",
        textColor: textColor || "#ffffff",
        moderatorOnly: moderatorOnly || false,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: flair }));

      return createResponse(event, 201, { flairId, message: "flair created" });
    }

    // GET GROUP FLAIRS - GET /groups/{name}/flairs
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.includes("/flairs")) {
      const group = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${group}`,
          ":sk": "FLAIR#"
        }
      }));

      return createResponse(event, 200, { flairs: result.Items || [] });
    }

    // UPDATE GROUP SETTINGS - PUT /groups/{name}/settings
    if (method === "PUT" && event.pathParameters && event.pathParameters.name && path.includes("/settings")) {
      const group = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { 
        description, 
        type, // public, restricted, private
        nsfw, 
        allowImages, 
        allowVideos, 
        allowPolls,
        requirePostApproval,
        welcomeMessage,
        primaryColor,
        icon,
        banner
      } = body;

      const now = new Date().toISOString();
      const updates = ["updatedAt = :now"];
      const values = { ":now": now };

      if (description !== undefined) {
        updates.push("description = :desc");
        values[":desc"] = description;
      }
      if (type !== undefined) {
        updates.push("#type = :type");
        values[":type"] = type;
      }
      if (nsfw !== undefined) {
        updates.push("nsfw = :nsfw");
        values[":nsfw"] = nsfw;
      }
      if (allowImages !== undefined) {
        updates.push("allowImages = :img");
        values[":img"] = allowImages;
      }
      if (allowVideos !== undefined) {
        updates.push("allowVideos = :vid");
        values[":vid"] = allowVideos;
      }
      if (allowPolls !== undefined) {
        updates.push("allowPolls = :polls");
        values[":polls"] = allowPolls;
      }
      if (requirePostApproval !== undefined) {
        updates.push("requirePostApproval = :approval");
        values[":approval"] = requirePostApproval;
      }
      if (welcomeMessage !== undefined) {
        updates.push("welcomeMessage = :welcome");
        values[":welcome"] = welcomeMessage;
      }
      if (primaryColor !== undefined) {
        updates.push("primaryColor = :color");
        values[":color"] = primaryColor;
      }
      if (icon !== undefined) {
        updates.push("icon = :icon");
        values[":icon"] = icon;
      }
      if (banner !== undefined) {
        updates.push("banner = :banner");
        values[":banner"] = banner;
      }

      const attributeNames = {};
      if (type !== undefined) {
        attributeNames["#type"] = "type";
      }

      const updateExpression = `SET ${updates.join(", ")}`;

      const params = {
        TableName: TABLE,
        Key: { PK: `GROUP#${group}`, SK: "META" },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values
      };

      if (Object.keys(attributeNames).length > 0) {
        params.ExpressionAttributeNames = attributeNames;
      }

      await ddb.send(new UpdateCommand(params));

      return createResponse(event, 200, { message: "settings updated" });
    }

    // ADD GROUP RULE - POST /groups/{name}/rules
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/rules")) {
      const group = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { title, description, order } = body;

      if (!title) {
        return createResponse(event, 400, { message: "rule title required" });
      }

      const ruleId = uuidv4();
      const now = new Date().toISOString();

      const rule = {
        PK: `GROUP#${group}`,
        SK: `RULE#${ruleId}`,
        type: "rule",
        ruleId,
        title,
        description: description || "",
        order: order || 0,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: rule }));

      return createResponse(event, 201, { ruleId, message: "rule added" });
    }

    // GET GROUP RULES - GET /groups/{name}/rules
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.includes("/rules")) {
      const group = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${group}`,
          ":sk": "RULE#"
        }
      }));

      const rules = (result.Items || []).sort((a, b) => (a.order || 0) - (b.order || 0));

      return createResponse(event, 200, { rules });
    }

    // ADD GROUP WIDGET - POST /groups/{name}/widgets
    if (method === "POST" && event.pathParameters && event.pathParameters.name && path.includes("/widgets")) {
      const group = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { widgetType, title, content, order } = body;

      if (!widgetType) {
        return createResponse(event, 400, { message: "widgetType required" });
      }

      const widgetId = uuidv4();
      const now = new Date().toISOString();

      const widget = {
        PK: `GROUP#${group}`,
        SK: `WIDGET#${widgetId}`,
        type: "widget",
        widgetId,
        widgetType, // text, rules, moderators, calendar, button
        title: title || "",
        content: content || {},
        order: order || 0,
        createdAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: widget }));

      return createResponse(event, 201, { widgetId, message: "widget added" });
    }

    // GET GROUP WIDGETS - GET /groups/{name}/widgets
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.includes("/widgets")) {
      const group = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${group}`,
          ":sk": "WIDGET#"
        }
      }));

      const widgets = (result.Items || []).sort((a, b) => (a.order || 0) - (b.order || 0));

      return createResponse(event, 200, { widgets });
    }

    // GET USER'S JOINED GROUPS - GET /users/{username}/groups
    if (method === "GET" && event.pathParameters && event.pathParameters.username && path.includes("/groups")) {
      const username = event.pathParameters.username;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${username}`,
          ":sk": "JOINED#"
        }
      }));

      return createResponse(event, 200, { groups: result.Items || [] });
    }

    // INVITE MODERATOR - POST /groups/{name}/moderators/invite
    if (method === "POST" && path.includes("/moderators/invite")) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { userId, username, requesterId, permissions } = body;

      if (!userId || !username || !requesterId) {
        return createResponse(event, 400, { message: "userId, username, and requesterId required" });
      }

      // Verify requester is the owner
      const groupResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" }
      }));

      if (!groupResult.Item || groupResult.Item.creatorId !== requesterId) {
        return createResponse(event, 403, { message: "Only owner can invite moderators" });
      }

      const now = new Date().toISOString();
      const inviteId = uuidv4();

      const inviteItem = {
        PK: `GROUP#${name}`,
        SK: `MOD_INVITE#${inviteId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `MOD_INVITE#${now}`,
        type: "mod_invite",
        inviteId,
        userId,
        username,
        groupName: name,
        permissions: permissions || { removePosts: true, removeMembers: false, banMembers: false, changeVisibility: false },
        status: "pending",
        invitedBy: requesterId,
        invitedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: inviteItem }));

      return createResponse(event, 200, { message: "Moderator invite sent", inviteId });
    }

    // RESPOND TO MOD INVITE - POST /groups/{name}/moderators/respond
    if (method === "POST" && path.includes("/moderators/respond")) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { inviteId, userId, accept } = body;

      if (!inviteId || !userId || accept === undefined) {
        return createResponse(event, 400, { message: "inviteId, userId, and accept required" });
      }

      // Get invite
      const inviteResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: `MOD_INVITE#${inviteId}` }
      }));

      if (!inviteResult.Item || inviteResult.Item.userId !== userId) {
        return createResponse(event, 404, { message: "Invite not found" });
      }

      const now = new Date().toISOString();

      if (accept) {
        // Add as moderator
        const modItem = {
          PK: `GROUP#${name}`,
          SK: `MODERATOR#${userId}`,
          type: "moderator",
          userId,
          username: inviteResult.Item.username,
          groupName: name,
          permissions: inviteResult.Item.permissions,
          appointedAt: now,
          appointedBy: inviteResult.Item.invitedBy
        };

        await ddb.send(new PutCommand({ TableName: TABLE, Item: modItem }));
      }

      // Delete invite
      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: `MOD_INVITE#${inviteId}` }
      }));

      return createResponse(event, 200, { message: accept ? "Moderator invite accepted" : "Invite declined" });
    }

    // REMOVE MODERATOR - DELETE /groups/{name}/moderators/{userId}
    if (method === "DELETE" && event.pathParameters && event.pathParameters.name && path.includes("/moderators/")) {
      const name = event.pathParameters.name;
      const userId = event.pathParameters.userId;
      const body = JSON.parse(event.body || "{}");
      const { requesterId } = body;

      if (!requesterId) {
        return createResponse(event, 400, { message: "requesterId required" });
      }

      // Verify requester is the owner
      const groupResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" }
      }));

      if (!groupResult.Item || groupResult.Item.creatorId !== requesterId) {
        return createResponse(event, 403, { message: "Only owner can remove moderators" });
      }

      const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: `MODERATOR#${userId}` }
      }));

      return createResponse(event, 200, { message: "Moderator removed" });
    }

    // GET MODERATORS - GET /groups/{name}/moderators
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.endsWith("/moderators")) {
      const name = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${name}`,
          ":sk": "MODERATOR#"
        }
      }));

      return createResponse(event, 200, { moderators: result.Items || [] });
    }

    // GET MEMBERS - GET /groups/{name}/members
    if (method === "GET" && event.pathParameters && event.pathParameters.name && path.endsWith("/members")) {
      const name = event.pathParameters.name;

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `GROUP#${name}`,
          ":sk": "MEMBER#"
        }
      }));

      return createResponse(event, 200, { members: result.Items || [] });
    }

    // DISCOVER GROUPS - GET /groups/discover
    if (method === "GET" && path === "/groups/discover") {
      const userId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 20);

      if (!userId) {
        return createResponse(event, 400, { message: "userId required" });
      }

      try {
        // OPTIMIZED: Use cache for group discovery
        const discoverCacheKey = `group_discover:${userId}:${limit}`;
        let cachedGroups = cache.get(discoverCacheKey);
        
        if (cachedGroups) {
          return createResponse(event, 200, { groups: cachedGroups });
        }

        // Get all groups using GSI1
        const allGroupsResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: { ":pk": "GROUP" },
          Limit: 100
        }));

        const allGroups = allGroupsResult.Items || [];

        // Get user's joined groups
        const userGroupsResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
            ":sk": "JOINED#"
          }
        }));
        const joinedGroupNames = (userGroupsResult.Items || []).map(m => m.groupName);

        // Filter out joined groups and user's own groups
        const availableGroups = allGroups.filter(group => 
          !joinedGroupNames.includes(group.name) && 
          group.creatorId !== userId &&
          group.status === 'active'
        );

        // Sort by member count and creation date
        const discoveredGroups = availableGroups
          .sort((a, b) => {
            const memberCountDiff = (b.memberCount || 0) - (a.memberCount || 0);
            if (memberCountDiff !== 0) return memberCountDiff;
            return new Date(b.createdAt) - new Date(a.createdAt);
          })
          .slice(0, limit)
          .map(group => ({
            ...group,
            isNew: (Date.now() - new Date(group.createdAt).getTime()) < (7 * 24 * 60 * 60 * 1000)
          }));

        // Cache for 5 minutes
        cache.set(discoverCacheKey, discoveredGroups, 300000);

        return createResponse(event, 200, { groups: discoveredGroups });
      } catch (error) {
        console.error('Group discovery error:', error);
        return createResponse(event, 500, { message: "internal error", error: error.message });
      }
    }

    // UPDATE GROUP - PUT /groups/{name}
    if (method === "PUT" && event.pathParameters && event.pathParameters.name && !path.includes("/", path.lastIndexOf(event.pathParameters.name) + event.pathParameters.name.length)) {
      const name = event.pathParameters.name;
      const body = JSON.parse(event.body || "{}");
      const { requesterId, membershipApproval, description, displayName, icon, banner } = body;

      if (!requesterId) {
        return createResponse(event, 400, { message: "requesterId required" });
      }

      // Verify requester is the owner
      const groupResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" }
      }));

      if (!groupResult.Item || groupResult.Item.creatorId !== requesterId) {
        return createResponse(event, 403, { message: "Only owner can update group" });
      }

      const now = new Date().toISOString();
      const updates = ["updatedAt = :now"];
      const values = { ":now": now };

      if (membershipApproval !== undefined) {
        updates.push("membershipApproval = :approval");
        values[":approval"] = membershipApproval;
      }
      if (description !== undefined) {
        updates.push("description = :desc");
        values[":desc"] = description;
      }
      if (displayName !== undefined) {
        updates.push("displayName = :display");
        values[":display"] = displayName;
      }
      if (icon !== undefined) {
        updates.push("icon = :icon");
        values[":icon"] = icon;
      }
      if (banner !== undefined) {
        updates.push("banner = :banner");
        values[":banner"] = banner;
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `GROUP#${name}`, SK: "META" },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeValues: values
      }));

      return createResponse(event, 200, { message: "Group updated" });
    }

    return createResponse(event, 400, { message: "bad request" });

  } catch (err) {
    console.error("groups error", err);
    return createResponse(event, 500, { message: "internal error", error: err.message });
  }
};
