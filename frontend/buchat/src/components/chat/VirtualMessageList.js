/**
 * Virtual Message List
 * Optimized for rendering thousands of messages efficiently
 * Uses windowing to only render visible messages
 */
import React, { useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { motion, AnimatePresence } from 'framer-motion';
import { debounce } from '../utils/performance';

// Individual message component - memoized for performance
const MessageItem = memo(({ 
  message, 
  isOwn, 
  showAvatar, 
  showDate,
  onReply,
  onReact,
  onForward,
  onDelete,
  onStar,
  onPin,
  isStarred,
  isPinned
}) => {
  return (
    <motion.div
      className={`message-wrapper ${isOwn ? 'own' : 'other'}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      layout
    >
      {showDate && (
        <div className="message-date-divider">
          <span>{message.formattedDate}</span>
        </div>
      )}
      
      <div className={`message-bubble ${isOwn ? 'sent' : 'received'}`}>
        {!isOwn && showAvatar && (
          <div className="message-avatar">
            {message.senderAvatar ? (
              <img src={message.senderAvatar} alt="" loading="lazy" />
            ) : (
              <div className="avatar-placeholder">
                {message.senderName?.[0] || '?'}
              </div>
            )}
          </div>
        )}
        
        <div className="message-content">
          {!isOwn && showAvatar && (
            <span className="sender-name">{message.senderName}</span>
          )}
          
          {/* Message indicators */}
          {(isStarred || isPinned) && (
            <div className="message-indicators">
              {isStarred && <span className="star-indicator">⭐</span>}
              {isPinned && <span className="pin-indicator">📌</span>}
            </div>
          )}
          
          {/* Reply preview */}
          {message.replyTo && (
            <div className="reply-preview">
              <span className="reply-to-name">{message.replyTo.senderName}</span>
              <span className="reply-to-text">{message.replyTo.preview}</span>
            </div>
          )}
          
          {/* Message text */}
          {message.decryptedContent && (
            <p className="message-text">{message.decryptedContent}</p>
          )}
          
          {/* Media attachments */}
          {message.mediaUrl && (
            <div className="message-media">
              {message.mediaType?.startsWith('image/') && (
                <img 
                  src={message.mediaUrl} 
                  alt="" 
                  loading="lazy"
                  onClick={() => window.open(message.mediaUrl, '_blank')}
                />
              )}
              {message.mediaType?.startsWith('video/') && (
                <video 
                  src={message.mediaUrl} 
                  controls 
                  preload="metadata"
                />
              )}
            </div>
          )}
          
          {/* Message metadata */}
          <div className="message-meta">
            <span className="message-time">{message.formattedTime}</span>
            {isOwn && (
              <span className={`message-status ${message.status}`}>
                {message.status === 'sent' && '✓'}
                {message.status === 'delivered' && '✓✓'}
                {message.status === 'read' && <span className="read-ticks">✓✓</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memoization
  return (
    prevProps.message.messageId === nextProps.message.messageId &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.decryptedContent === nextProps.message.decryptedContent &&
    prevProps.isStarred === nextProps.isStarred &&
    prevProps.isPinned === nextProps.isPinned &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.showDate === nextProps.showDate
  );
});

MessageItem.displayName = 'MessageItem';

// Typing indicator component
const TypingIndicator = memo(({ typingUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;
  
  const text = typingUsers.length === 1
    ? `${typingUsers[0].name} is typing...`
    : typingUsers.length === 2
      ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
      : `${typingUsers.length} people are typing...`;
  
  return (
    <motion.div 
      className="typing-indicator"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
    >
      <div className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span>{text}</span>
    </motion.div>
  );
});

TypingIndicator.displayName = 'TypingIndicator';

// Main Virtual Message List component
const VirtualMessageList = ({
  messages = [],
  currentUserId,
  typingUsers = [],
  starredMessageIds = [],
  pinnedMessageIds = [],
  onLoadMore,
  onReply,
  onReact,
  onForward,
  onDelete,
  onStar,
  onPin,
  hasMore = false,
  isLoadingMore = false
}) => {
  const virtuosoRef = useRef(null);
  const prevMessagesLengthRef = useRef(messages.length);
  
  // Memoized starred/pinned sets for O(1) lookup
  const starredSet = useMemo(() => new Set(starredMessageIds), [starredMessageIds]);
  const pinnedSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  
  // Process messages to add grouping info
  const processedMessages = useMemo(() => {
    return messages.map((msg, index) => {
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
      
      // Show date divider if day changes
      const currentDate = new Date(msg.createdAt).toDateString();
      const prevDate = prevMsg ? new Date(prevMsg.createdAt).toDateString() : null;
      const showDate = currentDate !== prevDate;
      
      // Show avatar if sender changes or after gap
      const showAvatar = !prevMsg || 
        prevMsg.senderId !== msg.senderId || 
        showDate ||
        (new Date(msg.createdAt) - new Date(prevMsg.createdAt)) > 300000; // 5 min gap
      
      return {
        ...msg,
        showDate,
        showAvatar,
        formattedDate: formatDate(msg.createdAt),
        formattedTime: formatTime(msg.createdAt)
      };
    });
  }, [messages]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const newMessages = messages.length - prevMessagesLengthRef.current;
      
      // Only auto-scroll if at bottom or it's user's own message
      if (newMessages <= 3 || messages[messages.length - 1]?.senderId === currentUserId) {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth'
        });
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, currentUserId, messages]);
  
  // Load more handler (debounced)
  const handleStartReached = useCallback(
    debounce(() => {
      if (hasMore && !isLoadingMore && onLoadMore) {
        onLoadMore();
      }
    }, 200),
    [hasMore, isLoadingMore, onLoadMore]
  );
  
  // Render individual message
  const renderMessage = useCallback((index) => {
    const message = processedMessages[index];
    if (!message) return null;
    
    const isOwn = message.senderId === currentUserId;
    
    return (
      <MessageItem
        key={message.messageId}
        message={message}
        isOwn={isOwn}
        showAvatar={message.showAvatar}
        showDate={message.showDate}
        onReply={() => onReply?.(message)}
        onReact={(emoji) => onReact?.(message, emoji)}
        onForward={() => onForward?.(message)}
        onDelete={() => onDelete?.(message)}
        onStar={() => onStar?.(message)}
        onPin={() => onPin?.(message)}
        isStarred={starredSet.has(message.messageId)}
        isPinned={pinnedSet.has(message.messageId)}
      />
    );
  }, [processedMessages, currentUserId, starredSet, pinnedSet, onReply, onReact, onForward, onDelete, onStar, onPin]);
  
  // Header component (loading indicator)
  const Header = useCallback(() => {
    if (isLoadingMore) {
      return (
        <div className="loading-more">
          <div className="spinner"></div>
          <span>Loading earlier messages...</span>
        </div>
      );
    }
    return null;
  }, [isLoadingMore]);
  
  // Footer component (typing indicator)
  const Footer = useCallback(() => (
    <AnimatePresence>
      <TypingIndicator typingUsers={typingUsers} />
    </AnimatePresence>
  ), [typingUsers]);
  
  return (
    <div className="virtual-message-list">
      <Virtuoso
        ref={virtuosoRef}
        data={processedMessages}
        itemContent={renderMessage}
        startReached={handleStartReached}
        components={{
          Header,
          Footer
        }}
        increaseViewportBy={{ top: 500, bottom: 500 }}
        overscan={10}
        followOutput="smooth"
        alignToBottom
        atBottomThreshold={100}
        defaultItemHeight={80}
        computeItemKey={(index) => processedMessages[index]?.messageId || index}
      />
    </div>
  );
};

// Helper functions
function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export default memo(VirtualMessageList);
