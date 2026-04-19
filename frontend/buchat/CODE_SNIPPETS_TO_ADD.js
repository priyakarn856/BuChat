/**
 * COPY-PASTE CODE SNIPPETS FOR MessageInterface.js
 * Add these to complete the professional messaging features
 */

// ============================================
// 1. ADD THESE HELPER FUNCTIONS (after line 30)
// ============================================

const getDateSeparator = (timestamp) => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
};

const shouldShowDateSeparator = (currentMsg, previousMsg) => {
  if (!previousMsg) return true;
  const currentDate = new Date(currentMsg.createdAt).toDateString();
  const previousDate = new Date(previousMsg.createdAt).toDateString();
  return currentDate !== previousDate;
};

const groupReactionsByEmoji = (reactions) => {
  if (!reactions || !Array.isArray(reactions)) return {};
  return reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r.userId);
    return acc;
  }, {});
};

// ============================================
// 2. REPLACE handleAddReaction (around line 575)
// ============================================

const handleAddReaction = async (messageId, emoji) => {
  try {
    await messagingService.addReaction(messageId, emoji);
    // Update local message state
    setMessages(prev => prev.map(m => {
      if (m.messageId === messageId) {
        const reactions = m.reactions || [];
        const existing = reactions.find(r => r.userId === user.userId);
        if (existing) {
          existing.emoji = emoji;
          existing.timestamp = new Date().toISOString();
        } else {
          reactions.push({ 
            userId: user.userId, 
            emoji, 
            timestamp: new Date().toISOString() 
          });
        }
        return { ...m, reactions };
      }
      return m;
    }));
    setShowEmojiPicker(null);
    toast.success('Reaction added');
  } catch (error) {
    console.error('Add reaction error:', error);
    toast.error('Failed to add reaction');
  }
};

const handleToggleReaction = async (messageId, emoji) => {
  try {
    const message = messages.find(m => m.messageId === messageId);
    const myReaction = message?.reactions?.find(r => r.userId === user.userId);
    
    if (myReaction && myReaction.emoji === emoji) {
      // Remove reaction
      await messagingService.removeReaction(messageId);
      setMessages(prev => prev.map(m => {
        if (m.messageId === messageId) {
          return { 
            ...m, 
            reactions: (m.reactions || []).filter(r => r.userId !== user.userId) 
          };
        }
        return m;
      }));
      toast.success('Reaction removed');
    } else {
      // Add/change reaction
      await handleAddReaction(messageId, emoji);
    }
  } catch (error) {
    console.error('Toggle reaction error:', error);
    toast.error('Failed to toggle reaction');
  }
};

// ============================================
// 3. REPLACE handleStarMessage
// ============================================

const handleStarMessage = async (messageId) => {
  try {
    const isStarred = starredMessages.has(messageId);
    if (isStarred) {
      await messagingService.unstarMessage(messageId);
      setStarredMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      toast.success('Message unstarred');
    } else {
      await messagingService.starMessage(messageId);
      setStarredMessages(prev => new Set(prev).add(messageId));
      toast.success('Message starred');
    }
    setSelectedMessage(null);
  } catch (error) {
    console.error('Star message error:', error);
    toast.error('Failed to star message');
  }
};

// ============================================
// 4. REPLACE handlePinMessage
// ============================================

const handlePinMessage = async (messageId) => {
  try {
    const isPinned = pinnedMessages.has(messageId);
    if (isPinned) {
      await messagingService.unpinMessage(messageId, conversation?.conversationId);
      setPinnedMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      toast.success('Message unpinned');
    } else {
      await messagingService.pinMessage(messageId, conversation?.conversationId);
      setPinnedMessages(prev => new Set(prev).add(messageId));
      toast.success('Message pinned');
    }
    setSelectedMessage(null);
  } catch (error) {
    console.error('Pin message error:', error);
    toast.error('Failed to pin message');
  }
};

// ============================================
// 5. REPLACE handleReportMessage
// ============================================

const handleReportMessage = async (messageId) => {
  const reason = prompt('Please provide a reason for reporting this message:');
  if (!reason) return;
  
  try {
    await messagingService.reportMessage(messageId, reason, '');
    toast.success('Message reported. Thank you for helping keep our community safe.');
    setSelectedMessage(null);
  } catch (error) {
    console.error('Report message error:', error);
    toast.error('Failed to report message');
  }
};

