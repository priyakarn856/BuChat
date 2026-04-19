import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import './MessageStatus.css';

/**
 * MessageStatus - WhatsApp-style message status indicators
 * 
 * Status flow:
 * - sending: Clock icon (gray) - Message is being sent
 * - sent: Single check (gray) - Message reached server
 * - delivered: Double check (gray) - Message delivered to recipient's device
 * - read: Double check (blue) - Message was read by recipient
 * - failed: Alert icon (red) - Message failed to send
 */
const MessageStatus = ({ 
  status, 
  readAt, 
  deliveredAt, 
  sentAt,
  size = 14,
  showTimestamp = false 
}) => {
  const getStatusInfo = () => {
    // Priority: read > delivered > sent > sending
    if (readAt) {
      return {
        icon: CheckCheck,
        className: 'status-read',
        label: 'Read',
        timestamp: readAt
      };
    }
    
    if (deliveredAt || status === 'delivered') {
      return {
        icon: CheckCheck,
        className: 'status-delivered',
        label: 'Delivered',
        timestamp: deliveredAt
      };
    }
    
    if (status === 'sent' || sentAt) {
      return {
        icon: Check,
        className: 'status-sent',
        label: 'Sent',
        timestamp: sentAt
      };
    }
    
    if (status === 'sending') {
      return {
        icon: Clock,
        className: 'status-sending',
        label: 'Sending',
        timestamp: null
      };
    }
    
    if (status === 'failed') {
      return {
        icon: AlertCircle,
        className: 'status-failed',
        label: 'Failed',
        timestamp: null
      };
    }
    
    // Default: pending/sending
    return {
      icon: Clock,
      className: 'status-sending',
      label: 'Sending',
      timestamp: null
    };
  };

  const { icon: Icon, className, label, timestamp } = getStatusInfo();

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <span className={`message-status ${className}`} title={label}>
      <Icon size={size} />
      {showTimestamp && timestamp && (
        <span className="status-timestamp">{formatTime(timestamp)}</span>
      )}
    </span>
  );
};

/**
 * MessageStatusInline - Compact inline version for message bubbles
 */
export const MessageStatusInline = ({ 
  isSender, 
  status, 
  readAt, 
  deliveredAt 
}) => {
  if (!isSender) return null;
  
  return (
    <MessageStatus 
      status={status} 
      readAt={readAt} 
      deliveredAt={deliveredAt}
      size={14}
    />
  );
};

/**
 * OnlineStatus - User online/offline indicator
 */
export const OnlineStatus = ({ 
  isOnline, 
  lastSeen, 
  showText = false,
  size = 'small' 
}) => {
  const sizeMap = {
    small: 8,
    medium: 10,
    large: 12
  };
  
  const dotSize = sizeMap[size] || sizeMap.small;

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Offline';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <span className={`online-status ${isOnline ? 'online' : 'offline'}`}>
      <span 
        className="online-status-dot"
        style={{ width: dotSize, height: dotSize }}
      />
      {showText && (
        <span className="online-status-text">
          {isOnline ? 'Online' : formatLastSeen(lastSeen)}
        </span>
      )}
    </span>
  );
};

/**
 * TypingIndicator - Shows when someone is typing
 */
export const TypingIndicator = ({ userName }) => {
  return (
    <div className="typing-indicator">
      <span className="typing-text">
        {userName ? `${userName} is typing` : 'typing'}
      </span>
      <span className="typing-dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  );
};

export default MessageStatus;
