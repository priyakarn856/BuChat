import { useState, useEffect, useCallback } from 'react';
import EncryptionVerification from '../utils/encryptionVerification';

/**
 * Hook for managing encryption verification
 * Handles security code generation, verification status, and updates
 */
export const useEncryptionVerification = (
  conversationId,
  currentUserPublicKey,
  otherUserPublicKey
) => {
  const [securityCode, setSecurityCode] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Generate security code on mount
  useEffect(() => {
    const generateCode = async () => {
      try {
        setLoading(true);
        if (!currentUserPublicKey || !otherUserPublicKey) {
          setError('Missing public keys');
          return;
        }

        const code = await EncryptionVerification.generateSecurityCode(
          currentUserPublicKey,
          otherUserPublicKey
        );
        
        setSecurityCode(code);
        setFingerprint(EncryptionVerification.generateFingerprint(code));
        checkVerificationStatus();
      } catch (err) {
        setError(err.message);
        console.error('Error generating security code:', err);
      } finally {
        setLoading(false);
      }
    };

    generateCode();
  }, [currentUserPublicKey, otherUserPublicKey, conversationId]);

  const checkVerificationStatus = useCallback(() => {
    const verified = EncryptionVerification.isVerified(conversationId);
    setIsVerified(verified);
  }, [conversationId]);

  const markAsVerified = useCallback(() => {
    EncryptionVerification.setVerificationStatus(conversationId, true);
    setIsVerified(true);
  }, [conversationId]);

  const unverify = useCallback(() => {
    EncryptionVerification.setVerificationStatus(conversationId, false);
    setIsVerified(false);
  }, [conversationId]);

  const getBadgeInfo = useCallback(() => {
    return EncryptionVerification.getBadgeInfo(isVerified);
  }, [isVerified]);

  const getStatusMessage = useCallback(() => {
    return EncryptionVerification.getStatusMessage(isVerified);
  }, [isVerified]);

  const compareSecurityCodes = useCallback((otherCode) => {
    return EncryptionVerification.compareSecurityCodes(securityCode, otherCode);
  }, [securityCode]);

  return {
    // State
    securityCode,
    fingerprint,
    isVerified,
    loading,
    error,

    // Methods
    markAsVerified,
    unverify,
    checkVerificationStatus,
    getBadgeInfo,
    getStatusMessage,
    compareSecurityCodes,

    // Utilities
    encryptionType: EncryptionVerification.getEncryptionType(),
  };
};

export default useEncryptionVerification;
