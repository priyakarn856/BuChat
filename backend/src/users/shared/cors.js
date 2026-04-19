// Standardized CORS configuration for all Lambda functions
// IMPORTANT: Must match API Gateway CORS settings

const allowedOrigins = [
  'https://buchat.me',
  'https://www.buchat.me',
  'http://localhost:3000',
  'http://localhost:3001'
];

const getCorsHeaders = (event) => {
  const requestOrigin = getHeaderCaseInsensitive(event.headers, 'origin');
  let allowOrigin = '*';
  let allowCredentials = 'false';
  
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
    allowCredentials = 'true';
  }
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,Accept',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': allowCredentials,
    'Access-Control-Max-Age': '86400'
  };
};

/**
 * Get header value case-insensitively
 * @param {Object} headers - Headers object
 * @param {string} headerName - Header name to find
 * @returns {string|null} - Header value or null
 */
const getHeaderCaseInsensitive = (headers, headerName) => {
  if (!headers) return null;
  const lowerHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerHeaderName) {
      return value;
    }
  }
  return null;
};

/**
 * Handle OPTIONS preflight requests
 * @param {Object} event - Lambda event object
 * @returns {Object} - Standardized OPTIONS response
 */
const handlePreflight = (event) => {
  if (event.requestContext?.httpMethod === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  return null;
};

/**
 * Create response with CORS headers
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @param {Object} additionalHeaders - Additional headers to include
 * @returns {Object} - Lambda response with CORS headers
 */
 const createResponse = (event, statusCode, body, additionalHeaders = {}) => {
   return {
     statusCode,
     headers: {
       ...getCorsHeaders(event),
       ...additionalHeaders
     },
     body: typeof body === 'string' ? body : JSON.stringify(body)
   };
 };

module.exports = {
  getCorsHeaders,
  getHeaderCaseInsensitive,
  handlePreflight,
  createResponse
};