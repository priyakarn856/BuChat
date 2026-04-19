import React from 'react';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import './EncryptionBadge.css';

/**
 * Encryption Badge Component
 * Displays encryption status (verified/unverified)
 */
const EncryptionBadge = ({ 
  isVerified = false,
  conversationId,
  onClickVerify,
  size = 'small', // 'small' | 'medium' | 'large'
  variant = 'inline', // 'inline' | 'badge' | 'tooltip'
  animated = true
}) => {
  if (variant === 'inline') {
    return (
      <button 
        className={`encryption-badge inline ${size} ${animated ? 'animated' : ''} ${isVerified ? 'verified' : 'unverified'}`}
        onClick={onClickVerify}
        title={isVerified ? 'Encryption verified' : 'Encryption not verified - Click to verify'}
      >
        {isVerified ? (
          <>
            <CheckCircle2 size={size === 'small' ? 14 : 16} />
            <span>Verified</span>
          </>
        ) : (
          <>
            <Lock size={size === 'small' ? 14 : 16} />
            <span>Encrypted</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'badge') {
    return (
      <div 
        className={`encryption-badge badge ${size} ${isVerified ? 'verified' : 'unverified'}`}
        onClick={onClickVerify}
        style={{ cursor: onClickVerify ? 'pointer' : 'default' }}
      >
        {isVerified ? <CheckCircle2 size={12} /> : <Lock size={12} />}
      </div>
    );
  }

  if (variant === 'tooltip') {
    return (
      <div 
        className={`encryption-badge tooltip ${size} ${isVerified ? 'verified' : 'unverified'}`}
        onClick={onClickVerify}
      >
        <div className="tooltip-trigger">
          {isVerified ? <CheckCircle2 size={16} /> : <Lock size={16} />}
        </div>
        <div className="tooltip-content">
          <div className="tooltip-title">
            {isVerified ? 'Verified Encryption' : 'Unverified Encryption'}
          </div>
          <div className="tooltip-text">
            {isVerified 
              ? 'You have verified this conversation is secure'
              : 'Click to verify encryption with this contact'
            }
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default EncryptionBadge;
