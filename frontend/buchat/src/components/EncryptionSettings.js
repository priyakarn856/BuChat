import React, { useState, useEffect } from 'react';
import EncryptionDebug from '../utils/encryptionDebug';

const EncryptionSettings = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = () => {
    const encStatus = EncryptionDebug.getStatus();
    setStatus(encStatus);
  };

  const handleReset = async () => {
    if (!window.confirm(
      '⚠️ This will reset all encryption keys.\n\n' +
      '• Old messages will show "Unable to decrypt"\n' +
      '• You will need to send new messages\n' +
      '• This cannot be undone\n\n' +
      'Continue?'
    )) return;

    setLoading(true);
    try {
      await EncryptionDebug.resetEncryption();
      loadStatus();
      alert('✅ Encryption reset successfully!\n\nPlease send a new message to establish a new session.');
    } catch (error) {
      alert('❌ Reset failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!status) return null;

  return (
    <div style={{
      padding: '20px',
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '12px',
      marginTop: '20px'
    }}>
      <h3 style={{ marginBottom: '15px' }}>🔐 Encryption Status</h3>
      
      <div style={{ marginBottom: '15px', fontSize: '14px' }}>
        <div style={{ marginBottom: '8px' }}>
          <strong>Initialized:</strong> {status.initialized ? '✅ Yes' : '❌ No'}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Active Sessions:</strong> {status.sessions}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Pre-Keys:</strong> {status.preKeys}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Storage:</strong> {status.storage.identity && status.storage.sessions ? '✅ OK' : '⚠️ Missing'}
        </div>
      </div>

      {!status.initialized && (
        <div style={{
          padding: '10px',
          background: 'rgba(255, 193, 7, 0.1)',
          borderRadius: '8px',
          marginBottom: '15px',
          fontSize: '13px'
        }}>
          ⚠️ Encryption not initialized. Please refresh the page.
        </div>
      )}

      {status.sessions === 0 && status.initialized && (
        <div style={{
          padding: '10px',
          background: 'rgba(33, 150, 243, 0.1)',
          borderRadius: '8px',
          marginBottom: '15px',
          fontSize: '13px'
        }}>
          ℹ️ No active sessions. Send a message to establish a session.
        </div>
      )}

      <button
        onClick={handleReset}
        disabled={loading}
        style={{
          padding: '10px 20px',
          background: loading ? '#666' : '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
      >
        {loading ? '⏳ Resetting...' : '🔄 Reset Encryption'}
      </button>

      <div style={{
        marginTop: '15px',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.6)'
      }}>
        <strong>Note:</strong> Only reset if you're experiencing decryption issues.
        Old messages will not be recoverable after reset.
      </div>
    </div>
  );
};

export default EncryptionSettings;
