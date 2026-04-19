/**
 * Messages Slice - Redux state for messaging
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunks for message operations
export const fetchConversations = createAsyncThunk(
  'messages/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      const messagingService = (await import('../../services/messagingService')).default;
      const data = await messagingService.getConversations();
      return data.conversations || [];
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchMessages = createAsyncThunk(
  'messages/fetchMessages',
  async ({ conversationId, options = {} }, { rejectWithValue }) => {
    try {
      const messagingService = (await import('../../services/messagingService')).default;
      const data = await messagingService.getConversationMessages(conversationId, options);
      return { conversationId, messages: data.messages || [], pinnedMessages: data.pinnedMessages || [] };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'messages/sendMessage',
  async ({ content, recipientId, recipientUsername, replyTo }, { rejectWithValue }) => {
    try {
      const messagingService = (await import('../../services/messagingService')).default;
      const message = await messagingService.sendMessage(content, recipientId, recipientUsername, replyTo);
      return message;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  conversations: [],
  conversationsLoading: false,
  currentConversation: null,
  messages: {}, // { conversationId: [...messages] }
  messagesLoading: false,
  pinnedMessages: {}, // { conversationId: [...pinnedMessages] }
  starredMessageIds: new Set(),
  pinnedMessageIds: new Set(),
  typingUsers: {}, // { conversationId: [userIds] }
  unreadCounts: {}, // { conversationId: count }
  error: null,
  sendingMessage: false,
};

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setCurrentConversation: (state, action) => {
      state.currentConversation = action.payload;
    },
    
    addMessage: (state, action) => {
      const { conversationId, message } = action.payload;
      if (!state.messages[conversationId]) {
        state.messages[conversationId] = [];
      }
      
      // Prevent duplicates
      const exists = state.messages[conversationId].some(m => m.messageId === message.messageId);
      if (!exists) {
        state.messages[conversationId].push(message);
        // Sort by createdAt
        state.messages[conversationId].sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        );
      }
    },
    
    updateMessage: (state, action) => {
      const { conversationId, messageId, updates } = action.payload;
      const messages = state.messages[conversationId];
      if (messages) {
        const index = messages.findIndex(m => m.messageId === messageId);
        if (index !== -1) {
          messages[index] = { ...messages[index], ...updates };
        }
      }
    },
    
    removeMessage: (state, action) => {
      const { conversationId, messageId } = action.payload;
      if (state.messages[conversationId]) {
        state.messages[conversationId] = state.messages[conversationId].filter(
          m => m.messageId !== messageId
        );
      }
    },
    
    setTypingUsers: (state, action) => {
      const { conversationId, userIds } = action.payload;
      state.typingUsers[conversationId] = userIds;
    },
    
    updateTyping: (state, action) => {
      const { conversationId, userId, isTyping } = action.payload;
      if (!state.typingUsers[conversationId]) {
        state.typingUsers[conversationId] = [];
      }
      
      if (isTyping) {
        if (!state.typingUsers[conversationId].includes(userId)) {
          state.typingUsers[conversationId].push(userId);
        }
      } else {
        state.typingUsers[conversationId] = state.typingUsers[conversationId].filter(
          id => id !== userId
        );
      }
    },
    
    markConversationRead: (state, action) => {
      const conversationId = action.payload;
      state.unreadCounts[conversationId] = 0;
    },
    
    incrementUnread: (state, action) => {
      const conversationId = action.payload;
      state.unreadCounts[conversationId] = (state.unreadCounts[conversationId] || 0) + 1;
    },
    
    toggleStarred: (state, action) => {
      const messageId = action.payload;
      if (state.starredMessageIds.has(messageId)) {
        state.starredMessageIds.delete(messageId);
      } else {
        state.starredMessageIds.add(messageId);
      }
    },
    
    togglePinned: (state, action) => {
      const { conversationId, messageId } = action.payload;
      if (state.pinnedMessageIds.has(messageId)) {
        state.pinnedMessageIds.delete(messageId);
        if (state.pinnedMessages[conversationId]) {
          state.pinnedMessages[conversationId] = state.pinnedMessages[conversationId].filter(
            m => m.messageId !== messageId
          );
        }
      } else {
        state.pinnedMessageIds.add(messageId);
      }
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch conversations
      .addCase(fetchConversations.pending, (state) => {
        state.conversationsLoading = true;
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversations = action.payload;
        state.conversationsLoading = false;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.conversationsLoading = false;
        state.error = action.payload;
      })
      
      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.messagesLoading = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, messages, pinnedMessages } = action.payload;
        state.messages[conversationId] = messages;
        state.pinnedMessages[conversationId] = pinnedMessages;
        state.messagesLoading = false;
        
        // Extract starred/pinned status
        messages.forEach(msg => {
          if (msg.starred) state.starredMessageIds.add(msg.messageId);
          if (msg.pinned) state.pinnedMessageIds.add(msg.messageId);
        });
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.messagesLoading = false;
        state.error = action.payload;
      })
      
      // Send message
      .addCase(sendMessage.pending, (state) => {
        state.sendingMessage = true;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        // Message will be added via WebSocket or addMessage action
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        state.error = action.payload;
      });
  },
});

export const {
  setCurrentConversation,
  addMessage,
  updateMessage,
  removeMessage,
  setTypingUsers,
  updateTyping,
  markConversationRead,
  incrementUnread,
  toggleStarred,
  togglePinned,
  clearError,
} = messagesSlice.actions;

export default messagesSlice.reducer;

// Selectors
export const selectConversations = (state) => state.messages.conversations;
export const selectCurrentConversation = (state) => state.messages.currentConversation;
export const selectMessages = (conversationId) => (state) => 
  state.messages.messages[conversationId] || [];
export const selectPinnedMessages = (conversationId) => (state) => 
  state.messages.pinnedMessages[conversationId] || [];
export const selectTypingUsers = (conversationId) => (state) => 
  state.messages.typingUsers[conversationId] || [];
export const selectUnreadCount = (conversationId) => (state) => 
  state.messages.unreadCounts[conversationId] || 0;
export const selectIsStarred = (messageId) => (state) => 
  state.messages.starredMessageIds.has(messageId);
export const selectIsPinned = (messageId) => (state) => 
  state.messages.pinnedMessageIds.has(messageId);
