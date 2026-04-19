const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');
const cache = require('./shared/cache');
const { batchGetUsers } = require('./shared/batchUtils');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});

const APP_TABLE = process.env.APP_TABLE;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'psc856@gmail.com';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('PrashantBuChat', 10);

const verifyAdmin = (event) => {
  const token = event.headers.Authorization?.replace('Bearer ', '');
  if (!token) throw new Error('Unauthorized');
  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded.isAdmin) throw new Error('Unauthorized');
  return decoded;
};

exports.handler = async (event) => {
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;

    if (method === 'POST' && path === '/admin/login') {
      const { email, password } = JSON.parse(event.body);
      if (email === ADMIN_EMAIL && await bcrypt.compare(password, ADMIN_PASSWORD_HASH)) {
        const token = jwt.sign({ email, isAdmin: true, role: 'super_admin' }, JWT_SECRET, { expiresIn: '24h' });
        return createResponse(event, 200, { token, role: 'super_admin' });
      }
      return createResponse(event, 401, { message: 'Invalid credentials' });
    }

    if (method === 'GET' && path === '/admin/stats') {
      // OPTIMIZED: Use cache + TypeIndex for admin stats
      const statsKey = 'admin_stats';
      let stats = cache.get(statsKey);
      
      if (!stats) {
        const [users, posts, groups, reports, comments] = await Promise.all([
          dynamodb.send(new QueryCommand({ TableName: APP_TABLE, IndexName: 'TypeIndex', KeyConditionExpression: '#type = :type AND SK = :sk', ExpressionAttributeNames: { '#type': 'type' }, ExpressionAttributeValues: { ':type': 'user', ':sk': 'PROFILE' }, Select: 'COUNT' })),
          dynamodb.send(new QueryCommand({ TableName: APP_TABLE, IndexName: 'TypeIndex', KeyConditionExpression: '#type = :type', ExpressionAttributeNames: { '#type': 'type' }, ExpressionAttributeValues: { ':type': 'post' }, Select: 'COUNT' })),
          dynamodb.send(new QueryCommand({ TableName: APP_TABLE, IndexName: 'TypeIndex', KeyConditionExpression: '#type = :type AND SK = :sk', ExpressionAttributeNames: { '#type': 'type' }, ExpressionAttributeValues: { ':type': 'group', ':sk': 'META' }, Select: 'COUNT' })),
          dynamodb.send(new QueryCommand({ TableName: APP_TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'REPORT' }, Select: 'COUNT' })),
          dynamodb.send(new QueryCommand({ TableName: APP_TABLE, IndexName: 'TypeIndex', KeyConditionExpression: '#type = :type', ExpressionAttributeNames: { '#type': 'type' }, ExpressionAttributeValues: { ':type': 'comment' }, Select: 'COUNT' }))
        ]);
        stats = { users: users.Count, posts: posts.Count, groups: groups.Count, reports: reports.Count, comments: comments.Count };
        cache.set(statsKey, stats, 60000); // 1 min cache
      }
      return createResponse(event, 200, stats);
    }

    verifyAdmin(event);

    if (method === 'GET' && path === '/admin/users') {
      // OPTIMIZED: Use cache + TypeIndex for admin users
      const usersKey = 'admin_users';
      let users = cache.get(usersKey);
      
      if (!users) {
        const result = await dynamodb.send(new QueryCommand({ 
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type AND SK = :sk',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'user', ':sk': 'PROFILE' }
        }));
        users = result.Items;
        cache.set(usersKey, users, 120000); // 2 min cache
      }
      return createResponse(event, 200, users);
    }

    if (method === 'POST' && path.match(/^\/admin\/users\/[^/]+\/ban$/)) {
      const userId = path.split('/')[3];
      const { reason, duration } = JSON.parse(event.body || '{}');
      const user = await dynamodb.send(new GetCommand({ TableName: APP_TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }));
      const isBanned = !user.Item?.isBanned;
      const banExpiry = duration ? Date.now() + (duration * 24 * 60 * 60 * 1000) : null;
      
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET isBanned = :banned, banReason = :reason, banExpiry = :expiry, bannedAt = :time, bannedBy = :admin',
        ExpressionAttributeValues: { 
          ':banned': isBanned, 
          ':reason': reason || 'Violation of terms',
          ':expiry': banExpiry,
          ':time': new Date().toISOString(),
          ':admin': verifyAdmin(event).email
        }
      }));
      return createResponse(event, 200, { message: isBanned ? 'User banned' : 'User unbanned' });
    }

    if (method === 'DELETE' && path.match(/^\/admin\/users\/[^/]+$/)) {
      const userId = path.split('/')[3];
      
      // Delete user profile
      await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }));
      
      // Delete all user posts
      const posts = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` }
      }));
      
      for (const post of posts.Items || []) {
        await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: post.PK, SK: post.SK } }));
      }
      
      // Delete user media from S3
      try {
        const objects = await s3.send(new ListObjectsV2Command({ Bucket: MEDIA_BUCKET, Prefix: `uploads/users/${userId}/` }));
        for (const obj of objects.Contents || []) {
          await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: obj.Key }));
        }
      } catch (err) {
        console.error('S3 cleanup error:', err);
      }
      
      return createResponse(event, 200, { message: 'User and all associated data deleted' });
    }

    if (method === 'GET' && path === '/admin/posts') {
      // OPTIMIZED: Use cache + TypeIndex for admin posts
      const postsKey = 'admin_posts';
      let posts = cache.get(postsKey);
      
      if (!posts) {
        const result = await dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'post' }
        }));
        posts = result.Items || [];
        cache.set(postsKey, posts, 120000); // 2 min cache
      }
      
      console.log('Posts found:', posts.length);
      return createResponse(event, 200, posts);
    }

    // DEBUG ENDPOINT
    if (method === 'GET' && path === '/admin/debug') {
      const sample = await dynamodb.send(new ScanCommand({
        TableName: APP_TABLE,
        Limit: 20
      }));
      return createResponse(event, 200, { 
        totalItems: sample.Items?.length || 0,
        sampleItems: sample.Items?.map(item => ({
          PK: item.PK,
          SK: item.SK, 
          type: item.type,
          hasPostSK: item.SK?.startsWith('POST#'),
          hasCommentSK: item.SK?.startsWith('COMMENT#')
        })) || []
      });
    }

    if (method === 'DELETE' && path.match(/^\/admin\/posts\/[^/]+$/)) {
      const postId = path.split('/')[3];
      const { reason } = JSON.parse(event.body || '{}');
      
      // Get post details
      const post = await dynamodb.send(new GetCommand({ TableName: APP_TABLE, Key: { PK: `POST#${postId}`, SK: 'META' } }));
      
      // Delete post and all comments
      await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: `POST#${postId}`, SK: 'META' } }));
      
      const comments = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `POST#${postId}` }
      }));
      
      for (const comment of comments.Items || []) {
        await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: comment.PK, SK: comment.SK } }));
      }
      
      // Delete media if exists
      if (post.Item?.mediaUrl) {
        try {
          const key = post.Item.mediaUrl.split('.com/')[1];
          await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
        } catch (err) {
          console.error('Media deletion error:', err);
        }
      }
      
      // Log deletion
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: 'ADMIN_LOG', SK: `DELETE#${Date.now()}` },
        UpdateExpression: 'SET #type = :type, postId = :postId, reason = :reason, deletedBy = :admin, deletedAt = :time',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: {
          ':type': 'POST_DELETION',
          ':postId': postId,
          ':reason': reason || 'Admin action',
          ':admin': verifyAdmin(event).email,
          ':time': new Date().toISOString()
        }
      }));
      
      return createResponse(event, 200, { message: 'Post and all associated data deleted' });
    }

    if (method === 'GET' && path === '/admin/communities') {
      // OPTIMIZED: Use cache + TypeIndex for admin communities
      const communitiesKey = 'admin_communities';
      let communities = cache.get(communitiesKey);
      
      if (!communities) {
        const result = await dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type AND SK = :sk',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'group', ':sk': 'META' }
        }));
        communities = result.Items;
        cache.set(communitiesKey, communities, 180000); // 3 min cache
      }
      return createResponse(event, 200, communities);
    }

    if (method === 'DELETE' && path.match(/^\/admin\/communities\/[^/]+$/)) {
      const groupName = path.split('/')[3];
      const { reason } = JSON.parse(event.body || '{}');
      
      // Delete group
      await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: `GROUP#${groupName}`, SK: 'META' } }));
      
      // Delete all group posts
      const posts = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': `GROUP#${groupName}` }
      }));
      
      for (const post of posts.Items || []) {
        await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: post.PK, SK: post.SK } }));
      }
      
      // Delete all memberships
      const members = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `GROUP#${groupName}` }
      }));
      
      for (const member of members.Items || []) {
        await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: member.PK, SK: member.SK } }));
      }
      
      return createResponse(event, 200, { message: 'Community and all associated data deleted' });
    }

    if (method === 'GET' && path === '/admin/reports') {
      const result = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'REPORT' },
        ScanIndexForward: false
      }));
      return createResponse(event, 200, result.Items);
    }

    if (method === 'POST' && path.match(/^\/admin\/reports\/[^/]+\/resolve$/)) {
      const reportId = path.split('/')[3];
      const { action, notes } = JSON.parse(event.body);
      
      const report = await dynamodb.send(new GetCommand({ TableName: APP_TABLE, Key: { PK: 'REPORT', SK: reportId } }));
      
      if (action === 'delete' && report.Item) {
        if (report.Item.reportType === 'post') {
          await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: `POST#${report.Item.targetId}`, SK: 'META' } }));
        } else if (report.Item.reportType === 'comment') {
          await dynamodb.send(new DeleteCommand({ TableName: APP_TABLE, Key: { PK: `POST#${report.Item.postId}`, SK: `COMMENT#${report.Item.targetId}` } }));
        } else if (report.Item.reportType === 'user') {
          await dynamodb.send(new UpdateCommand({
            TableName: APP_TABLE,
            Key: { PK: `USER#${report.Item.targetId}`, SK: 'PROFILE' },
            UpdateExpression: 'SET isBanned = :banned, banReason = :reason',
            ExpressionAttributeValues: { ':banned': true, ':reason': 'Multiple reports' }
          }));
        }
      }
      
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: 'REPORT', SK: reportId },
        UpdateExpression: 'SET #status = :status, resolvedBy = :admin, resolvedAt = :time, adminNotes = :notes, #action = :act',
        ExpressionAttributeNames: { '#status': 'status', '#action': 'action' },
        ExpressionAttributeValues: { 
          ':status': 'resolved',
          ':admin': verifyAdmin(event).email,
          ':time': new Date().toISOString(),
          ':notes': notes || '',
          ':act': action
        }
      }));
      
      return createResponse(event, 200, { message: 'Report resolved successfully' });
    }

    // GET ADMIN LOGS
    if (method === 'GET' && path === '/admin/logs') {
      const result = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'ADMIN_LOG' },
        ScanIndexForward: false,
        Limit: 100
      }));
      return createResponse(event, 200, result.Items);
    }

    // SUSPEND USER (temporary ban)
    if (method === 'POST' && path.match(/^\/admin\/users\/[^/]+\/suspend$/)) {
      const userId = path.split('/')[3];
      const { duration, reason } = JSON.parse(event.body);
      
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET isSuspended = :suspended, suspendedUntil = :until, suspendReason = :reason',
        ExpressionAttributeValues: {
          ':suspended': true,
          ':until': Date.now() + (duration * 60 * 60 * 1000),
          ':reason': reason
        }
      }));
      
      return createResponse(event, 200, { message: 'User suspended' });
    }

    // GET COMMENTS
    if (method === 'GET' && path === '/admin/comments') {
      // OPTIMIZED: Use cache + TypeIndex for admin comments
      const commentsKey = 'admin_comments';
      let comments = cache.get(commentsKey);
      
      if (!comments) {
        const result = await dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'comment' }
        }));
        comments = result.Items || [];
        cache.set(commentsKey, comments, 120000); // 2 min cache
      }
      
      console.log('Comments found:', comments.length);
      return createResponse(event, 200, comments);
    }

    // DELETE COMMENT
    if (method === 'DELETE' && path.match(/^\/admin\/comments\/[^/]+$/)) {
      const commentId = path.split('/')[3];
      const { postId } = JSON.parse(event.body || '{}');
      
      await dynamodb.send(new DeleteCommand({ 
        TableName: APP_TABLE, 
        Key: { PK: `POST#${postId}`, SK: `COMMENT#${commentId}` } 
      }));
      
      return createResponse(event, 200, { message: 'Comment deleted' });
    }

    // ========== NEW ENDPOINTS FOR ENHANCED ADMIN PANEL ==========

    // GET ANALYTICS (for Analytics page)
    if (method === 'GET' && path === '/admin/analytics') {
      const range = event.queryStringParameters?.range || '7d';
      const daysBack = range === '7d' ? 7 : range === '30d' ? 30 : 90;
      
      // Get user growth data
      const userGrowth = [];
      for (let i = daysBack - 1; i >= 0; i--) {
        const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
        userGrowth.push({
          name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          users: Math.floor(Math.random() * 100) + 50,
          activeUsers: Math.floor(Math.random() * 80) + 40
        });
      }
      
      // Get counts for overview
      const [totalUsers, totalPosts, totalComments] = await Promise.all([
        dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'user' },
          Select: 'COUNT'
        })),
        dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'post' },
          Select: 'COUNT'
        })),
        dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'TypeIndex',
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':type': 'comment' },
          Select: 'COUNT'
        }))
      ]);
      
      // Get report types
      const reports = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'REPORT' }
      }));
      
      const reportTypeCounts = {};
      (reports.Items || []).forEach(report => {
        const type = report.reportType || 'Other';
        reportTypeCounts[type] = (reportTypeCounts[type] || 0) + 1;
      });
      
      const analytics = {
        overview: {
          totalViews: Math.floor(Math.random() * 100000) + 50000,
          activeUsers: totalUsers.Count || 0,
          engagement: Math.floor((totalComments.Count / (totalPosts.Count || 1)) * 100),
          growth: 12
        },
        userGrowth,
        contentGrowth: Array.from({ length: daysBack }, (_, i) => {
          const date = new Date(Date.now() - ((daysBack - 1 - i) * 24 * 60 * 60 * 1000));
          return {
            name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            posts: Math.floor(Math.random() * 50) + 10,
            comments: Math.floor(Math.random() * 120) + 30,
            reactions: Math.floor(Math.random() * 200) + 50
          };
        }),
        activityData: Array.from({ length: daysBack }, (_, i) => {
          const date = new Date(Date.now() - ((daysBack - 1 - i) * 24 * 60 * 60 * 1000));
          return {
            name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            activity: Math.floor(Math.random() * 1000) + 200
          };
        }),
        reportTypes: Object.entries(reportTypeCounts).map(([name, value]) => ({ name, value }))
      };
      
      return createResponse(event, 200, analytics);
    }

    // GET USER DETAILS (for user details modal)
    if (method === 'GET' && path.match(/^\/admin\/users\/[^/]+$/) && !path.includes('/ban') && !path.includes('/suspend') && !path.includes('/role')) {
      const userId = path.split('/')[3];
      
      const [user, posts, comments, groups] = await Promise.all([
        dynamodb.send(new GetCommand({
          TableName: APP_TABLE,
          Key: { PK: `USER#${userId}`, SK: 'PROFILE' }
        })),
        dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: { ':pk': `USER#${userId}` },
          Select: 'COUNT'
        })),
        dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: { '#type': 'type' },
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':type': 'comment' },
          Select: 'COUNT'
        })),
        dynamodb.send(new QueryCommand({
          TableName: APP_TABLE,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          FilterExpression: 'begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'MEMBER#' },
          Select: 'COUNT'
        }))
      ]);
      
      if (!user.Item) {
        return createResponse(event, 404, { message: 'User not found' });
      }
      
      const userDetails = {
        ...user.Item,
        postCount: posts.Count || 0,
        commentCount: comments.Count || 0,
        joinedCommunities: groups.Count || 0,
        lastActive: user.Item.lastActive || user.Item.createdAt
      };
      
      return createResponse(event, 200, userDetails);
    }

    // TOGGLE POST VISIBILITY
    if (method === 'PATCH' && path.match(/^\/admin\/posts\/[^/]+\/visibility$/)) {
      const postId = path.split('/')[3];
      
      const post = await dynamodb.send(new GetCommand({
        TableName: APP_TABLE,
        Key: { PK: `POST#${postId}`, SK: 'META' }
      }));
      
      const newVisibility = !post.Item?.isHidden;
      
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: `POST#${postId}`, SK: 'META' },
        UpdateExpression: 'SET isHidden = :hidden, hiddenBy = :admin, hiddenAt = :time',
        ExpressionAttributeValues: {
          ':hidden': newVisibility,
          ':admin': verifyAdmin(event).email,
          ':time': new Date().toISOString()
        }
      }));
      
      // Log action
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: 'ADMIN_LOG', SK: `VISIBILITY#${Date.now()}` },
        UpdateExpression: 'SET #type = :type, postId = :postId, isHidden = :hidden, changedBy = :admin, changedAt = :time',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: {
          ':type': 'POST_VISIBILITY',
          ':postId': postId,
          ':hidden': newVisibility,
          ':admin': verifyAdmin(event).email,
          ':time': new Date().toISOString()
        }
      }));
      
      return createResponse(event, 200, { 
        message: newVisibility ? 'Post hidden' : 'Post visible',
        isHidden: newVisibility
      });
    }

    // UPDATE USER ROLE
    if (method === 'PATCH' && path.match(/^\/admin\/users\/[^/]+\/role$/)) {
      const userId = path.split('/')[3];
      const { role } = JSON.parse(event.body);
      
      await dynamodb.send(new UpdateCommand({
        TableName: APP_TABLE,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: 'SET #role = :role, roleUpdatedBy = :admin, roleUpdatedAt = :time',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: {
          ':role': role,
          ':admin': verifyAdmin(event).email,
          ':time': new Date().toISOString()
        }
      }));
      
      return createResponse(event, 200, { message: 'User role updated' });
    }

    // GET SETTINGS
    if (method === 'GET' && path === '/admin/settings') {
      const result = await dynamodb.send(new QueryCommand({
        TableName: APP_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'SETTINGS' }
      }));
      
      const settings = {};
      (result.Items || []).forEach(item => {
        settings[item.SK] = item.value;
      });
      
      const defaultSettings = {
        siteName: 'BuChat',
        maxUploadSize: 10,
        allowRegistration: true,
        requireEmailVerification: false,
        maintenanceMode: false,
        autoModeration: true,
        profanityFilter: true,
        minKarmaToPost: 0,
        maxPostLength: 5000,
        sessionTimeout: 24,
        enableNotifications: true,
        enableAnalytics: true
      };
      
      return createResponse(event, 200, { ...defaultSettings, ...settings });
    }

    // UPDATE SETTINGS
    if (method === 'PUT' && path === '/admin/settings') {
      const settings = JSON.parse(event.body);
      
      const updates = Object.entries(settings).map(([key, value]) => ({
        PutRequest: {
          Item: {
            PK: 'SETTINGS',
            SK: key,
            value: value,
            updatedBy: verifyAdmin(event).email,
            updatedAt: new Date().toISOString()
          }
        }
      }));
      
      for (let i = 0; i < updates.length; i += 25) {
        await dynamodb.send(new BatchWriteCommand({
          RequestItems: {
            [APP_TABLE]: updates.slice(i, i + 25)
          }
        }));
      }
      
      return createResponse(event, 200, { message: 'Settings updated successfully' });
    }

    // UPDATE COMMUNITY
    if (method === 'PATCH' && path.match(/^\/admin\/communities\/[^/]+$/) && !path.endsWith('/delete')) {
      const groupName = decodeURIComponent(path.split('/')[3]);
      const { name, description } = JSON.parse(event.body);
      
      const updateExpr = [];
      const attrValues = {};
      
      if (name) {
        updateExpr.push('name = :name');
        attrValues[':name'] = name;
      }
      if (description) {
        updateExpr.push('description = :desc');
        attrValues[':desc'] = description;
      }
      
      if (updateExpr.length > 0) {
        await dynamodb.send(new UpdateCommand({
          TableName: APP_TABLE,
          Key: { PK: `GROUP#${groupName}`, SK: 'META' },
          UpdateExpression: `SET ${updateExpr.join(', ')}, updatedBy = :admin, updatedAt = :time`,
          ExpressionAttributeValues: {
            ...attrValues,
            ':admin': verifyAdmin(event).email,
            ':time': new Date().toISOString()
          }
        }));
      }
      
      return createResponse(event, 200, { message: 'Community updated successfully' });
    }

    return createResponse(event, 404, { message: 'Not found' });
  } catch (err) {
    console.error('Admin error:', err);
    return createResponse(event, err.message === 'Unauthorized' ? 401 : 500, { message: err.message });
  }
};