// ============================================
// 6. ADD USEEFFECT TO LOAD STARRED/PINNED (after other useEffects)
// ============================================

// Load starred and pinned messages
useEffect(() => {
  const loadUserData = async () => {
    try {
      const [starred, pinned] = await Promise.all([
        messagingService.getStarredMessages(),
        conversation?.conversationId 
          ? messagingService.getPinnedMessages(conversation.conversationId)
          : Promise.resolve([])
      ]);
      
      setStarredMessages(new Set(starred.map(s => s.messageId)));
      setPinnedMessages(new Set(pinned.map(p => p.messageId)));
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };
  
  if (user?.userId) {
    loadUserData();
  }
}, [user?.userId, conversation?.conversationId]);

// ============================================
// 7. ADD WEBSOCKET HANDLERS FOR REAL-TIME UPDATES
// ============================================

// Real-time reaction updates
useEffect(() => {
  if (!isConnected || !conversation?.conversationId) return;

  const handleReactionUpdate = (data) => {
    if (data.conversationId === conversation.conversationId) {
      setMessages(prev => prev.map(m => 
        m.messageId === data.messageId 
          ? { ...m, reactions: data.reactions }
          : m
      ));
    }
  };

  const handleMessageStarred = (data) => {
    if (data.userId === user.userId) {
      if (data.action === 'star') {
        setStarredMessages(prev => new Set(prev).add(data.messageId));
      } else {
        setStarredMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.messageId);
          return newSet;
        });
      }
    }
  };

  const handleMessagePinned = (data) => {
    if (data.conversationId === conversation.conversationId) {
      if (data.action === 'pin') {
        setPinnedMessages(prev => new Set(prev).add(data.messageId));
      } else {
        setPinnedMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.messageId);
          return newSet;
        });
      }
    }
  };

  addListener('message_reaction', handleReactionUpdate);
  addListener('message_starred', handleMessageStarred);
  addListener('message_pinned', handleMessagePinned);

  return () => {
    removeListener('message_reaction', handleReactionUpdate);
    removeListener('message_starred', handleMessageStarred);
    removeListener('message_pinned', handleMessagePinned);
  };
}, [isConnected, conversation?.conversationId, user.userId, addListener, removeListener]);

// ============================================
// 8. UPDATE MESSAGE RENDERING TO ADD DATE SEPARATORS AND REACTIONS
// ============================================

// FIND the messages.map section (around line 1350) and wrap with:
{messages
  .filter(msg => {
    if (!conversationSearchQuery) return true;
    const content = msg.decryptedContent || msg.content || '';
    return content.toLowerCase().includes(conversationSearchQuery.toLowerCase());
  })
  .map((msg, idx) => {
    const isMe = msg.senderId === user.userId;
    const content = msg.decryptedContent || msg.content;
    const callLog = msg.messageType === 'call_log' ? parseCallLog(content) : null;
    const showDate = shouldShowDateSeparator(msg, messages[idx - 1]);
    
    return (
      <React.Fragment key={msg.id || idx}>
        {/* DATE SEPARATOR */}
        {showDate && (
          <motion.div 
            className="date-separator"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span>{getDateSeparator(msg.createdAt)}</span>
          </motion.div>
        )}
        
        {/* EXISTING MESSAGE CODE... */}
        {/* Then AFTER the text bubble, add reactions display */}
      </React.Fragment>
    );
  })}

// ============================================
// 9. ADD REACTIONS DISPLAY (inside message-group, after text-bubble)
// ============================================

{/* Reactions Display */}
{msg.reactions && msg.reactions.length > 0 && (
  <div className="message-reactions">
    {Object.entries(groupReactionsByEmoji(msg.reactions)).map(([emoji, users]) => (
      <button
        key={emoji}
        className={`reaction-pill ${users.includes(user.userId) ? 'my-reaction' : ''}`}
        onClick={() => handleToggleReaction(msg.messageId, emoji)}
      >
        <span className="reaction-emoji">{emoji}</span>
        <span className="reaction-count">{users.length}</span>
      </button>
    ))}
  </div>
)}

// ============================================
// 10. ADD STAR/PIN INDICATORS TO MESSAGE MENU
// ============================================

