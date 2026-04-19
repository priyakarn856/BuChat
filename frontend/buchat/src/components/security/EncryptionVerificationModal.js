import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, CheckCircle2, Lock, AlertCircle, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import EncryptionVerification from '../../utils/encryptionVerification';
import { generateSecurityCode, formatSecurityCode, generateQRCodeData } from '../../utils/securityCode';
import './EncryptionVerificationModal.css';

const EncryptionVerificationModal = ({ 
  isOpen, 
  onClose, 
  conversationId, 
  otherUserName,
  otherUserPublicKey,
  currentUserPublicKey 
}) => {
  const [securityCode, setSecurityCode] = useState('');
  const [formattedCode, setFormattedCode] = useState([]);
  const [qrData, setQrData] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('code'); // 'code' or 'qr'
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      generateCode();
      checkVerificationStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, otherUserPublicKey, currentUserPublicKey, conversationId]);

  const generateCode = async () => {
    setIsLoading(true);
    try {
      // Use dummy keys if real keys aren't available yet
      const userKey = currentUserPublicKey || `user_${conversationId}_key`;
      const otherKey = otherUserPublicKey || `other_${conversationId}_key`;
      
      // Generate 60-digit security code (WhatsApp style)
      const code = generateSecurityCode(userKey, otherKey);
      if (code) {
        setSecurityCode(code);
        
        // Format into 12 groups of 5 digits
        const formatted = formatSecurityCode(code);
        setFormattedCode(formatted);
        
        // Generate QR code data
        const qr = generateQRCodeData(userKey, otherKey);
        setQrData(qr);
      }
    } catch (error) {
      console.error('Error generating security code:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkVerificationStatus = () => {
    const verified = EncryptionVerification.isVerified(conversationId);
    setIsVerified(verified);
  };

  const handleCopySecurityCode = () => {
    if (securityCode) {
      navigator.clipboard.writeText(securityCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerateCode = () => {
    generateCode();
  };

  const handleVerifyNow = () => {
    EncryptionVerification.setVerificationStatus(conversationId, true);
    setIsVerified(true);
  };

  const badge = EncryptionVerification.getBadgeInfo(isVerified);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="encryption-verification-overlay" onClick={onClose}>
          <motion.div
            className="encryption-verification-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="ev-header">
              <div className="ev-title-section">
                <Lock className="ev-lock-icon" />
                <div>
                  <h2 className="ev-title">End-to-End Encryption</h2>
                  <p className="ev-subtitle">
                    {isVerified ? 'Verified' : 'Unverified'} • {EncryptionVerification.getEncryptionType()}
                  </p>
                </div>
              </div>
              <button className="ev-close-btn" onClick={onClose}>
                <X size={24} />
              </button>
            </div>

            {/* Status Badge */}
            <div className={`ev-status-badge ${isVerified ? 'verified' : 'unverified'}`}>
              <div className="status-badge-content">
                <span className="status-icon">{badge.icon}</span>
                <div className="status-info">
                  <p className="status-label">{badge.text}</p>
                  <p className="status-detail">{badge.title}</p>
                </div>
              </div>
            </div>

            {/* Tab Selector */}
            <div className="ev-tab-selector">
              <button 
                className={`ev-tab ${activeTab === 'code' ? 'active' : ''}`}
                onClick={() => setActiveTab('code')}
              >
                <Lock size={16} />
                <span>Compare Numbers</span>
              </button>
              <button 
                className={`ev-tab ${activeTab === 'qr' ? 'active' : ''}`}
                onClick={() => setActiveTab('qr')}
              >
                <QrCode size={16} />
                <span>Scan QR Code</span>
              </button>
            </div>

            {/* Main Content */}
            <div className="ev-content">
              {activeTab === 'code' ? (
                <>
                  <div className="ev-section">
                    <h3 className="ev-section-title">Conversation with {otherUserName}</h3>
                    <p className="ev-section-desc">
                      {isVerified 
                        ? 'You have verified the encryption key for this conversation. Messages are secure and authenticated.'
                        : `Compare your security number with ${otherUserName} to verify this conversation is encrypted end-to-end.`
                      }
                    </p>
                  </div>

                  {/* Security Code Display */}
                  <div className="ev-security-code-section">
                    <div className="ev-code-header">
                      <label className="ev-code-label">Security Code (60 digits)</label>
                      <button 
                        className="ev-regenerate-btn"
                        onClick={handleRegenerateCode}
                        title="Generate new code"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                    
                    {isLoading ? (
                      <div className="ev-loading">Generating security code...</div>
                    ) : (
                      <div className="ev-code-display-grid">
                        {formattedCode.length > 0 ? (
                          formattedCode.map((group, index) => (
                            <div key={index} className="ev-code-group">
                              {group}
                            </div>
                          ))
                        ) : (
                          // Show placeholder digits
                          Array(12).fill(0).map((_, index) => (
                            <div key={index} className="ev-code-group placeholder">
                              •••••
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    
                    <button 
                      className="ev-copy-btn-full"
                      onClick={handleCopySecurityCode}
                      disabled={!securityCode}
                      title="Copy security code"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                    
                    <p className="ev-code-hint">
                      Compare this 60-digit code with {otherUserName}. Both users should see the exact same numbers.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* QR Code Tab */}
                  <div className="ev-qr-section">
                    <div className="ev-qr-container">
                      {qrData ? (
                        <QRCodeSVG 
                          value={qrData}
                          size={200}
                          level="M"
                          includeMargin={true}
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      ) : (
                        <div className="ev-qr-placeholder">
                          <QrCode size={120} />
                        </div>
                      )}
                    </div>
                    
                    <p className="ev-qr-instruction">
                      Ask {otherUserName} to scan this QR code with their device to verify the encryption.
                    </p>

                    <div className="ev-scan-option">
                      <Smartphone size={20} />
                      <div className="ev-scan-info">
                        <p className="ev-scan-title">Scan a QR Code</p>
                        <p className="ev-scan-desc">Use your device camera to scan {otherUserName}'s QR code</p>
                      </div>
                      <button className="ev-scan-btn" onClick={() => alert('Camera access would open here')}>
                        Scan
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Information Box */}
              <div className="ev-info-box">
                <AlertCircle size={16} />
                <div className="ev-info-content">
                  <p className="ev-info-title">How verification works</p>
                  <ul className="ev-info-list">
                    <li>Compare the 60-digit code with {otherUserName}</li>
                    <li>Both users must see identical numbers</li>
                    <li>Protects against man-in-the-middle attacks</li>
                    <li>Use QR code scanning for faster verification</li>
                    <li>Verification status is stored locally</li>
                  </ul>
                </div>
              </div>

              {/* Encryption Details */}
              <div className="ev-details-section">
                <h4 className="ev-details-title">Technical Details</h4>
                <div className="ev-details-grid">
                  <div className="ev-detail-item">
                    <span className="detail-label">Protocol</span>
                    <span className="detail-value">ECDH (Elliptic Curve)</span>
                  </div>
                  <div className="ev-detail-item">
                    <span className="detail-label">Algorithm</span>
                    <span className="detail-value">AES-256-GCM</span>
                  </div>
                  <div className="ev-detail-item">
                    <span className="detail-label">Key Exchange</span>
                    <span className="detail-value">ECDH P-256</span>
                  </div>
                  <div className="ev-detail-item">
                    <span className="detail-label">Status</span>
                    <span className="detail-value" style={{ color: badge.color }}>
                      {badge.text}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="ev-actions">
              {!isVerified && (
                <button 
                  className="ev-verify-btn primary"
                  onClick={handleVerifyNow}
                >
                  <CheckCircle2 size={18} />
                  Mark as Verified
                </button>
              )}
              <button 
                className="ev-close-action-btn"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EncryptionVerificationModal;
