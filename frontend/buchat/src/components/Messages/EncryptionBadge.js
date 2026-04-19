import React from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import './EncryptionBadge.css';

const EncryptionBadge = ({ variant = 'header' }) => {
  if (variant === 'header') {
    return (
      <div className="encryption-badge-header" title="End-to-end encrypted">
        <Lock size={12} />
        <span>Encrypted</span>
      </div>
    );
  }

  if (variant === 'message') {
    return (
      <Lock size={10} className="encryption-icon-message" title="End-to-end encrypted" />
    );
  }

  if (variant === 'banner') {
    return (
      <div className="encryption-banner">
        <ShieldCheck size={16} />
        <span>Messages are end-to-end encrypted. Only you and the recipient can read them.</span>
      </div>
    );
  }

  return null;
};

export default EncryptionBadge;