// In the message dropdown menu, update Star button to show status:
<button className="menu-item" onClick={() => handleStarMessage(msg.messageId)}>
  <Star size={14} fill={starredMessages.has(msg.messageId) ? '#fbbf24' : 'none'} />
  <span>{starredMessages.has(msg.messageId) ? 'Unstar' : 'Star'}</span>
</button>

// Update Pin button to show status:
<button className="menu-item" onClick={() => handlePinMessage(msg.messageId)}>
  <Pin size={14} fill={pinnedMessages.has(msg.messageId) ? '#6366f1' : 'none'} />
  <span>{pinnedMessages.has(msg.messageId) ? 'Unpin' : 'Pin'}</span>
</button>

// ============================================
// 11. ADD PINNED MESSAGES BANNER (after search bar, before chat viewport)
// ============================================

{/* Pinned Messages Banner */}
{pinnedMessages.size > 0 && (
  <motion.div
    className="pinned-messages-banner"
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: 'auto', opacity: 1 }}
  >
    <Pin size={14} />
    <span>{pinnedMessages.size} pinned message{pinnedMessages.size > 1 ? 's' : ''}</span>
    <button onClick={() => toast.info('View pinned messages coming soon')}>
      View
    </button>
  </motion.div>
)}

// ============================================
// 12. ADD CUSTOM DIALOGS AT END OF RETURN (before closing div)
// ============================================

{/* Custom Dialogs */}
<ConfirmDialog
  show={confirmDialog.show}
  title={confirmDialog.title}
  message={confirmDialog.message}
  onConfirm={confirmDialog.onConfirm}
  onCancel={() => setConfirmDialog({ show: false })}
  danger={confirmDialog.danger}
/>

<AlertDialog
  show={alertDialog.show}
  title={alertDialog.title}
  message={alertDialog.message}
  type={alertDialog.type}
  onClose={() => setAlertDialog({ show: false })}
/>

// ============================================
// 13. UPDATE handleClearChat AND handleBlockUser TO USE CUSTOM DIALOGS
// ============================================

const handleClearChat = async () => {
  setConfirmDialog({
    show: true,
    title: 'Clear Chat',
    message: `Are you sure you want to clear all messages with ${recipientUsername}? This cannot be undone.`,
    danger: true,
    onConfirm: async () => {
      try {
        await messagingService.clearConversation(conversation?.conversationId);
        setMessages([]);
        toast.success('Chat cleared');
        setConfirmDialog({ show: false });
        setShowHeaderMenu(false);
      } catch (error) {
        console.error('Clear chat error:', error);
        toast.error('Failed to clear chat');
        setConfirmDialog({ show: false });
      }
    }
  });
};

const handleBlockUser = async () => {
  setConfirmDialog({
    show: true,
    title: isBlocked ? 'Unblock User' : 'Block User',
    message: `Are you sure you want to ${isBlocked ? 'unblock' : 'block'} ${recipientUsername}?${isBlocked ? '' : ' They will no longer be able to send you messages.'}`,
    danger: !isBlocked,
    onConfirm: async () => {
      try {
        if (isBlocked) {
          await messagingService.unblockUser(recipientId, recipientUsername);
          toast.success(`${recipientUsername} has been unblocked`);
          setIsBlocked(false);
        } else {
          await messagingService.blockUser(recipientId, recipientUsername);
          toast.success(`${recipientUsername} has been blocked`);
          setIsBlocked(true);
        }
        setConfirmDialog({ show: false });
        setShowHeaderMenu(false);
      } catch (error) {
        console.error('Block/Unblock user error:', error);
        toast.error(`Failed to ${isBlocked ? 'unblock' : 'block'} user`);
        setConfirmDialog({ show: false });
      }
    }
  });
};

const handleDeleteSelected = async (deleteForEveryone = false) => {
  setConfirmDialog({
    show: true,
    title: 'Delete Messages',
    message: `Delete ${selectedMessages.size} message(s)?`,
    danger: true,
    onConfirm: async () => {
      try {
        for (const messageId of selectedMessages) {
          await messagingService.deleteMessage(messageId, deleteForEveryone);
        }
        toast.success(`${selectedMessages.size} message(s) deleted`);
        handleCancelSelection();
        setConfirmDialog({ show: false });
      } catch (error) {
        console.error('Delete selected error:', error);
        toast.error('Failed to delete messages');
        setConfirmDialog({ show: false });
      }
    }
  });
};

// ============================================
// END OF CODE SNIPPETS
// ============================================
