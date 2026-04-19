/**
 * Security Utilities for BuChat Backend
 * - Input validation and sanitization
 * - Security headers
 * - Content Security Policy
 */

// Input validation patterns
const PATTERNS = {
  username: /^[a-zA-Z0-9_]{3,30}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  password: /^.{8,128}$/,  // Min 8 chars, max 128
  phone: /^\+?[1-9]\d{1,14}$/,
  url: /^https?:\/\/[\S]+$/,
  safeString: /^[\w\s\-.,!?'"@#$%&*()+=:;[\]{}|/<>~`]+$/,
};

// HTML entity encoding
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'`=/]/g, char => HTML_ENTITIES[char]);
}

/**
 * Sanitize a string by removing control characters and trimming
 */
function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') return '';
  // Remove control characters except newlines and tabs
  let clean = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Trim whitespace
  clean = clean.trim();
  // Enforce max length
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength);
  }
  return clean;
}

/**
 * Validate input against known patterns
 */
function validateInput(value, type) {
  if (value === undefined || value === null) return false;
  const pattern = PATTERNS[type];
  if (!pattern) return true; // Unknown type, allow
  return pattern.test(String(value));
}

/**
 * Validate and sanitize user registration data
 */
function validateRegistration(data) {
  const errors = [];
  
  if (!data.username || !validateInput(data.username, 'username')) {
    errors.push('Username must be 3-30 characters, alphanumeric with underscores only');
  }
  
  if (!data.email || !validateInput(data.email, 'email')) {
    errors.push('Invalid email address');
  }
  
  if (!data.password || !validateInput(data.password, 'password')) {
    errors.push('Password must be 8-128 characters');
  }
  
  // Check password strength
  if (data.password) {
    const hasLower = /[a-z]/.test(data.password);
    const hasUpper = /[A-Z]/.test(data.password);
    const hasNumber = /[0-9]/.test(data.password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(data.password);
    
    if (!(hasLower && hasUpper && hasNumber) && !hasSpecial) {
      errors.push('Password must contain uppercase, lowercase, number, or special character');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate post/comment content
 */
function validateContent(content, maxLength = 10000) {
  const errors = [];
  
  if (!content || typeof content !== 'string') {
    errors.push('Content is required');
  } else {
    if (content.trim().length === 0) {
      errors.push('Content cannot be empty');
    }
    if (content.length > maxLength) {
      errors.push(`Content exceeds maximum length of ${maxLength} characters`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: sanitizeString(content, maxLength)
  };
}

/**
 * Get enhanced security headers
 */
function getSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.amazonaws.com wss://*.amazonaws.com; frame-ancestors 'none'"
  };
}

/**
 * Validate file upload
 */
function validateFileUpload(file) {
  const errors = [];
  
  const ALLOWED_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };
  
  const MAX_SIZES = {
    image: 10 * 1024 * 1024,    // 10MB
    video: 500 * 1024 * 1024,   // 500MB
    audio: 50 * 1024 * 1024,    // 50MB
    document: 20 * 1024 * 1024  // 20MB
  };
  
  // Determine file type category
  let category = 'document';
  for (const [cat, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(file.contentType)) {
      category = cat;
      break;
    }
  }
  
  // Check content type
  const allAllowedTypes = Object.values(ALLOWED_TYPES).flat();
  if (!allAllowedTypes.includes(file.contentType)) {
    errors.push(`File type ${file.contentType} is not allowed`);
  }
  
  // Check file size
  if (file.size > MAX_SIZES[category]) {
    errors.push(`File size exceeds maximum of ${MAX_SIZES[category] / (1024 * 1024)}MB for ${category}`);
  }
  
  // Check filename for path traversal
  if (file.filename && (file.filename.includes('..') || file.filename.includes('/'))) {
    errors.push('Invalid filename');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    category
  };
}

/**
 * Rate limit check (for DynamoDB-based rate limiting)
 * Note: This should be used sparingly as it adds DynamoDB calls
 */
async function checkRateLimit(ddb, table, key, maxRequests, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  
  try {
    // Get current count from DynamoDB
    const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
    
    const result = await ddb.send(new GetCommand({
      TableName: table,
      Key: { PK: `RATELIMIT#${key}`, SK: 'COUNT' }
    }));
    
    const item = result.Item;
    
    // Reset if window expired
    if (!item || item.windowStart < windowStart) {
      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `RATELIMIT#${key}`, SK: 'COUNT' },
        UpdateExpression: 'SET windowStart = :ws, requestCount = :rc, #ttl = :ttl',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':ws': now,
          ':rc': 1,
          ':ttl': now + windowSeconds + 60  // TTL for cleanup
        }
      }));
      return { allowed: true, remaining: maxRequests - 1 };
    }
    
    // Check if over limit
    if (item.requestCount >= maxRequests) {
      return { allowed: false, remaining: 0, retryAfter: windowStart + windowSeconds - now };
    }
    
    // Increment count
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { PK: `RATELIMIT#${key}`, SK: 'COUNT' },
      UpdateExpression: 'SET requestCount = requestCount + :inc',
      ExpressionAttributeValues: { ':inc': 1 }
    }));
    
    return { allowed: true, remaining: maxRequests - item.requestCount - 1 };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if rate limiting fails
    return { allowed: true, remaining: maxRequests };
  }
}

/**
 * Validate JWT token structure (without verifying signature)
 * Use for quick pre-validation before expensive verification
 */
function validateJwtStructure(token) {
  if (!token || typeof token !== 'string') return false;
  
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  try {
    // Check if parts are valid base64
    for (const part of parts) {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) return false;
    }
    
    // Try to decode payload
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Check expiration if present
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  escapeHtml,
  sanitizeString,
  validateInput,
  validateRegistration,
  validateContent,
  getSecurityHeaders,
  validateFileUpload,
  checkRateLimit,
  validateJwtStructure,
  PATTERNS
};
