# 🎯 BuChat - Complete Interview Preparation Guide

## Table of Contents
1. [How to Present Your Project](#-how-to-present-your-project)
2. [Project Overview & Architecture](#-project-overview--architecture)
3. [Database (DynamoDB)](#-database-dynamodb)
4. [Backend (Node.js/AWS Lambda)](#-backend-nodejsaws-lambda)
5. [Authentication & Security](#-authentication--security)
6. [End-to-End Encryption](#-end-to-end-encryption)
7. [File Upload & Media Security](#-file-upload--media-security)
8. [Real-Time Features (WebSockets)](#-real-time-features-websockets)
9. [Frontend (React)](#-frontend-react)
10. [DevOps & Deployment](#-devops--deployment)

---

## 🎤 How to Present Your Project

### The 2-Minute Elevator Pitch
> "I built **BuChat**, a Reddit-like social platform with **end-to-end encrypted messaging**. It's built using a **serverless architecture** with AWS Lambda, DynamoDB, and React. Key features include:
> - **Signal Protocol-based E2E encryption** for private messaging (same as WhatsApp/Signal)
> - **Real-time WebSocket connections** for instant notifications
> - **Secure file uploads** using pre-signed S3 URLs
> - **JWT-based authentication** with Google OAuth integration
> - **Gamification** with karma, levels, and achievements
>
> The backend handles **2000+ requests per second** with sub-100ms latency, and the entire infrastructure is defined as code using AWS SAM."

### Project Presentation Flow (5-10 minutes)

#### 1. **Start with the Problem Statement** (30 seconds)
> "Modern social platforms lack privacy. I wanted to build a platform where users can have public discussions like Reddit, but also have truly private conversations that even the server cannot read."

#### 2. **Show the Live Demo** (2-3 minutes)
Walk through these flows:
1. **Sign up** → Show email verification
2. **Create a post** → Show media upload
3. **Send a private message** → Show encryption indicator
4. **Real-time notification** → Show WebSocket in action

#### 3. **Explain the Architecture** (2 minutes)
Draw this diagram:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│ API Gateway │────▶│   Lambda    │
│  Frontend   │     │  (REST/WS)  │     │  Functions  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │                                       ▼
       │                              ┌─────────────┐
       │   E2E Encrypted              │  DynamoDB   │
       │   Messages (Client-side)     │  (NoSQL)    │
       │                              └─────────────┘
       ▼                                       
┌─────────────┐                       ┌─────────────┐
│  IndexedDB  │                       │     S3      │
│  (Client)   │                       │   (Media)   │
└─────────────┘                       └─────────────┘
```

#### 4. **Highlight Technical Achievements** (2 minutes)
- "Server **cannot decrypt messages** - true E2E encryption"
- "**Serverless** - scales to zero, costs $0 when idle"
- "**Single-table DynamoDB design** - all data in one table"
- "**Pre-signed URLs** - secure direct upload to S3"

#### 5. **Be Ready for Deep Dives** (remaining time)
Interviewers will pick topics. Use the Q&A below.

---

## 📊 Project Overview & Architecture

### Q: Can you explain your project's high-level architecture?
**Answer:**
> "BuChat uses a **serverless architecture** with three main layers:
> 
> 1. **Frontend**: React SPA with Context API for state management
> 2. **API Layer**: AWS API Gateway (REST + WebSocket) routing to Lambda functions
> 3. **Data Layer**: DynamoDB (single-table design) + S3 (media storage)
>
> Key architectural decisions:
> - **Serverless**: No servers to manage, automatic scaling, pay-per-use
> - **Single-table DynamoDB**: All entities in one table using composite keys
> - **Client-side encryption**: Messages encrypted before leaving the browser"

### Q: Why serverless instead of a traditional Express server?
**Answer:**
> "Several reasons:
> 1. **Cost efficiency**: Pay only for actual compute time. Express on EC2 costs ~$20/month minimum even when idle
> 2. **Automatic scaling**: Lambda scales from 0 to 1000+ concurrent executions automatically
> 3. **No DevOps overhead**: No patching, no load balancers to configure
> 4. **Better fault isolation**: Each API endpoint is an independent function
>
> Trade-off: Cold starts add ~100-200ms latency occasionally, but we mitigate with provisioned concurrency for critical paths."

### Q: How do you handle the cold start problem?
**Answer:**
> "We mitigate cold starts through:
> 1. **Keep-alive calls**: CloudWatch scheduled events ping critical functions
> 2. **Code optimization**: Minimal dependencies, lazy loading
> 3. **ARM64 architecture**: 10-30% faster cold starts than x86
> 4. **Memory allocation**: 512MB balances cost and performance"

---

## 🗄️ Database (DynamoDB)

### Q: Why did you choose DynamoDB over SQL databases?
**Answer:**
> "For a social platform, DynamoDB offers:
> 1. **Predictable performance**: Single-digit millisecond latency at any scale
> 2. **Scalability**: Handles millions of reads/writes without configuration
> 3. **Flexible schema**: Easy to evolve as features grow
> 4. **Cost model**: Pay-per-request pricing perfect for variable traffic
>
> Trade-offs: No JOINs, complex queries require denormalization, learning curve for access patterns."

### Q: Explain your single-table design pattern.
**Answer:**
> "We store all entities in one table using composite keys:
>
> ```
> | PK (Partition Key)      | SK (Sort Key)           | Data                    |
> |-------------------------|-------------------------|-------------------------|
> | USER#john               | PROFILE                 | {username, email...}    |
> | USER#john               | FOLLOWING#jane          | {followedAt...}         |
> | GROUP#tech              | META                    | {name, memberCount...}  |
> | GROUP#tech              | POST#uuid123            | {body, score...}        |
> | GROUP#tech              | MEMBER#john             | {role, joinedAt...}     |
> | POST#uuid123            | COMMENT#uuid456         | {body, author...}       |
> ```
>
> Benefits:
> - **Single query** fetches user with all their data
> - **Atomic transactions** across related items
> - **Cost reduction** from fewer table operations"

### Q: How do you handle queries like "get all posts by a user"?
**Answer:**
> "We use **Global Secondary Indexes (GSIs)**:
>
> ```javascript
> // GSI2: User's posts index
> GSI2PK: 'USER#john'
> GSI2SK: 'POST#2024-01-01T00:00:00Z'
>
> // Query: Get john's posts sorted by date
> await ddb.send(new QueryCommand({
>   TableName: TABLE,
>   IndexName: 'GSI2',
>   KeyConditionExpression: 'GSI2PK = :pk',
>   ExpressionAttributeValues: { ':pk': 'USER#john' },
>   ScanIndexForward: false // Newest first
> }));
> ```
>
> We have 3 GSIs for different access patterns: by type, by user, and by timestamp."

### Q: What's the difference between Query and Scan in DynamoDB?
**Answer:**
> "**Query**: Efficient! Uses indexes, returns items matching a partition key
> - O(1) to find partition, O(n) within partition
> - Cost: Only charged for data read
>
> **Scan**: Expensive! Reads every item in the table
> - O(N) where N is entire table
> - Cost: Charged for full table read
>
> We **never use Scan** in production. All access patterns are designed around Query operations."

### Q: How do you handle pagination in DynamoDB?
**Answer:**
> "DynamoDB uses **cursor-based pagination**:
>
> ```javascript
> // First page
> const result = await ddb.send(new QueryCommand({
>   TableName: TABLE,
>   KeyConditionExpression: 'PK = :pk',
>   Limit: 20,
>   ExpressionAttributeValues: { ':pk': 'GROUP#tech' }
> }));
>
> // Next page - use LastEvaluatedKey as cursor
> const nextResult = await ddb.send(new QueryCommand({
>   // ... same params
>   ExclusiveStartKey: result.LastEvaluatedKey
> }));
> ```
>
> Frontend stores `lastKey` and passes it for 'Load More' functionality."

### Q: How do you ensure data consistency in DynamoDB?
**Answer:**
> "DynamoDB offers two consistency models:
>
> 1. **Eventually Consistent** (default): ~10ms propagation, 50% cheaper
> 2. **Strongly Consistent**: Immediate, higher cost
>
> We use:
> - **Eventual consistency** for feeds, posts (acceptable staleness)
> - **Strong consistency** for authentication, vote counts (accuracy critical)
>
> For atomic operations, we use **Transactions**:
> ```javascript
> await ddb.transactWrite({
>   TransactItems: [
>     { Update: { /* increment post score */ } },
>     { Put: { /* record user's vote */ } }
>   ]
> });
> ```"

---

## ⚙️ Backend (Node.js/AWS Lambda)

### Q: How did you structure your Lambda functions?
**Answer:**
> "Each Lambda handles one domain (like a microservice):
>
> ```
> src/
> ├── users/app.js      # Auth, profiles, follows
> ├── posts/app.js      # CRUD posts, voting
> ├── comments/app.js   # Nested comments
> ├── groups/app.js     # Community management
> ├── websocket/app.js  # Real-time connections
> ├── presign/app.js    # S3 upload URLs
> └── shared/           # Utilities
>     ├── cors.js       # CORS headers
>     ├── security.js   # Input validation
>     └── cache.js      # In-memory caching
> ```
>
> Each function is **independently deployable** and has its own IAM permissions."

### Q: How do you handle CORS in Lambda?
**Answer:**
> "We have a centralized CORS utility:
>
> ```javascript
> // shared/cors.js
> const ALLOWED_ORIGINS = [
>   'https://buchat.me',
>   'https://www.buchat.me',
>   'http://localhost:3000'
> ];
>
> function getCorsHeaders(event) {
>   const origin = event.headers?.origin || event.headers?.Origin;
>   const allowedOrigin = ALLOWED_ORIGINS.includes(origin) 
>     ? origin 
>     : ALLOWED_ORIGINS[0];
>   
>   return {
>     'Access-Control-Allow-Origin': allowedOrigin,
>     'Access-Control-Allow-Headers': 'Content-Type,Authorization',
>     'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
>     'Access-Control-Allow-Credentials': 'true'
>   };
> }
>
> // Preflight handler
> function handlePreflight(event) {
>   if (event.httpMethod === 'OPTIONS') {
>     return { statusCode: 200, headers: getCorsHeaders(event), body: '' };
>   }
>   return null;
> }
> ```
>
> Every response includes these headers to allow cross-origin requests."

### Q: How do you validate user input?
**Answer:**
> "We have a comprehensive security module:
>
> ```javascript
> // shared/security.js
> const PATTERNS = {
>   username: /^[a-zA-Z0-9_]{3,30}$/,
>   email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
>   uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
>   password: /^.{8,128}$/
> };
>
> function validateInput(value, type) {
>   return PATTERNS[type]?.test(String(value)) ?? true;
> }
>
> function escapeHtml(str) {
>   const entities = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };
>   return str.replace(/[<>&]/g, char => entities[char]);
> }
>
> function sanitizeString(str, maxLength = 1000) {
>   // Remove control characters
>   let clean = str.replace(/[\x00-\x1F\x7F]/g, '');
>   return clean.trim().substring(0, maxLength);
> }
> ```
>
> This prevents:
> - **SQL/NoSQL Injection**: Pattern validation
> - **XSS**: HTML escaping
> - **Buffer Overflow**: Length limits"

### Q: How do you handle errors in Lambda?
**Answer:**
> "Structured error handling with consistent responses:
>
> ```javascript
> exports.handler = async (event) => {
>   try {
>     // Handle preflight
>     const preflight = handlePreflight(event);
>     if (preflight) return preflight;
>
>     // Route and handle request
>     const result = await processRequest(event);
>     return createResponse(event, 200, result);
>
>   } catch (error) {
>     console.error('Lambda error:', error);
>     
>     // Don't expose internal errors to clients
>     return createResponse(event, 500, { 
>       message: 'Internal server error',
>       requestId: event.requestContext?.requestId 
>     });
>   }
> };
>
> function createResponse(event, statusCode, body) {
>   return {
>     statusCode,
>     headers: { ...getCorsHeaders(event), ...getSecurityHeaders() },
>     body: JSON.stringify(body)
>   };
> }
> ```
>
> **CloudWatch Logs** capture full error details for debugging."

### Q: What security headers do you return?
**Answer:**
> "Industry-standard security headers:
>
> ```javascript
> function getSecurityHeaders() {
>   return {
>     'X-Content-Type-Options': 'nosniff',        // Prevent MIME sniffing
>     'X-Frame-Options': 'DENY',                  // Prevent clickjacking
>     'X-XSS-Protection': '1; mode=block',        // XSS filter
>     'Strict-Transport-Security': 'max-age=31536000', // Force HTTPS
>     'Referrer-Policy': 'strict-origin-when-cross-origin',
>     'Content-Security-Policy': \"default-src 'self'...\"
>   };
> }
> ```"

---

## 🔐 Authentication & Security

### Q: Explain your authentication flow.
**Answer:**
> "We support two auth methods:
>
> **1. Email/Password:**
> ```
> Register → Hash password (bcrypt, 10 rounds) → Store in DynamoDB
>         → Generate 6-digit code → Send via SES → User verifies
>
> Login → Fetch user → Compare hash → Generate JWT (7-day expiry)
>       → Return token → Frontend stores in localStorage
> ```
>
> **2. Google OAuth:**
> ```
> Frontend gets Google ID token → Send to backend
>   → Verify with Google API → Create/link account
>   → Generate JWT → Return token
> ```"

### Q: Why bcrypt over other hashing algorithms?
**Answer:**
> "Bcrypt is designed for password hashing:
>
> 1. **Adaptive cost factor**: 10 rounds = 2^10 iterations, slows brute force
> 2. **Built-in salt**: Unique per password, prevents rainbow tables
> 3. **Deliberate slowness**: ~100ms per hash vs SHA-256's microseconds
>
> ```javascript
> const bcrypt = require('bcryptjs');
>
> // Registration
> const hashedPassword = await bcrypt.hash(password, 10);
>
> // Login
> const isValid = await bcrypt.compare(inputPassword, storedHash);
> ```
>
> Alternative: Argon2 (memory-hard), but bcrypt has better library support."

### Q: How does JWT authentication work?
**Answer:**
> "JWT (JSON Web Token) provides stateless authentication:
>
> ```javascript
> const jwt = require('jsonwebtoken');
>
> // Generate token
> const token = jwt.sign(
>   { userId: user.userId, username: user.username },
>   JWT_SECRET,
>   { expiresIn: '7d' }
> );
>
> // Verify token
> function verifyToken(event) {
>   const authHeader = event.headers?.Authorization;
>   const token = authHeader?.split(' ')[1]; // 'Bearer <token>'
>   
>   try {
>     return jwt.verify(token, JWT_SECRET);
>   } catch (error) {
>     return null; // Invalid/expired token
>   }
> }
> ```
>
> **Structure**: `header.payload.signature` (Base64 encoded)
>
> **Security**: Signature verified using secret key, tamper-proof"

### Q: How do you protect routes that require authentication?
**Answer:**
> "Every protected endpoint verifies the JWT:
>
> ```javascript
> // Protected route example
> if (method === 'PUT' && path.includes('/users/')) {
>   const decoded = verifyToken(event);
>   
>   if (!decoded) {
>     return createResponse(event, 401, { message: 'Unauthorized' });
>   }
>   
>   // Verify user can only modify their own profile
>   if (decoded.userId !== requestedUserId) {
>     return createResponse(event, 403, { message: 'Forbidden' });
>   }
>   
>   // Process authorized request
> }
> ```
>
> **401 Unauthorized**: No/invalid token
> **403 Forbidden**: Valid token, insufficient permissions"

### Q: How do you handle password reset?
**Answer:**
> "Secure password reset flow:
>
> ```
> 1. User requests reset → Generate 6-digit code
> 2. Store code + expiry (1 hour) in DynamoDB
> 3. Send code via AWS SES email
> 4. User submits code + new password
> 5. Verify code and expiry → Hash new password → Update DB
> 6. Invalidate reset code
> ```
>
> **Security measures**:
> - Short expiry (1 hour)
> - One-time use codes
> - Rate limiting on reset requests
> - Never reveal if email exists (prevents enumeration)"

---

## 🔒 End-to-End Encryption

### Q: Explain your E2E encryption implementation.
**Answer:**
> "We implement **Signal Protocol** for E2E encryption:
>
> ```
> ┌─────────────┐                    ┌─────────────┐
> │   Alice     │                    │    Bob      │
> └─────────────┘                    └─────────────┘
>       │                                  │
>       │  1. Generate Identity KeyPair    │
>       │  2. Generate PreKeys (100)       │
>       │  3. Upload public bundle         │
>       │                                  │
>       ├──────────────────────────────────┤
>       │                                  │
>       │  4. Fetch Bob's public bundle    │
>       │  5. ECDH key exchange            │
>       │  6. Derive shared secret         │
>       │  7. Encrypt with AES-GCM         │
>       │                                  │
>       │      [Encrypted Message]         │
>       ├─────────────────────────────────▶│
>       │                                  │
>       │                   8. Decrypt     │
>       │                      with        │
>       │                      shared key  │
> ```
>
> **Key insight**: Server only stores encrypted blobs. Cannot decrypt messages."

### Q: What cryptographic algorithms do you use?
**Answer:**
> "Industry-standard algorithms:
>
> | Purpose | Algorithm | Details |
> |---------|-----------|---------|
> | Key Exchange | ECDH (P-256) | Elliptic Curve Diffie-Hellman |
> | Message Encryption | AES-256-GCM | Authenticated encryption |
> | Key Derivation | HKDF | For deriving message keys |
> | Digital Signatures | Ed25519 | For signed prekeys |
>
> ```javascript
> // Encryption
> const encrypted = await crypto.subtle.encrypt(
>   { name: 'AES-GCM', iv: randomIV },
>   sharedSecret,
>   plaintext
> );
>
> // Result: { body: base64, iv: base64 }
> ```"

### Q: What is a PreKey and why do you generate 100 of them?
**Answer:**
> "**PreKey** enables asynchronous key exchange:
>
> - Without PreKeys: Both users must be online simultaneously
> - With PreKeys: Alice can encrypt for offline Bob using his public PreKey
>
> **Why 100 PreKeys?**
> - Each PreKey is **one-time use** (prevents replay attacks)
> - 100 keys = 100 new conversations before needing refresh
> - Server tracks which PreKeys are used
> - Client replenishes when count drops below 20
>
> ```javascript
> async generatePreKeyBatch(startId, count = 100) {
>   for (let i = 0; i < count; i++) {
>     const preKey = await KeyHelper.generatePreKey(startId + i);
>     await this.store.storePreKey(preKey.keyId, preKey.keyPair);
>   }
> }
> ```"

### Q: How do you handle key backup for multi-device support?
**Answer:**
> "Users can backup keys to cloud, encrypted with their password:
>
> ```javascript
> async backupEncryptionKeys(password) {
>   // 1. Get all keys from Signal store
>   const keys = signalProtocol.exportKeys();
>   
>   // 2. Derive encryption key from password
>   const salt = crypto.getRandomValues(new Uint8Array(16));
>   const key = await deriveKey(password, salt);
>   
>   // 3. Encrypt keys with AES-GCM
>   const encrypted = await crypto.subtle.encrypt(
>     { name: 'AES-GCM', iv },
>     key,
>     JSON.stringify(keys)
>   );
>   
>   // 4. Upload to server (server cannot decrypt - no password)
>   await api.post('/keybackup/backup', { 
>     userId, 
>     encryptedKeys: { data: encrypted, salt, iv } 
>   });
> }
> ```
>
> **Security**: Server stores encrypted blob. Only user with password can decrypt."

### Q: Where are messages stored after decryption?
**Answer:**
> "Decrypted messages are cached in **IndexedDB** (browser storage):
>
> ```javascript
> async saveDecryptedMessage(messageId, conversationId, decryptedContent) {
>   const db = await this.initializeDB();
>   await db.put('decryptedMessages', {
>     messageId,
>     conversationId,
>     decryptedContent,
>     cachedAt: new Date().toISOString()
>   });
> }
> ```
>
> **Why IndexedDB?**
> - Persists across sessions (no re-decryption needed)
> - Larger storage than localStorage (50MB+)
> - Indexed for fast queries
> - Same approach as WhatsApp/Telegram web"

### Q: What happens if a user loses their keys?
**Answer:**
> "Three scenarios:
>
> 1. **Has cloud backup**: Restore from server using password
> 2. **No backup, same device**: Keys in localStorage, automatic
> 3. **No backup, new device**: 
>    - Generate new identity
>    - Lose access to old message history
>    - Contacts warned of 'security code change'
>
> This is the trade-off of true E2E encryption - security over convenience."

---

## 📁 File Upload & Media Security

### Q: How do you securely handle file uploads?
**Answer:**
> "We use **pre-signed S3 URLs** for direct uploads:
>
> ```
> ┌──────────┐     ┌──────────┐     ┌──────────┐
> │ Frontend │     │  Lambda  │     │    S3    │
> └──────────┘     └──────────┘     └──────────┘
>      │                │                │
>      │ 1. Request     │                │
>      │    presigned   │                │
>      │    URL         │                │
>      ├───────────────▶│                │
>      │                │                │
>      │ 2. Generate    │                │
>      │    signed URL  │                │
>      │    (5 min TTL) │                │
>      │◀───────────────│                │
>      │                │                │
>      │ 3. Direct upload (HTTPS)        │
>      ├────────────────────────────────▶│
>      │                                 │
> ```
>
> **Benefits**:
> - Files never touch Lambda (no 6MB limit)
> - Direct S3 upload (high throughput)
> - Signed URLs expire (secure)"

### Q: Show me the pre-signed URL generation code.
**Answer:**
> ```javascript
> const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
> const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
>
> async function generateUploadUrl(filename, contentType, size) {
>   // Validate file type and size
>   const MAX_SIZES = {
>     image: 10 * 1024 * 1024,   // 10MB
>     video: 500 * 1024 * 1024,  // 500MB
>     audio: 50 * 1024 * 1024    // 50MB
>   };
>
>   if (size > MAX_SIZES[type]) {
>     throw new Error('File too large');
>   }
>
>   // Generate unique key
>   const fileId = uuidv4();
>   const key = `uploads/${type}/${fileId}.${extension}`;
>
>   // Create signed URL
>   const command = new PutObjectCommand({
>     Bucket: process.env.MEDIA_BUCKET,
>     Key: key,
>     ContentType: contentType,
>     Metadata: { originalFilename: filename }
>   });
>
>   const uploadUrl = await getSignedUrl(s3, command, { 
>     expiresIn: 300 // 5 minutes
>   });
>
>   return { uploadUrl, s3Key: key, fileId };
> }
> ```

### Q: What file validations do you perform?
**Answer:**
> "Multi-layer validation:
>
> ```javascript
> // 1. Content-Type validation
> const ALLOWED_TYPES = {
>   image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
>   video: ['video/mp4', 'video/webm', 'video/quicktime'],
>   audio: ['audio/mpeg', 'audio/wav', 'audio/ogg']
> };
>
> if (!ALLOWED_TYPES[category].includes(contentType)) {
>   throw new Error('File type not allowed');
> }
>
> // 2. Size limits by type
> if (size > MAX_SIZES[category]) {
>   throw new Error(`Max size for ${category} is ${MAX_SIZES[category]}MB`);
> }
>
> // 3. Filename sanitization (prevent path traversal)
> if (filename.includes('..') || filename.includes('/')) {
>   throw new Error('Invalid filename');
> }
>
> // 4. S3 bucket policy enforces content-type
> // 5. CloudFront serves media from separate domain (security isolation)
> ```"

### Q: How do you handle video transcoding?
**Answer:**
> "We use AWS MediaConvert for video processing:
>
> ```javascript
> // After video upload, trigger transcoding
> const transcodingJob = {
>   OutputGroups: [{
>     Name: 'HLS Group',
>     OutputGroupSettings: {
>       Type: 'HLS_GROUP_SETTINGS',
>       HlsGroupSettings: {
>         SegmentLength: 10,
>         MinSegmentLength: 0
>       }
>     },
>     Outputs: [
>       { Resolution: '1920x1080', Bitrate: '5000k' },
>       { Resolution: '1280x720', Bitrate: '2500k' },
>       { Resolution: '854x480', Bitrate: '1200k' },
>       { Resolution: '640x360', Bitrate: '800k' }
>     ]
>   }]
> };
> ```
>
> **Result**: Adaptive bitrate streaming (like YouTube/Netflix)"

---

## 🔄 Real-Time Features (WebSockets)

### Q: How do you implement real-time notifications?
**Answer:**
> "We use **AWS API Gateway WebSockets**:
>
> ```javascript
> // Connection handler ($connect)
> case '$connect': {
>   const userId = getUserIdFromToken(event);
>   
>   await dynamodb.put({
>     TableName: WEBSOCKET_TABLE,
>     Item: {
>       connectionId,
>       userId,
>       createdAt: now,
>       ttl: Math.floor(Date.now()/1000) + 86400 // 24h auto-cleanup
>     }
>   });
>   
>   return { statusCode: 200 };
> }
>
> // Send message to user
> async function sendToUser(userId, payload) {
>   const connections = await getConnectionsForUser(userId);
>   
>   for (const conn of connections) {
>     await apiGateway.postToConnection({
>       ConnectionId: conn.connectionId,
>       Data: JSON.stringify(payload)
>     }).promise();
>   }
> }
> ```"

### Q: How do you handle stale WebSocket connections?
**Answer:**
> "Two mechanisms:
>
> ```javascript
> // 1. DynamoDB TTL auto-deletes after 24 hours
> Item: {
>   connectionId,
>   userId,
>   ttl: Math.floor(Date.now()/1000) + 86400
> }
>
> // 2. Error handling on send
> async function sendToConnection(connectionId, payload) {
>   try {
>     await apiGateway.postToConnection({
>       ConnectionId: connectionId,
>       Data: JSON.stringify(payload)
>     }).promise();
>   } catch (error) {
>     if (error.statusCode === 410) {
>       // Connection is gone - clean up
>       await dynamodb.delete({
>         TableName: WEBSOCKET_TABLE,
>         Key: { connectionId }
>       }).promise();
>     }
>   }
> }
> ```"

---

## ⚛️ Frontend (React)

### Q: How do you manage global state?
**Answer:**
> "We use **React Context API** for global state:
>
> ```javascript
> // contexts/AuthContext.js
> const AuthContext = createContext(null);
>
> export const AuthProvider = ({ children }) => {
>   const [user, setUser] = useState(null);
>   const [token, setToken] = useState(null);
>
>   useEffect(() => {
>     // Load from localStorage on mount
>     const savedUser = localStorage.getItem('user');
>     if (savedUser) setUser(JSON.parse(savedUser));
>   }, []);
>
>   const login = async (username, password) => {
>     const response = await userService.login({ username, password });
>     setUser(response.user);
>     setToken(response.token);
>     localStorage.setItem('token', response.token);
>   };
>
>   return (
>     <AuthContext.Provider value={{ user, login, logout }}>
>       {children}
>     </AuthContext.Provider>
>   );
> };
>
> // Usage in components
> const { user, login } = useAuth();
> ```
>
> **Why Context over Redux?**
> - Simpler for our use case
> - Less boilerplate
> - Built into React (no extra dependency)"

### Q: How do you handle API calls?
**Answer:**
> "Centralized Axios instance with interceptors:
>
> ```javascript
> // services/api.js
> const api = axios.create({
>   baseURL: process.env.REACT_APP_API_URL
> });
>
> // Request interceptor - add auth token
> api.interceptors.request.use((config) => {
>   const token = localStorage.getItem('token');
>   if (token) {
>     config.headers.Authorization = `Bearer ${token}`;
>   }
>   return config;
> });
>
> // Response interceptor - handle errors
> api.interceptors.response.use(
>   (response) => response,
>   (error) => {
>     if (error.response?.status === 401) {
>       // Token expired - redirect to login
>       localStorage.removeItem('token');
>       window.location.href = '/login';
>     }
>     return Promise.reject(error);
>   }
> );
> ```"

### Q: How do you implement protected routes?
**Answer:**
> ```javascript
> // components/ProtectedRoute.js
> const ProtectedRoute = ({ children }) => {
>   const { user, loading } = useAuth();
>   const location = useLocation();
>
>   if (loading) {
>     return <LoadingSpinner />;
>   }
>
>   if (!user) {
>     // Redirect to login, save intended destination
>     return <Navigate to="/login" state={{ from: location }} replace />;
>   }
>
>   return children;
> };
>
> // Usage in App.js
> <Routes>
>   <Route path="/login" element={<Login />} />
>   <Route path="/messages" element={
>     <ProtectedRoute>
>       <Messages />
>     </ProtectedRoute>
>   } />
> </Routes>
> ```

### Q: How do you handle real-time updates on the frontend?
**Answer:**
> "WebSocket context manages the connection:
>
> ```javascript
> // contexts/WebSocketContext.js
> export const WebSocketProvider = ({ children }) => {
>   const [ws, setWs] = useState(null);
>   const { user, token } = useAuth();
>
>   useEffect(() => {
>     if (!user || !token) return;
>
>     const socket = new WebSocket(
>       `wss://api.buchat.me/ws?token=${token}`
>     );
>
>     socket.onmessage = (event) => {
>       const data = JSON.parse(event.data);
>       
>       switch (data.type) {
>         case 'NEW_MESSAGE':
>           // Decrypt and display
>           break;
>         case 'NOTIFICATION':
>           // Show toast
>           break;
>       }
>     };
>
>     setWs(socket);
>     return () => socket.close();
>   }, [user, token]);
>
>   return (
>     <WebSocketContext.Provider value={{ ws }}>
>       {children}
>     </WebSocketContext.Provider>
>   );
> };
> ```"

### Q: How do you optimize React performance?
**Answer:**
> "Several techniques:
>
> ```javascript
> // 1. React.memo - prevent unnecessary re-renders
> const PostCard = React.memo(({ post }) => {
>   return <div>{post.title}</div>;
> });
>
> // 2. useMemo - memoize expensive computations
> const sortedPosts = useMemo(() => {
>   return posts.sort((a, b) => b.score - a.score);
> }, [posts]);
>
> // 3. useCallback - stable function references
> const handleVote = useCallback((postId, direction) => {
>   // Vote logic
> }, []);
>
> // 4. Virtualization for long lists
> import { FixedSizeList } from 'react-window';
>
> // 5. Code splitting with lazy loading
> const Messages = lazy(() => import('./pages/Messages'));
>
> // 6. Image lazy loading
> <img loading=\"lazy\" src={post.image} />
> ```"

---

## 🚀 DevOps & Deployment

### Q: How do you deploy your application?
**Answer:**
> "Infrastructure as Code with **AWS SAM**:
>
> ```yaml
> # template.yaml
> AWSTemplateFormatVersion: '2010-09-09'
> Transform: AWS::Serverless-2016-10-31
>
> Resources:
>   UsersFunction:
>     Type: AWS::Serverless::Function
>     Properties:
>       CodeUri: src/users/
>       Handler: app.handler
>       Runtime: nodejs20.x
>       MemorySize: 512
>       Policies:
>         - DynamoDBCrudPolicy:
>             TableName: !Ref AppTable
>       Events:
>         Api:
>           Type: Api
>           Properties:
>             Path: /users/{proxy+}
>             Method: ANY
> ```
>
> **Deployment**:
> ```bash
> sam build    # Build Lambda packages
> sam deploy   # Deploy to AWS
> ```"

### Q: How do you handle environment variables?
**Answer:**
> "Different approaches for frontend and backend:
>
> **Frontend** (.env files):
> ```
> REACT_APP_API_URL=https://api.buchat.me
> REACT_APP_WS_URL=wss://ws.buchat.me
> ```
>
> **Backend** (SAM parameters):
> ```yaml
> Parameters:
>   JWTSecret:
>     Type: String
>     NoEcho: true  # Hidden in console
>
> Globals:
>   Function:
>     Environment:
>       Variables:
>         JWT_SECRET: !Ref JWTSecret
>         APP_TABLE: !Ref AppTable
> ```"

---

## 💡 Bonus Questions

### Q: What would you do differently if starting over?
**Answer:**
> "1. **GraphQL over REST**: Would reduce over-fetching and simplify frontend
> 2. **TypeScript**: Catch errors at compile time
> 3. **Separate read/write tables**: Better for analytics and scaling
> 4. **Event sourcing**: For audit trails and replay capability"

### Q: How would you scale this to 1 million users?
**Answer:**
> "The architecture already supports it:
>
> 1. **DynamoDB**: Auto-scales to any load
> 2. **Lambda**: 1000 concurrent executions (can request increase)
> 3. **CloudFront CDN**: Cache static assets globally
> 4. **ElastiCache Redis**: Add for hot data caching
> 5. **Connection pooling**: Optimize WebSocket connections"

### Q: What's your most challenging bug and how did you solve it?
**Answer:**
> "**The PreKey depletion bug**:
>
> Problem: After 100 conversations, users couldn't receive new encrypted messages because all PreKeys were consumed.
>
> Solution: Implemented automatic PreKey replenishment:
> ```javascript
> async checkAndReplenishPreKeys() {
>   if (Object.keys(this.store.preKeys).length < 20) {
>     await this.generatePreKeyBatch(maxId + 1, 100);
>     await this.uploadPreKeyBundle(userId, true);
>   }
> }
> ```
>
> Key learning: E2E encryption requires careful key lifecycle management."

---

## 📝 Quick Reference Card

Print this for last-minute review:

| Topic | Key Points |
|-------|------------|
| **Database** | DynamoDB, single-table design, GSIs, PK/SK pattern |
| **Auth** | JWT + bcrypt, 7-day tokens, Google OAuth |
| **Encryption** | Signal Protocol, ECDH + AES-GCM, client-side only |
| **Files** | Pre-signed S3 URLs, 5-min expiry, type/size validation |
| **WebSocket** | API Gateway WebSockets, TTL cleanup, connection table |
| **Frontend** | React + Context API, Axios interceptors, protected routes |
| **DevOps** | AWS SAM, Infrastructure as Code, arm64 Lambda |

---

Good luck with your interview! 🚀
