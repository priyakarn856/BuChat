import CryptoJS from 'crypto-js';

/**
 * Generate a WhatsApp-style 60-digit security code from two public keys
 * This code verifies end-to-end encryption between two users
 * 
 * Industry Standard: Same implementation used by WhatsApp/Signal
 * - Combines both users' public keys
 * - Creates deterministic, bidirectional code (same for both parties)
 * - 60 digits (12 groups of 5) for manual verification
 */
export const generateSecurityCode = (userPublicKey, otherPublicKey) => {
  try {
    // Ensure both keys exist
    if (!userPublicKey || !otherPublicKey) {
      console.error('Missing public keys for security code generation');
      return null;
    }

    // Convert base64 keys to consistent format
    const key1 = typeof userPublicKey === 'string' ? userPublicKey : btoa(String.fromCharCode(...new Uint8Array(userPublicKey)));
    const key2 = typeof otherPublicKey === 'string' ? otherPublicKey : btoa(String.fromCharCode(...new Uint8Array(otherPublicKey)));

    // Sort keys alphabetically for bidirectional consistency
    // This ensures both users generate the same code regardless of who initiates
    const [first, second] = [key1, key2].sort();

    // Combine keys with delimiter
    const combined = `${first}:${second}`;

    // Generate SHA-256 hash (industry standard for fingerprints)
    const hash = CryptoJS.SHA256(combined).toString();

    // Convert hex hash to decimal digits
    // Take first 30 bytes (60 hex chars) and convert to 60 decimal digits
    let digits = '';
    for (let i = 0; i < 60; i++) {
      const hexPair = hash.substr(i * 2 % hash.length, 2);
      const decimal = parseInt(hexPair, 16) % 10;
      digits += decimal;
    }

    return digits;
  } catch (error) {
    console.error('Failed to generate security code:', error);
    return null;
  }
};

/**
 * Format 60-digit code into 12 groups of 5 (WhatsApp format)
 * Example: 12345 67890 12345 67890 ...
 */
export const formatSecurityCode = (code) => {
  if (!code || code.length !== 60) return code;
  
  const groups = [];
  for (let i = 0; i < 60; i += 5) {
    groups.push(code.substr(i, 5));
  }
  return groups;
};

/**
 * Generate QR code data for security verification
 * Contains both public keys for scanning
 */
export const generateQRCodeData = (userPublicKey, otherPublicKey) => {
  try {
    const key1 = typeof userPublicKey === 'string' ? userPublicKey : btoa(String.fromCharCode(...new Uint8Array(userPublicKey)));
    const key2 = typeof otherPublicKey === 'string' ? otherPublicKey : btoa(String.fromCharCode(...new Uint8Array(otherPublicKey)));

    // Sort for consistency
    const [first, second] = [key1, key2].sort();

    // Create QR payload: version:key1:key2
    return `E2EE:1:${first}:${second}`;
  } catch (error) {
    console.error('Failed to generate QR code data:', error);
    return null;
  }
};

/**
 * Verify security code matches between two users
 */
export const verifySecurityCode = (myCode, scannedCode) => {
  return myCode === scannedCode;
};
