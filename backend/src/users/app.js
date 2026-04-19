const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, DeleteCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const https = require("https");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({});
const s3 = new S3Client({});

const TABLE = process.env.APP_TABLE;
const BUCKET_NAME = process.env.BUCKET_NAME;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@buchat.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Import shared utilities
const { getCorsHeaders, handlePreflight, createResponse, getHeaderCaseInsensitive } = require('./shared/cors');
const cache = require('./shared/cache');
const { batchGetUsers } = require('./shared/batchUtils');

// NOTE: Rate limiting moved to API Gateway throttling settings
// In-memory rate limiting does NOT work in Lambda (stateless)
// Configure throttling in template.yaml:
//   - Burst: 100 requests
//   - Rate: 50 requests/second
//   - Per-user quotas via Usage Plans

// Helper: Download image from URL and upload to S3
async function downloadAndUploadToS3(imageUrl, username) {
  if (!imageUrl || !BUCKET_NAME) {
    return null;
  }

  try {
    // Download image from Google
    const imageBuffer = await new Promise((resolve, reject) => {
      https.get(imageUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });

    // Generate S3 key
    const fileId = uuidv4();
    const s3Key = `profiles/${username}/${fileId}.jpg`;

    // Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000'
    }));

    // Return S3 URL
    const region = process.env.AWS_REGION || 'us-east-1';
    return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${s3Key}`;
  } catch (error) {
    console.error('Error downloading/uploading profile picture:', error);
    return null; // Fallback to Google URL if upload fails
  }
}

// Helper: Send verification email
async function sendVerificationEmail(email, code, username) {
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "Verify your BuChat account" },
      Body: {
        Html: {
          Data: `
            <h2>Welcome to BuChat, ${username}!</h2>
            <p>Please verify your email address by entering this 6-digit code:</p>
            <h1 style="color: #ff4500; font-size: 48px; letter-spacing: 8px; font-family: monospace;">${code}</h1>
            <p>Or click this link: <a href="${FRONTEND_URL}/verify?code=${code}&email=${encodeURIComponent(email)}">Verify Email</a></p>
            <p><strong>This code expires in 15 minutes.</strong></p>
            <p style="color: #666; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
          `
        }
      }
    }
  };
  
  // Industry standard: Fail fast if email can't be sent (GitHub, Stripe approach)
  await ses.send(new SendEmailCommand(params));
}

// Helper: Send password reset email
async function sendPasswordResetEmail(email, code, username) {
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: "Reset your BuChat password" },
      Body: {
        Html: {
          Data: `
            <h2>Password Reset Request</h2>
            <p>Hi ${username},</p>
            <p>Enter this 6-digit code to reset your password:</p>
            <h1 style="color: #ff4500; font-size: 48px; letter-spacing: 8px; font-family: monospace;">${code}</h1>
            <p>Or click: <a href="${FRONTEND_URL}/reset-password?code=${code}&email=${encodeURIComponent(email)}">Reset Password</a></p>
            <p><strong>This code expires in 1 hour.</strong></p>
            <p style="color: #666;">If you didn't request this, you can safely ignore this email.</p>
          `
        }
      }
    }
  };
  
  // Industry standard: Fail fast if email can't be sent
  await ses.send(new SendEmailCommand(params));
}

exports.handler = async (event) => {
  
  // Handle OPTIONS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const method = event.requestContext.httpMethod;
    const path = event.path;
    
    console.log('=== USERS LAMBDA INVOKED ===');
    console.log('Method:', method);
    console.log('Path:', path);
    console.log('Path parameters:', event.pathParameters);
    console.log('Query parameters:', event.queryStringParameters);
    
    // REGISTER WITH PASSWORD - POST /users/register
    if (method === "POST" && (path === "/users/register" || path === "/auth/register")) {
      const body = JSON.parse(event.body || "{}");
      const { username, email, password, displayName, avatar, bio } = body;

      // Rate limiting handled by API Gateway throttling

      // Email is optional (industry standard: Discord, GitHub allow no-email accounts)
      if (!username || !password) {
        return createResponse(event, 400, { message: "username and password required" });
      }

      if (password.length < 8) {
        return createResponse(event, 400, { message: "password must be at least 8 characters" });
      }

      // Check if username exists
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (existing.Item) {
        return createResponse(event, 409, { message: "username already exists" });
      }

      // Only check email if provided
      let normalizedEmail = null;
      let verificationCode = null;
      let verificationExpiry = null;
      let verified = true; // Default to verified if no email

      if (email && email.trim()) {
        // Normalize email to lowercase
        normalizedEmail = email.toLowerCase().trim();

        // Validate email format
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
          return createResponse(event, 400, { message: "invalid email format" });
        }

        // Check if email already exists (OPTIMIZED: Use cache + TypeIndex)
        const cacheKey = `email_check:${normalizedEmail}`;
        let emailExists = cache.get(cacheKey);
        
        if (emailExists === null) {
          const emailCheckResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "TypeIndex",
            KeyConditionExpression: "#type = :type",
            FilterExpression: "email = :email",
            ExpressionAttributeNames: { "#type": "type" },
            ExpressionAttributeValues: { ":type": "user", ":email": normalizedEmail },
            Limit: 1
          }));
          emailExists = emailCheckResult.Items && emailCheckResult.Items.length > 0;
          cache.set(cacheKey, emailExists, 300000); // 5 min cache
        }
        
        const emailCheck = { Items: emailExists ? [{}] : [] };

        if (emailCheck.Items && emailCheck.Items.length > 0) {
          return createResponse(event, 409, { message: "email already exists" });
        }

        // Email provided - needs verification
        verified = false;
        verificationCode = crypto.randomInt(100000, 999999).toString();
        verificationExpiry = new Date(Date.now() + 15 * 60000).toISOString();
      }

      const userId = uuidv4();
      const now = new Date().toISOString();
      const hashedPassword = await bcrypt.hash(password, 10);

      const item = {
        PK: `USER#${username}`,
        SK: "PROFILE",
        GSI1PK: `USERID#${userId}`,
        GSI1SK: "PROFILE",
        type: "user",
        userId,
        username,
        email: normalizedEmail,
        password: hashedPassword,
        displayName: displayName || username,
        avatar: avatar || "",
        bio: bio || "",
        verified,
        verificationCode: verificationCode || "",
        verificationExpiry: verificationExpiry || "",
        authProvider: "local",
        karma: 0,
        postKarma: 0,
        commentKarma: 0,
        postCount: 0,
        commentCount: 0,
        awardCount: 0,
        cakeDay: now,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

      // Send verification email only if email provided
      if (normalizedEmail && verificationCode) {
        try {
          await sendVerificationEmail(normalizedEmail, verificationCode, username);
        } catch (error) {
          // If email fails, delete the user and return error (industry standard)
          await ddb.send(new DeleteCommand({
            TableName: TABLE,
            Key: { PK: `USER#${username}`, SK: "PROFILE" }
          }));
          return createResponse(event, 500, { 
            message: "Unable to send verification email. Please check your email address and try again." 
          });
        }
      }

      // Generate JWT
      const token = jwt.sign({ userId, username, email: normalizedEmail }, JWT_SECRET, { expiresIn: '7d' });

      return createResponse(event, 201, { 
        user: {
          userId, 
          username,
          email: normalizedEmail,
          displayName: item.displayName,
          verified,
          hasEmail: !!normalizedEmail,
          createdAt: now
        },
        token,
        message: normalizedEmail 
          ? "Registration successful! Please check your email to verify your account."
          : "Registration successful! Note: Without an email, you won't be able to reset your password if you forget it."
      });
    }

    // LOGIN WITH PASSWORD - POST /users/login
    if (method === "POST" && (path === "/users/login" || path === "/auth/login")) {
      const body = JSON.parse(event.body || "{}");
      const { username, password } = body;

      if (!username || !password) {
        return createResponse(event, 400, { message: "username/email and password required" });
      }

      // Rate limiting handled by API Gateway throttling

      // Determine if login is by email or username
      const isEmail = username.includes('@');
      let result;
      let user;

      if (isEmail) {
        // Login with email - OPTIMIZED: Use cache + TypeIndex
        const emailCacheKey = `user_by_email:${username.toLowerCase()}`;
        let emailSearch = cache.get(emailCacheKey);
        
        if (!emailSearch) {
          emailSearch = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "TypeIndex",
            KeyConditionExpression: "#type = :type",
            FilterExpression: "email = :email",
            ExpressionAttributeNames: { "#type": "type" },
            ExpressionAttributeValues: { 
              ":type": "user", 
              ":email": username.toLowerCase() 
            },
            Limit: 1
          }));
          cache.set(emailCacheKey, emailSearch, 300000); // 5 min cache
        }

        if (!emailSearch.Items || emailSearch.Items.length === 0) {
          return { 
            statusCode: 401,
            headers: getCorsHeaders(event),
            body: JSON.stringify({ 
              message: "invalid username/email or password"
            }) 
          };
        }
        user = emailSearch.Items[0];
      } else {
        // Login with username
        result = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${username}`, SK: "PROFILE" }
        }));

        if (!result.Item) {
          return { 
            statusCode: 401,
            headers: getCorsHeaders(event),
            body: JSON.stringify({ 
              message: "invalid username/email or password"
            }) 
          };
        }
        user = result.Item;
      }
      
      // Check if using local auth
      if (user.authProvider !== "local" || !user.password) {
        return { 
          statusCode: 401,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "please use Google Sign-In for this account"
          }) 
        };
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return { 
          statusCode: 401,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "invalid username/email or password"
          }) 
        };
      }

      // Check if email is verified (only if email exists)
      if (user.email && !user.verified) {
        return { 
          statusCode: 403,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "Please verify your email before logging in",
            verified: false,
            email: user.email 
          }) 
        };
      }

      // Generate JWT
      const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

      // Remove sensitive data
      delete user.password;
      delete user.verificationCode;
      delete user.resetCode;

      // Add hasEmail flag for frontend
      user.hasEmail = !!user.email;

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ user, token }) 
      };
    }

    // COMPLETE GOOGLE PROFILE - POST /users/complete-profile
    if (method === "POST" && (path === "/users/complete-profile" || path === "/auth/complete-profile")) {
      const body = JSON.parse(event.body || "{}");
      const { tempUsername, username, bio, avatar } = body;

      if (!tempUsername || !username) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "tempUsername and username required" }) 
        };
      }

      // Check if new username is available
      const usernameCheck = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (usernameCheck.Item && usernameCheck.Item.username !== tempUsername) {
        return { 
          statusCode: 409,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "username already taken" }) 
        };
      }

      // Get temp user
      const tempUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${tempUsername}`, SK: "PROFILE" }
      }));

      if (!tempUser.Item) {
        return { 
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "temp user not found" }) 
        };
      }

      const now = new Date().toISOString();
      let avatarUrl = avatar || tempUser.Item.avatar;

      // Download Google avatar to S3 if provided
      if (tempUser.Item.avatar && tempUser.Item.avatar.includes('googleusercontent')) {
        const s3Url = await downloadAndUploadToS3(tempUser.Item.avatar, username);
        if (s3Url) avatarUrl = s3Url;
      }

      // Create new user with chosen username
      const newUser = {
        ...tempUser.Item,
        PK: `USER#${username}`,
        username,
        bio: bio || "",
        avatar: avatarUrl,
        profileComplete: true,
        updatedAt: now
      };

      await ddb.send(new PutCommand({ TableName: TABLE, Item: newUser }));

      // Delete temp user
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `USER#${tempUsername}`, SK: "PROFILE" }
      }));

      // Generate new JWT with real username
      const token = jwt.sign({ userId: newUser.userId, username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

      delete newUser.password;
      delete newUser.verificationCode;

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ user: newUser, token }) 
      };
    }

    // GOOGLE SIGN-IN - POST /users/google-auth
    if (method === "POST" && (path === "/users/google-auth" || path === "/auth/google")) {
      const body = JSON.parse(event.body || "{}");
      const { idToken } = body;

      if (!idToken) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "idToken required" }) 
        };
      }

      // Get Authorization header case-insensitively
      const authHeader = getHeaderCaseInsensitive(event.headers, 'authorization');
      const contentType = getHeaderCaseInsensitive(event.headers, 'content-type');
      
      // Verify Google token
      let ticket;
      try {
        ticket = await googleClient.verifyIdToken({
          idToken,
          audience: GOOGLE_CLIENT_ID
        });
      } catch (error) {
        return { 
          statusCode: 401,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "invalid Google token" }) 
        };
      }

      const payload = ticket.getPayload();
      const { email, name, picture, sub: googleId } = payload;

      try {
        // Check if user exists by googleId - Use GSI1 with PK pattern
        const googleCacheKey = `user_by_google:${googleId}`;
        let googleIdCheck = cache.get(googleCacheKey);
        
        if (!googleIdCheck) {
          // Use Scan with FilterExpression since googleId is not indexed
          googleIdCheck = await ddb.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: "googleId = :googleId AND #type = :type",
            ExpressionAttributeNames: { "#type": "type" },
            ExpressionAttributeValues: { ":type": "user", ":googleId": googleId },
            Limit: 1
          }));
          cache.set(googleCacheKey, googleIdCheck, 600000); // 10 min cache
        }

        let user;
        const now = new Date().toISOString();

      if (googleIdCheck.Items && googleIdCheck.Items.length > 0) {
        // User with this Google ID exists - return existing account
        user = googleIdCheck.Items[0];
        
        // Check if this is a temporary user (username starts with 'temp_')
        const needsProfileSetup = user.username && user.username.startsWith('temp_');
        
        // Update last login time
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: "SET updatedAt = :now",
          ExpressionAttributeValues: {
            ":now": now
          }
        }));
        
        // Generate JWT
        const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        // Remove sensitive data
        delete user.password;
        delete user.verificationCode;

        return { 
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            user, 
            token,
            needsProfileSetup
          }) 
        };
      }
      
      // Check if user exists by email - Use Scan with FilterExpression
      const emailLinkCacheKey = `user_by_email:${email}`;
      let emailCheck = cache.get(emailLinkCacheKey);
      
      if (!emailCheck) {
        emailCheck = await ddb.send(new ScanCommand({
          TableName: TABLE,
          FilterExpression: "email = :email AND #type = :type",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": email },
          Limit: 1
        }));
        cache.set(emailLinkCacheKey, emailCheck, 300000); // 5 min cache
      }
      
      if (emailCheck.Items && emailCheck.Items.length > 0) {
        // User with this email exists - link Google ID
        user = emailCheck.Items[0];
        
        // Check if this is a temporary user
        const needsProfileSetup = user.username && user.username.startsWith('temp_');
        
        // Link Google ID to existing account
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: "SET googleId = :googleId, verified = :verified, updatedAt = :now",
          ExpressionAttributeValues: {
            ":googleId": googleId,
            ":verified": true,
            ":now": now
          }
        }));
        user.googleId = googleId;
        user.verified = true;
        
        // Generate JWT
        const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        // Remove sensitive data
        delete user.password;
        delete user.verificationCode;

        return { 
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            user, 
            token,
            needsProfileSetup
          }) 
        };
      }
      
      // No existing user - create new temporary user
      {
        // Create temporary user with googleId - needs profile completion
        const userId = uuidv4();
        const tempUsername = `temp_${userId.substring(0, 8)}`;

        user = {
          PK: `USER#${tempUsername}`,
          SK: "PROFILE",
          GSI1PK: `USERID#${userId}`,
          GSI1SK: "PROFILE",
          type: "user",
          userId,
          username: tempUsername,
          email,
          googleId,
          displayName: name,
          avatar: picture || "",
          bio: "",
          verified: true,
          authProvider: "google",
          profileComplete: false,
          karma: 0,
          postKarma: 0,
          commentKarma: 0,
          postCount: 0,
          commentCount: 0,
          awardCount: 0,
          cakeDay: now,
          status: "active",
          createdAt: now,
          updatedAt: now
        };

        await ddb.send(new PutCommand({ TableName: TABLE, Item: user }));
        
        // Generate JWT
        const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        // Remove sensitive data
        delete user.password;
        delete user.verificationCode;

        return { 
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            user, 
            token,
            needsProfileSetup: true
          }) 
        };
      }
      } catch (googleError) {
        console.error('Google auth database error:', googleError);
        return { 
          statusCode: 500,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "Google sign-in processing failed", error: googleError.message }) 
        };
      }
    }

    // LINK EMAIL TO ACCOUNT - POST /users/link-email
    if (method === "POST" && (path === "/users/link-email" || path === "/auth/link-email")) {
      const body = JSON.parse(event.body || "{}");
      const { username, email } = body;

      if (!username || !email) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "username and email required" }) 
        };
      }

      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();

      // Validate email format
      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "invalid email format" }) 
        };
      }

      // Get user
      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!result.Item) {
        return { 
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = result.Item;

      // Check if user already has a verified email
      if (user.email && user.verified) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "account already has a verified email" }) 
        };
      }

      // Check if email is already used - OPTIMIZED: Use cache + TypeIndex
      const linkEmailCacheKey = `email_check:${normalizedEmail}`;
      let emailExists = cache.get(linkEmailCacheKey);
      
      if (emailExists === null) {
        const emailCheckResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": normalizedEmail },
          Limit: 1
        }));
        emailExists = emailCheckResult.Items && emailCheckResult.Items.length > 0;
        cache.set(linkEmailCacheKey, emailExists, 300000); // 5 min cache
      }
      
      const emailCheck = { Items: emailExists ? [{}] : [] };

      if (emailCheck.Items && emailCheck.Items.length > 0) {
        return { 
          statusCode: 409,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email already exists" }) 
        };
      }

      // Generate verification code
      const verificationCode = crypto.randomInt(100000, 999999).toString();
      const now = new Date().toISOString();

      // Update user with email and verification code
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET email = :email, verified = :verified, verificationCode = :code, verificationExpiry = :expiry, updatedAt = :now",
        ExpressionAttributeValues: {
          ":email": normalizedEmail,
          ":verified": false,
          ":code": verificationCode,
          ":expiry": new Date(Date.now() + 15 * 60000).toISOString(),
          ":now": now
        }
      }));

      // Send verification email
      try {
        await sendVerificationEmail(normalizedEmail, verificationCode, user.username);
      } catch (error) {
        // Rollback - remove email from account
        await ddb.send(new UpdateCommand({
          TableName: TABLE,
          Key: { PK: user.PK, SK: user.SK },
          UpdateExpression: "SET email = :empty, verified = :verified, verificationCode = :empty, updatedAt = :now",
          ExpressionAttributeValues: {
            ":empty": null,
            ":verified": true,
            ":now": now
          }
        }));
        return {
          statusCode: 500,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "Unable to send verification email. Please check your email address and try again." 
          })
        };
      }

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ 
          message: "Verification email sent! Please check your inbox.",
          email: normalizedEmail
        }) 
      };
    }

    // VERIFY EMAIL - POST /users/verify-email
    if (method === "POST" && (path === "/users/verify-email" || path === "/auth/verify")) {
      const body = JSON.parse(event.body || "{}");
      const { email, code } = body;

      if (!email || !code) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email and code required" }) 
        };
      }

      const normalizedEmail = email.trim().toLowerCase();
      console.log('Verifying email:', normalizedEmail, 'code:', code);

      // Find user by email - OPTIMIZED: Use cache + TypeIndex
      const verifyCacheKey = `user_by_email:${normalizedEmail}`;
      let emailCheck = cache.get(verifyCacheKey);
      
      if (!emailCheck) {
        emailCheck = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": normalizedEmail },
          Limit: 1
        }));
        cache.set(verifyCacheKey, emailCheck, 300000); // 5 min cache
      }

      console.log('Scan result count:', emailCheck.Items?.length || 0);
      if (emailCheck.Items && emailCheck.Items.length > 0) {
        console.log('Found user:', emailCheck.Items[0].username, 'stored email:', emailCheck.Items[0].email);
      }

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        return { 
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "user not found", searchedEmail: normalizedEmail }) 
        };
      }

      const user = emailCheck.Items[0];

      if (user.verified) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email already verified" }) 
        };
      }

      // Compare numeric codes (case-insensitive for backwards compatibility)
      if (user.verificationCode !== code.trim()) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "invalid verification code" }) 
        };
      }

      if (new Date(user.verificationExpiry) < new Date()) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "verification code expired" }) 
        };
      }

      // Mark as verified
      const now = new Date().toISOString();
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET verified = :verified, verificationCode = :empty, updatedAt = :now",
        ExpressionAttributeValues: {
          ":verified": true,
          ":empty": "",
          ":now": now
        }
      }));

      // Update user object
      user.verified = true;
      user.verificationCode = "";
      user.updatedAt = now;

      // Generate JWT token
      const token = jwt.sign({ userId: user.userId, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

      // Remove sensitive data
      delete user.password;
      delete user.resetCode;

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ message: "email verified successfully", user, token }) 
      };
    }

    // RESEND VERIFICATION - POST /users/resend-verification
    if (method === "POST" && (path === "/users/resend-verification" || path === "/auth/resend")) {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;

      if (!email) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email required" }) 
        };
      }

      // Rate limiting handled by API Gateway throttling

      // OPTIMIZED: Use cache + TypeIndex for resend verification
      const resendCacheKey = `user_by_email:${email.trim().toLowerCase()}`;
      let emailCheck = cache.get(resendCacheKey);
      
      if (!emailCheck) {
        emailCheck = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": email.trim().toLowerCase() },
          Limit: 1
        }));
        cache.set(resendCacheKey, emailCheck, 300000); // 5 min cache
      }

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        return { 
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = emailCheck.Items[0];

      if (user.verified) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email already verified" }) 
        };
      }

      // Crypto-secure 6-digit code (industry standard)
      const verificationCode = crypto.randomInt(100000, 999999).toString();
      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET verificationCode = :code, verificationExpiry = :expiry, updatedAt = :now",
        ExpressionAttributeValues: {
          ":code": verificationCode,
          // 15 minutes expiry (industry standard)
          ":expiry": new Date(Date.now() + 15 * 60000).toISOString(),
          ":now": now
        }
      }));

      // Send email to the stored email (already lowercase) instead of request email
      await sendVerificationEmail(user.email, verificationCode, user.username);

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ message: "verification email sent" }) 
      };
    }

    // FORGOT PASSWORD - POST /users/forgot-password
    if (method === "POST" && (path === "/users/forgot-password" || path === "/auth/forgot-password")) {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;

      if (!email) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email required" }) 
        };
      }

      // OPTIMIZED: Use cache + TypeIndex for forgot password
      const forgotCacheKey = `user_by_email:${email.toLowerCase()}`;
      let emailCheck = cache.get(forgotCacheKey);
      
      if (!emailCheck) {
        emailCheck = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": email.toLowerCase() },
          Limit: 1
        }));
        cache.set(forgotCacheKey, emailCheck, 300000); // 5 min cache
      }

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        // Don't reveal if email exists (security best practice)
        return { 
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "if email exists, reset code sent" }) 
        };
      }

      const user = emailCheck.Items[0];

      // Check if user has no email (registered without email)
      if (!user.email) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "This account was created without an email. Password reset is not available. Please contact support." 
          }) 
        };
      }

      if (user.authProvider !== "local") {
        // Don't reveal if Google account (security best practice)
        return { 
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "if email exists, reset code sent" }) 
        };
      }

      // Crypto-secure 6-digit code (industry standard)
      const resetCode = crypto.randomInt(100000, 999999).toString();
      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET resetCode = :code, resetExpiry = :expiry, updatedAt = :now",
        ExpressionAttributeValues: {
          ":code": resetCode,
          ":expiry": new Date(Date.now() + 3600000).toISOString(), // 1 hour
          ":now": now
        }
      }));

      // Send password reset email
      try {
        await sendPasswordResetEmail(user.email, resetCode, user.username);
      } catch (error) {
        return {
          statusCode: 500,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "Unable to send reset email. Please try again later." 
          })
        };
      }

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ message: "if email exists, reset code sent" }) 
      };
    }

    // RESET PASSWORD - POST /users/reset-password
    if (method === "POST" && (path === "/users/reset-password" || path === "/auth/reset-password")) {
      const body = JSON.parse(event.body || "{}");
      const { email, code, newPassword } = body;

      if (!email || !code || !newPassword) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "email, code, and newPassword required" }) 
        };
      }

      if (newPassword.length < 8) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "password must be at least 8 characters" }) 
        };
      }

      // OPTIMIZED: Use cache + TypeIndex for reset password
      const resetCacheKey = `user_by_email:${email}`;
      let emailCheck = cache.get(resetCacheKey);
      
      if (!emailCheck) {
        emailCheck = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": email },
          Limit: 1
        }));
        cache.set(resetCacheKey, emailCheck, 300000); // 5 min cache
      }

      if (!emailCheck.Items || emailCheck.Items.length === 0) {
        return { 
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      const user = emailCheck.Items[0];

      if (!user.resetCode || user.resetCode !== code.trim()) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "invalid reset code" }) 
        };
      }

      if (new Date(user.resetExpiry) < new Date()) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "reset code expired" }) 
        };
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const now = new Date().toISOString();

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: user.PK, SK: user.SK },
        UpdateExpression: "SET password = :password, resetCode = :empty, updatedAt = :now",
        ExpressionAttributeValues: {
          ":password": hashedPassword,
          ":empty": "",
          ":now": now
        }
      }));

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ message: "password reset successfully" }) 
      };
    }

    // CHECK USERNAME - GET /users/check-username/{username}
    // THIS MUST COME BEFORE THE GENERIC GET /users/{username} ROUTE
    if (method === "GET" && path.startsWith("/users/check-username/")) {
      const username = event.pathParameters.username;

      if (!username || username.length < 3) {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: false, message: "Username must be at least 3 characters." }) 
        };
      }

      const result = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (result.Item) {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: false }) 
        };
      } else {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: true }) 
        };
      }
    }

    // CHECK EMAIL - GET /users/check-email/{email}
    if (method === "GET" && path.startsWith("/users/check-email/")) {
      const email = decodeURIComponent(event.pathParameters.email || '').toLowerCase();

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: false, message: "Please enter a valid email address." }) 
        };
      }

      // OPTIMIZED: Use cache + TypeIndex for check email
      const checkEmailCacheKey = `email_check:${email}`;
      let emailExists = cache.get(checkEmailCacheKey);
      
      if (emailExists === null) {
        const emailCheckResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": email },
          Limit: 1
        }));
        emailExists = emailCheckResult.Items && emailCheckResult.Items.length > 0;
        cache.set(checkEmailCacheKey, emailExists, 300000); // 5 min cache
      }
      
      const emailCheck = { Items: emailExists ? [{}] : [] };

      if (emailCheck.Items && emailCheck.Items.length > 0) {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: false, message: "Email already exists." }) 
        };
      } else {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: true, message: "Email is available!" }) 
        };
      }
    }

    // CHECK EMAIL (AUTH ROUTE) - GET /auth/check-email/{email}
    // Duplicate for /auth namespace - real-time validation
    if (method === "GET" && path.startsWith("/auth/check-email/")) {
      const email = decodeURIComponent(event.pathParameters.email || '').toLowerCase();

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: false, message: "Please enter a valid email address." }) 
        };
      }

      // OPTIMIZED: Use cache + TypeIndex for auth check email
      const authCheckEmailCacheKey = `email_check:${email}`;
      let emailExists = cache.get(authCheckEmailCacheKey);
      
      if (emailExists === null) {
        const emailCheckResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "TypeIndex",
          KeyConditionExpression: "#type = :type",
          FilterExpression: "email = :email",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":type": "user", ":email": email },
          Limit: 1
        }));
        emailExists = emailCheckResult.Items && emailCheckResult.Items.length > 0;
        cache.set(authCheckEmailCacheKey, emailExists, 300000); // 5 min cache
      }
      
      const emailCheck = { Items: emailExists ? [{}] : [] };

      if (emailCheck.Items && emailCheck.Items.length > 0) {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: false, message: "Email already exists." }) 
        };
      } else {
        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ available: true, message: "Email is available!" }) 
        };
      }
    }

    // GET USER PROFILE - GET /users/{username}
    if (method === "GET" && event.pathParameters && event.pathParameters.username && 
        !path.startsWith("/users/check-username/") && 
        !path.startsWith("/users/check-email/") &&
        !path.includes("/posts") &&
        !path.includes("/comments") &&
        !path.includes("/stats") &&
        !path.includes("/trophies") &&
        !path.includes("/groups") &&
        !path.includes("/saved") &&
        !path.includes("/search")) {
      const identifier = event.pathParameters.username;

      try {
        // Check if identifier is a UUID (userId) or username
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        let result;
        if (isUuid) {
          // Query by userId using GSI1
          result = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USERID#${identifier}`,
              ":sk": "PROFILE"
            },
            Limit: 1
          }));
          
          if (!result.Items || result.Items.length === 0) {
            return createResponse(event,404, { message: "user not found" });
          }
          
          const user = result.Items[0];
          delete user.password;
          delete user.verificationCode;
          delete user.resetCode;

          return createResponse(event,200, { user });
        } else {
          // Query by username
          result = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { PK: `USER#${identifier}`, SK: "PROFILE" }
          }));

          if (!result.Item) {
            return createResponse(event,404, { message: "user not found" });
          }

          const user = result.Item;
          delete user.password;
          delete user.verificationCode;
          delete user.resetCode;

          return createResponse(event,200, { user });
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        return createResponse(event,500, { message: "internal error" });
      }
    }

    // UPDATE USER PROFILE - PUT /users/{username}
    if (method === "PUT" && event.pathParameters && event.pathParameters.username) {
      const oldUsername = event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      const { username: newUsername, displayName, avatar, bio, banner, location, website } = body;

      // Get current user
      const currentUser = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${oldUsername}`, SK: "PROFILE" }
      }));

      if (!currentUser.Item) {
        return { 
          statusCode: 404,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "user not found" }) 
        };
      }

      // Handle username change (Industry standard: Twitter/GitHub/Discord approach)
      if (newUsername && newUsername !== oldUsername) {
        // Check if new username is available
        const usernameCheck = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${newUsername}`, SK: "PROFILE" }
        }));

        if (usernameCheck.Item) {
          return { 
            statusCode: 409,
            headers: getCorsHeaders(event),
            body: JSON.stringify({ message: "username already taken" }) 
          };
        }

        const now = new Date().toISOString();

        // Create new user record with new username (PK must change)
        const updatedUser = {
          ...currentUser.Item,
          PK: `USER#${newUsername}`,
          username: newUsername,
          displayName: displayName !== undefined ? displayName : currentUser.Item.displayName,
          avatar: avatar !== undefined ? avatar : currentUser.Item.avatar,
          bio: bio !== undefined ? bio : currentUser.Item.bio,
          banner: banner !== undefined ? banner : currentUser.Item.banner,
          location: location !== undefined ? location : currentUser.Item.location,
          website: website !== undefined ? website : currentUser.Item.website,
          updatedAt: now
        };

        // Put new user record
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: updatedUser
        }));

        // Delete old user record
        await ddb.send(new DeleteCommand({
          TableName: TABLE,
          Key: { PK: `USER#${oldUsername}`, SK: "PROFILE" }
        }));

        // Note: No need to update posts/comments - they reference immutable userId
        // Frontend will fetch username from userId when displaying content

        return { 
          statusCode: 200,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ 
            message: "profile updated",
            user: {
              ...updatedUser,
              password: undefined,
              verificationCode: undefined,
              resetCode: undefined
            }
          }) 
        };
      }

      // No username change - regular update
      const updateExpr = [];
      const exprAttrValues = {};
      const exprAttrNames = { "#updatedAt": "updatedAt" };
      let setClause = "SET ";
      let sep = "";

      if (displayName !== undefined) {
        setClause += `#displayName = :displayName`;
        exprAttrValues[":displayName"] = displayName;
        exprAttrNames["#displayName"] = "displayName";
        updateExpr.push("displayName");
        sep = ", ";
      }

      if (avatar !== undefined) {
        setClause += `${sep}#avatar = :avatar`;
        exprAttrValues[":avatar"] = avatar;
        exprAttrNames["#avatar"] = "avatar";
        updateExpr.push("avatar");
        sep = ", ";
      }

      if (bio !== undefined) {
        setClause += `${sep}#bio = :bio`;
        exprAttrValues[":bio"] = bio;
        exprAttrNames["#bio"] = "bio";
        updateExpr.push("bio");
        sep = ", ";
      }

      if (banner !== undefined) {
        setClause += `${sep}#banner = :banner`;
        exprAttrValues[":banner"] = banner;
        exprAttrNames["#banner"] = "banner";
        updateExpr.push("banner");
        sep = ", ";
      }

      if (location !== undefined) {
        setClause += `${sep}#location = :location`;
        exprAttrValues[":location"] = location;
        exprAttrNames["#location"] = "location";
        updateExpr.push("location");
        sep = ", ";
      }

      if (website !== undefined) {
        setClause += `${sep}#website = :website`;
        exprAttrValues[":website"] = website;
        exprAttrNames["#website"] = "website";
        updateExpr.push("website");
        sep = ", ";
      }

      if (updateExpr.length === 0) {
        return { 
          statusCode: 400,
          headers: getCorsHeaders(event),
          body: JSON.stringify({ message: "no fields to update" }) 
        };
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `USER#${oldUsername}`, SK: "PROFILE" },
        UpdateExpression: setClause + ", #updatedAt = :now",
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: {
          ":now": new Date().toISOString(),
          ...exprAttrValues
        }
      }));

      return { 
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify({ message: "profile updated" }) 
      };
    }

    // GET USER POSTS - GET /users/{username}/posts
    if (method === "GET" && path.startsWith("/users/") && path.includes("/posts")) {
      const username = event.pathParameters.username;
      const viewerUserId = event.queryStringParameters?.userId; // Who is viewing

      // Get user profile first to get userId and avatar
      const userResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND SK = :sk",
        ExpressionAttributeValues: {
          ":pk": `USER#${username}`,
          ":sk": "PROFILE"
        },
        Limit: 1
      }));

      if (!userResult.Items || userResult.Items.length === 0) {
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const userProfile = userResult.Items[0];
      const profileUserId = userProfile.userId;

      // Query posts using GSI2 (USER#userId -> POST#timestamp)
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :sk)",
        FilterExpression: "#status = :status",
        ExpressionAttributeNames: { 
          "#status": "status"
        },
        ExpressionAttributeValues: { 
          ":pk": `USER#${profileUserId}`,
          ":sk": "POST#",
          ":status": "active"
        },
        ScanIndexForward: false
      }));

      // Filter posts based on audience and viewer's access
      let posts = result.Items || [];
      
      // If viewer is the profile owner, show all posts
      if (viewerUserId !== profileUserId) {
        // Filter based on audience
        const filteredPosts = [];
        for (const post of posts) {
          const postAudience = post.audience || 'global';
          
          if (postAudience === 'global') {
            filteredPosts.push(post);
          } else if (postAudience === 'group' && post.group) {
            // Check if viewer is member/moderator/owner of the group
            if (viewerUserId) {
              try {
                const [groupResult, memberResult, modResult] = await Promise.all([
                  ddb.send(new QueryCommand({
                    TableName: TABLE,
                    KeyConditionExpression: "PK = :pk AND SK = :sk",
                    ExpressionAttributeValues: { ":pk": `GROUP#${post.group}`, ":sk": "META" },
                    Limit: 1
                  })),
                  ddb.send(new QueryCommand({
                    TableName: TABLE,
                    KeyConditionExpression: "PK = :pk AND SK = :sk",
                    ExpressionAttributeValues: { ":pk": `GROUP#${post.group}`, ":sk": `MEMBER#${viewerUserId}` },
                    Limit: 1
                  })),
                  ddb.send(new QueryCommand({
                    TableName: TABLE,
                    KeyConditionExpression: "PK = :pk AND SK = :sk",
                    ExpressionAttributeValues: { ":pk": `GROUP#${post.group}`, ":sk": `MODERATOR#${viewerUserId}` },
                    Limit: 1
                  }))
                ]);
                
                const isOwner = groupResult.Items?.[0] && (groupResult.Items[0].creatorId === viewerUserId || groupResult.Items[0].creator === viewerUserId);
                const isMember = !!(memberResult.Items && memberResult.Items[0]);
                const isModerator = !!(modResult.Items && modResult.Items[0] && modResult.Items[0].status === 'active');
                
                if (isOwner || isMember || isModerator) {
                  filteredPosts.push(post);
                }
              } catch (error) {
                console.error('Error checking group access:', error);
              }
            }
          }
        }
        posts = filteredPosts;
      }

      posts = posts
        .map(post => ({
          ...post,
          username: userProfile.username || username,
          userAvatar: userProfile.avatar || null,
          userDisplayName: userProfile.displayName || userProfile.username || username
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ posts }) };
    }

    // GET USER COMMENTS - GET /users/{username}/comments
    if (method === "GET" && path.startsWith("/users/") && path.includes("/comments")) {
      const username = event.pathParameters.username;

      // OPTIMIZED: Use TypeIndex for user comments
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "TypeIndex",
        KeyConditionExpression: "#type = :type",
        FilterExpression: "userId = :userId",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { 
          ":type": "comment",
          ":userId": username 
        }
      }));

      const comments = (result.Items || [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ comments }) };
    }

    // GET USER STATS - GET /users/{username}/stats
    if (method === "GET" && path.startsWith("/users/") && path.includes("/stats")) {
      const username = event.pathParameters.username;

      // OPTIMIZED: Use TypeIndex for user stats
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "TypeIndex",
        KeyConditionExpression: "#type = :type",
        FilterExpression: "#user = :user",
        ExpressionAttributeNames: { "#type": "type", "#user": "user" },
        ExpressionAttributeValues: { ":type": "stat", ":user": username }
      }));

      const stats = result.Items || [];

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ stats }) };
    }

    // GET USER TROPHIES - GET /users/{username}/trophies
    if (method === "GET" && path.startsWith("/users/") && path.includes("/trophies")) {
      const username = event.pathParameters.username;

      // OPTIMIZED: Use TypeIndex for user trophies
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "TypeIndex",
        KeyConditionExpression: "#type = :type",
        FilterExpression: "#user = :user",
        ExpressionAttributeNames: { "#type": "type", "#user": "user" },
        ExpressionAttributeValues: { ":type": "trophy", ":user": username }
      }));

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ trophies: result.Items || [] }) };
    }

    // GET USER COMMUNITIES - GET /users/{username}/groups
    if (method === "GET" && path.startsWith("/users/") && path.includes("/groups")) {
      const username = event.pathParameters?.username;
      if (!username) return createResponse(event,400, { message: "username required" });
      
      try {
        const userResult = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${username}`, SK: "PROFILE" }
        }));

        if (!userResult.Item) return createResponse(event,404, { message: "user not found" });
        const userId = userResult.Item.userId;

        // Get communities where user is a member
        const memberResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "JOINED#" }
        }));

        const joinedNames = (memberResult.Items || []).map(m => m.groupName).filter(Boolean);
        
        // Get communities owned by user
        const ownedResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          FilterExpression: "creatorId = :userId",
          ExpressionAttributeValues: { ":pk": "GROUP", ":userId": userId }
        }));
        
        const ownedNames = (ownedResult.Items || []).map(m => m.name).filter(Boolean);
        
        const fetchGroup = async (name) => {
          const res = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { PK: `GROUP#${name}`, SK: "META" }
          }));
          return res.Item;
        };

        const [joinedGroups, ownedGroups] = await Promise.all([
          Promise.all(joinedNames.map(fetchGroup)),
          Promise.all(ownedNames.map(fetchGroup))
        ]);

        const filteredJoined = joinedGroups.filter(Boolean);
        const filteredOwned = ownedGroups.filter(Boolean);
        
        // Return both formats for compatibility
        return createResponse(event,200, { 
          groups: [...new Set([...filteredJoined, ...filteredOwned])],
          joined: filteredJoined,
          owned: filteredOwned
        });
      } catch (err) {
        console.error('GetUserGroups error:', err);
        return createResponse(event,500, { message: "failed to fetch groups", error: err.message });
      }
    }

    // GET USER SUGGESTIONS - GET /users/suggestions
    if (method === "GET" && path === "/users/suggestions") {
      console.log('=== USER SUGGESTIONS ENDPOINT HIT ===');
      console.log('Method:', method);
      console.log('Path:', path);
      console.log('Query params:', event.queryStringParameters);
      
      const currentUserId = event.queryStringParameters?.userId;
      const limit = parseInt(event.queryStringParameters?.limit || 10);

      console.log('User suggestions request:', { currentUserId, limit, queryParams: event.queryStringParameters });

      if (!currentUserId) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "userId required" }) };
      }

      try {
        // Get current user using GSI1 (more efficient)
        const currentUserResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
          ExpressionAttributeValues: {
            ":pk": `USERID#${currentUserId}`,
            ":sk": "PROFILE"
          },
          Limit: 1
        }));

        if (!currentUserResult.Items || currentUserResult.Items.length === 0) {
          console.log('Current user not found:', currentUserId);
          return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
        }

        const currentUser = currentUserResult.Items[0];
        console.log('Found current user:', currentUser.username);

        // Get current user's following list
        const followingResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${currentUser.username}`,
            ":sk": "FOLLOWING#"
          }
        }));

        const followingIds = (followingResult.Items || []).map(f => f.followingId || f.followedId).filter(Boolean);
        console.log('Following IDs:', followingIds);
        console.log('Following records:', followingResult.Items?.map(f => ({ SK: f.SK, followingId: f.followingId, followedId: f.followedId })));

        // Get current user's followers
        const followersResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${currentUserId}`,
            ":sk": "FOLLOWER#"
          }
        }));

        const followerIds = (followersResult.Items || []).map(f => f.followerId || f.userId).filter(Boolean).filter(id => !followingIds.includes(id));
        console.log('Follower IDs (not following back):', followerIds);

        // Get users followed by people current user follows (friends of friends)
        const friendsOfFriends = new Set();
        for (const followingId of followingIds) {
          const friendFollowingResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": `USER#${followingId}`,
              ":sk": "FOLLOWING#"
            }
          }));
          (friendFollowingResult.Items || []).forEach(f => {
            const fId = f.followingId || f.followedId;
            if (fId && fId !== currentUserId && !followingIds.includes(fId)) {
              friendsOfFriends.add(fId);
            }
          });
        }

        // Get current user's group memberships using GSI1
        const userGroupsResult = await ddb.send(new QueryCommand({
          TableName: TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `USER#${currentUserId}`,
            ":sk": "JOINED#"
          }
        }));
        const userGroupIds = (userGroupsResult.Items || []).map(m => m.groupName).filter(Boolean);

        // Get members from user's groups
        const groupMembers = new Set();
        for (const groupId of userGroupIds) {
          const membersResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": `GROUP#${groupId}`,
              ":sk": "MEMBER#"
            }
          }));
          (membersResult.Items || []).forEach(m => {
            if (m.userId !== currentUserId && !followingIds.includes(m.userId)) {
              groupMembers.add(m.userId);
            }
          });
        }

        // Combine and prioritize suggestions
        const suggestionScores = new Map();
        
        // Friends of friends get score 4
        friendsOfFriends.forEach(userId => {
          suggestionScores.set(userId, (suggestionScores.get(userId) || 0) + 4);
        });
        
        // Followers (not following back) get score 3
        followerIds.forEach(userId => {
          suggestionScores.set(userId, (suggestionScores.get(userId) || 0) + 3);
        });
        
        // Group members get score 2
        groupMembers.forEach(userId => {
          suggestionScores.set(userId, (suggestionScores.get(userId) || 0) + 2);
        });

        // Get user details for top suggestions
        const topSuggestionIds = Array.from(suggestionScores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit * 2)
          .map(([userId]) => userId)
          .filter(userId => !followingIds.includes(userId)); // Extra safety check

        let suggestions = [];
        for (const userId of topSuggestionIds) {
          const userResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USERID#${userId}`,
              ":sk": "PROFILE"
            },
            Limit: 1
          }));
          
          if (userResult.Items && userResult.Items[0] && userResult.Items[0].status === 'active') {
            const user = userResult.Items[0];
            
            // Double-check not following (safety)
            if (followingIds.includes(user.userId) || followingIds.includes(user.username)) {
              console.log('Skipping already followed user:', user.username);
              continue;
            }
            
            // Calculate mutual friends
            const mutualCount = followingIds.filter(fId => 
              friendsOfFriends.has(fId)
            ).length;
            
            user.mutualFriends = mutualCount;
            user.suggestionScore = suggestionScores.get(userId);
            
            delete user.password;
            delete user.verificationCode;
            delete user.resetCode;
            
            suggestions.push(user);
          }
        }

        // Sort by score, then mutual friends
        suggestions.sort((a, b) => {
          const scoreDiff = (b.suggestionScore || 0) - (a.suggestionScore || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return (b.mutualFriends || 0) - (a.mutualFriends || 0);
        });

        // Clean up score before returning
        suggestions.forEach(s => delete s.suggestionScore);

        console.log('Smart suggestions found:', suggestions.length);

        // Ensure minimum suggestions by fetching additional users if needed
        if (suggestions.length < limit) {
          const neededCount = limit - suggestions.length;
          const existingIds = new Set([currentUserId, ...followingIds, ...suggestions.map(s => s.userId)]);
          
          // Use Scan with pagination for additional users
          const scanResult = await ddb.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: "#type = :type AND SK = :sk AND #status = :status",
            ExpressionAttributeNames: { "#type": "type", "#status": "status" },
            ExpressionAttributeValues: { ":type": "user", ":sk": "PROFILE", ":status": "active" },
            Limit: Math.min(neededCount * 3, 100)
          }));

          const additionalUsers = (scanResult.Items || [])
            .filter(u => !existingIds.has(u.userId) && u.userId !== currentUserId && !followingIds.includes(u.userId))
            .sort((a, b) => (b.karma || 0) - (a.karma || 0))
            .slice(0, neededCount)
            .map(u => {
              delete u.password;
              delete u.verificationCode;
              delete u.resetCode;
              u.mutualFriends = 0;
              return u;
            });

          suggestions.push(...additionalUsers);
        }

        console.log('Returning suggestions:', suggestions.length);

        return { 
          statusCode: 200, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ 
            suggestions: suggestions.slice(0, limit),
            count: suggestions.length 
          }) 
        };
      } catch (error) {
        console.error('Error in getUserSuggestions:', error);
        return { 
          statusCode: 500, 
          headers: getCorsHeaders(event), 
          body: JSON.stringify({ 
            message: "internal error",
            error: error.message 
          }) 
        };
      }
    }

    // GET SAVED POSTS - GET /users/{username}/saved
    if (method === "GET" && path.startsWith("/users/") && path.includes("/saved")) {
      const username = event.pathParameters.username;
      console.log('GET SAVED POSTS for username:', username);

      // Get userId from username
      const userResult = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${username}`, SK: "PROFILE" }
      }));

      if (!userResult.Item) {
        console.log('User not found:', username);
        return { statusCode: 404, headers: getCorsHeaders(event), body: JSON.stringify({ message: "user not found" }) };
      }

      const queryUserId = userResult.Item.userId;
      console.log('Query userId:', queryUserId);

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${queryUserId}`,
          ":sk": "SAVED#"
        },
        ScanIndexForward: false
      }));

      const savedItems = result.Items || [];
      console.log('Found saved items:', savedItems.length);
      if (savedItems.length > 0) {
        console.log('Sample saved item:', JSON.stringify(savedItems[0]));
      }
      
      // Fetch full post details for each saved item
      const posts = [];
      for (const savedItem of savedItems) {
        // Extract postId from SK (format: SAVED#postId)
        const postId = savedItem.SK ? savedItem.SK.replace('SAVED#', '') : savedItem.postId;
        console.log('Processing saved item - SK:', savedItem.SK, 'postId:', postId);
        if (!postId) continue;
        
        try {
          const postResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: { ":pk": `POST#${postId}` },
            Limit: 1
          }));
          
          console.log('Post query result for', postId, ':', postResult.Items?.length || 0);
          if (postResult.Items && postResult.Items[0]) {
            const post = postResult.Items[0];
            console.log('Post status:', post.status);
            if (post.status === 'active') {
              posts.push({
                ...post,
                savedAt: savedItem.savedAt,
                userSaved: true
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching post ${postId}:`, error);
        }
      }
      console.log('Total posts fetched:', posts.length);

      // Enrich with user data
      const userIds = [...new Set(posts.map(p => p.userId).filter(Boolean))];
      const userDataMap = new Map();
      
      for (const uid of userIds) {
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
          let userResult;
          
          if (!isUuid) {
            userResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              KeyConditionExpression: "PK = :pk AND SK = :sk",
              ExpressionAttributeValues: { ":pk": `USER#${uid}`, ":sk": "PROFILE" },
              Limit: 1
            }));
          }
          
          if (!userResult || !userResult.Items || userResult.Items.length === 0) {
            userResult = await ddb.send(new QueryCommand({
              TableName: TABLE,
              IndexName: "GSI1",
              KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
              ExpressionAttributeValues: { ":pk": `USERID#${uid}`, ":sk": "PROFILE" },
              Limit: 1
            }));
          }

          if (userResult.Items && userResult.Items[0]) {
            const user = userResult.Items[0];
            userDataMap.set(uid, {
              username: user.username || uid,
              avatar: user.avatar || null,
              displayName: user.displayName || user.username || uid
            });
          }
        } catch (error) {
          console.error(`Error fetching user ${uid}:`, error);
        }
      }

      const enrichedPosts = posts.map(post => {
        const userData = userDataMap.get(post.userId) || {};
        return {
          ...post,
          username: userData.username,
          userAvatar: userData.avatar,
          userDisplayName: userData.displayName
        };
      });

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ saved: enrichedPosts }) };
    }

    // UPLOAD PUBLIC KEY BUNDLE - POST /users/public-keys
    if (method === "POST" && path === "/users/public-keys") {
      const authHeader = getHeaderCaseInsensitive(event.headers, 'authorization');
      if (!authHeader) {
        return createResponse(event,401, { message: "unauthorized" });
      }

      const token = authHeader.replace('Bearer ', '');
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (error) {
        return createResponse(event,401, { message: "invalid token" });
      }

      const body = JSON.parse(event.body || "{}");
      const { bundle } = body;

      if (!bundle) {
        return createResponse(event,400, { message: "bundle required" });
      }

      // Store bundle in keybackup table
      try {
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `USER#${decoded.userId}`,
            SK: 'KEYBUNDLE',
            bundle,
            updatedAt: new Date().toISOString()
          }
        }));

        return createResponse(event,200, { success: true });
      } catch (error) {
        console.error('Error storing public key bundle:', error);
        return createResponse(event,500, { message: "failed to store bundle" });
      }
    }

    // GET PUBLIC KEY BUNDLE - GET /users/{identifier}/public-keys
    if (method === "GET" && path.includes("/public-keys")) {
      const identifier = event.pathParameters?.username;
      
      if (!identifier) {
        return createResponse(event,400, { message: "identifier required" });
      }

      try {
        // Check if identifier is full UUID or partial UUID (8 chars)
        const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        const isPartialUuid = /^[0-9a-f]{8}$/i.test(identifier);
        
        let userId;
        if (isFullUuid) {
          userId = identifier;
        } else if (isPartialUuid) {
          // Search for user with partial UUID - OPTIMIZED: Use TypeIndex
          const scanResult = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "TypeIndex",
            KeyConditionExpression: "#type = :type",
            FilterExpression: "begins_with(userId, :partial)",
            ExpressionAttributeNames: { "#type": "type" },
            ExpressionAttributeValues: { ":type": "user", ":partial": identifier },
            Limit: 1
          }));
          
          if (!scanResult.Items || scanResult.Items.length === 0) {
            return createResponse(event,404, { error: "User not found" });
          }
          
          userId = scanResult.Items[0].userId;
        } else {
          // Get userId from username
          const userResult = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { PK: `USER#${identifier}`, SK: "PROFILE" }
          }));
          
          if (!userResult.Item) {
            return createResponse(event,404, { error: "User not found" });
          }
          
          userId = userResult.Item.userId;
        }

        // Get bundle from keybackup
        const bundleResult = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { PK: `USER#${userId}`, SK: 'KEYBUNDLE' }
        }));

        if (!bundleResult.Item?.bundle) {
          return createResponse(event,404, { error: "Bundle not found" });
        }

        return createResponse(event,200, { bundle: bundleResult.Item.bundle });
      } catch (error) {
        console.error('Error fetching public key bundle:', error);
        return createResponse(event,500, { message: "internal error" });
      }
    }

    // SEARCH USERS - GET /users/search
    if (method === "GET" && path === "/users/search") {
      const query = event.queryStringParameters?.q || "";
      const searchType = event.queryStringParameters?.searchType || "both";
      const limit = parseInt(event.queryStringParameters?.limit || 50);

      if (!query || query.length < 1) {
        return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "query required" }) };
      }

      // OPTIMIZATION: If query is a UUID, use GSI1 for a direct lookup.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      if (isUuid) {
        const result = await ddb.send(new QueryCommand({
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues: {
              ":pk": `USERID#${query}`,
              ":sk": "PROFILE"
            },
            Limit: 1
        }));

        const users = (result.Items || []).map(user => {
          delete user.password;
          delete user.verificationCode;
          delete user.resetCode;
          return user;
        });
        
        return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ users, count: users.length }) };
      }

      // Fallback to Scan for general text search (less efficient, but works for broad queries)
      let allUsers = [];
      let lastEvaluatedKey = null;
      
      do {
        const scanParams = {
          TableName: TABLE,
          FilterExpression: "#type = :type AND SK = :sk AND #status = :status",
          ExpressionAttributeNames: { "#type": "type", "#status": "status" },
          ExpressionAttributeValues: { ":type": "user", ":sk": "PROFILE", ":status": "active" }
        };
        
        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await ddb.send(new ScanCommand(scanParams));
        allUsers = allUsers.concat(result.Items || []);
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      const searchTerm = query.toLowerCase();
      let users = allUsers
        .filter(user => {
          const username = (user.username || '').toLowerCase();
          const displayName = (user.displayName || '').toLowerCase();
          
          if (searchType === 'username') {
            return username.includes(searchTerm);
          } else if (searchType === 'displayName') {
            return displayName.includes(searchTerm);
          } else {
            return username.includes(searchTerm) || displayName.includes(searchTerm);
          }
        })
        .map(user => {
          delete user.password;
          delete user.verificationCode;
          delete user.resetCode;
          return user;
        })
        .slice(0, limit);

      return { statusCode: 200, headers: getCorsHeaders(event), body: JSON.stringify({ users, count: users.length }) };
    }

    console.log('=== UNHANDLED REQUEST ===');
    console.log('Method:', method);
    console.log('Path:', path);
    console.log('Path parameters:', event.pathParameters);
    console.log('Query parameters:', event.queryStringParameters);
    return { statusCode: 400, headers: getCorsHeaders(event), body: JSON.stringify({ message: "bad request", path, method }) };
  } catch (err) {
    console.error("users error", err);
    
    // Don't leak error details in production (security best practice)
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    return { 
      statusCode: 500, 
      headers: getCorsHeaders(event), 
      body: JSON.stringify({ 
        message: "internal error",
        ...(isDevelopment ? { error: err.message, stack: err.stack } : {})
      }) 
    };
  }
};
