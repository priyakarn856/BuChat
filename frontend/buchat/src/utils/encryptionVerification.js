/**
 * Encryption Verification System
 * WhatsApp/Telegram-style security code generation and verification
 */

class EncryptionVerification {
  /**
   * Generate a security code from two public keys (similar to WhatsApp's Safety Number)
   * @param {string} userPublicKey - Current user's public key (JWK)
   * @param {string} otherPublicKey - Other user's public key (JWK)
   * @returns {string} - Human-readable security code
   */
  static generateSecurityCode(userPublicKey, otherPublicKey) {
    try {
      // Combine and hash both keys
      const combined = userPublicKey + otherPublicKey;
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      
      return crypto.subtle.digest('SHA-256', data).then((hash) => {
        // Convert to hex and take first 20 chars for 40-digit code
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Format as pairs: 12 34 56 78 90...
        return hashHex.substring(0, 40)
          .match(/.{1,2}/g)
          .join(' ')
          .toUpperCase();
      });
    } catch (error) {
      console.error('Error generating security code:', error);
      return null;
    }
  }

  /**
   * Generate QR code data from security code
   * @param {string} securityCode - The security code
   * @param {string} userId - Current user ID
   * @param {string} otherUserId - Other user ID
   * @returns {string} - QR code data string
   */
  static generateQRCodeData(securityCode, userId, otherUserId) {
    return `BUCHAT:VERIFY|${userId}|${otherUserId}|${securityCode}`;
  }

  /**
   * Generate fingerprint (short version for quick verification)
   * @param {string} securityCode - The full security code
   * @returns {string} - Shortened fingerprint (8 chars)
   */
  static generateFingerprint(securityCode) {
    if (!securityCode) return '';
    // Take every 5th character from security code for fingerprint
    return securityCode.replace(/\s/g, '')
      .split('')
      .filter((_, i) => i % 5 === 0)
      .join('')
      .substring(0, 8);
  }

  /**
   * Store verification status
   * @param {string} conversationId - Conversation ID
   * @param {boolean} verified - Is verified
   */
  static setVerificationStatus(conversationId, verified) {
    const verifications = JSON.parse(
      localStorage.getItem('encryption_verifications') || '{}'
    );
    verifications[conversationId] = {
      verified,
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    };
    localStorage.setItem('encryption_verifications', JSON.stringify(verifications));
  }

  /**
   * Get verification status
   * @param {string} conversationId - Conversation ID
   * @returns {object} - Verification data
   */
  static getVerificationStatus(conversationId) {
    const verifications = JSON.parse(
      localStorage.getItem('encryption_verifications') || '{}'
    );
    return verifications[conversationId] || { verified: false, timestamp: null };
  }

  /**
   * Check if encryption is verified
   * @param {string} conversationId - Conversation ID
   * @returns {boolean}
   */
  static isVerified(conversationId) {
    const status = this.getVerificationStatus(conversationId);
    return status.verified === true;
  }

  /**
   * Get encryption status message
   * @param {boolean} isVerified - Is the encryption verified
   * @returns {string} - Status message
   */
  static getStatusMessage(isVerified) {
    if (isVerified) {
      return 'Messages are encrypted and verified';
    }
    return 'Messages are encrypted (unverified)';
  }

  /**
   * Generate verification comparison data
   * @param {string} localSecurityCode - Local security code
   * @param {string} remoteSecurityCode - Remote user's security code
   * @returns {boolean} - Do they match
   */
  static compareSecurityCodes(localSecurityCode, remoteSecurityCode) {
    if (!localSecurityCode || !remoteSecurityCode) return false;
    // Remove spaces for comparison
    const local = localSecurityCode.replace(/\s/g, '');
    const remote = remoteSecurityCode.replace(/\s/g, '');
    return local === remote;
  }

  /**
   * Get encryption type string
   * @returns {string}
   */
  static getEncryptionType() {
    return 'E2E - ECDH + AES-256-GCM';
  }

  /**
   * Get encryption badge info
   * @param {boolean} isVerified - Is verified
   * @returns {object}
   */
  static getBadgeInfo(isVerified) {
    if (isVerified) {
      return {
        icon: '✓', // or use an icon component
        color: '#22c55e',
        text: 'Verified',
        title: 'End-to-End Encryption Verified'
      };
    }
    return {
      icon: '🔒',
      color: '#f59e0b',
      text: 'Encrypted',
      title: 'End-to-End Encryption (Not Verified)'
    };
  }
}

export default EncryptionVerification;
