import api from './api';
import signalProtocol from '../utils/signalProtocol';

class OptimizedMessagingService {
  constructor() {
    this.localCache = new Map();
    this.maxCacheSize = 500;
    this.messageQueue = [];
    this.isOnline = navigator.onLine;
    this.retryAttempts = new Map();
    this.dbName = 'BuChatDecryptedMessages';
    this.dbVersion = 1;
    this.dbInitialized = false;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // Initialize IndexedDB for storing decrypted message plaintext (like Telegram/WhatsApp)
  async initializeDB() {
    if (this.dbInitialized) {
      return new Promise((resolve) => resolve(this.db));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.dbInitialized = true;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('decryptedMessages')) {
          const store = db.createObjectStore('decryptedMessages', { keyPath: 'messageId' });
          store.createIndex('conversationId', 'conversationId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('💾 Created IndexedDB for decrypted message cache');
        }
      };
    });
  }

  // Save decrypted message plaintext to IndexedDB (like Telegram/WhatsApp)
  async saveDecryptedMessage(messageId, conversationId, decryptedContent, createdAt) {
    try {
      const db = await this.initializeDB();
      const tx = db.transaction(['decryptedMessages'], 'readwrite');
      const store = tx.objectStore('decryptedMessages');
      
      await new Promise((resolve, reject) => {
        const request = store.put({
          messageId,
          conversationId,
          decryptedContent,
          createdAt,
          cachedAt: new Date().toISOString()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
      console.log('💾 Cached decrypted message:', messageId);
    } catch (error) {
      console.error('Failed to cache decrypted message:', error);
    }
  }

  // Get decrypted message from IndexedDB cache
  async getDecryptedMessage(messageId) {
    try {
      const db = await this.initializeDB();
      const tx = db.transaction(['decryptedMessages'], 'readonly');
      const store = tx.objectStore('decryptedMessages');
      
      return new Promise((resolve, reject) => {
        const request = store.get(messageId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get cached message:', error);
      return null;
    }
  }

  // Get current user ID from localStorage or token
  getCurrentUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      return user?.userId || null;
    } catch {
      return null;
    }
  }

  // --- DUAL ENCRYPTION HELPERS (AES-GCM for Self-Storage) ---
  
  // Get or create a stable self-encryption key
  async getSelfEncryptionKey() {
    const userId = this.getCurrentUserId();
    if (!userId) throw new Error('No user ID for self-encryption');

    const keyName = `self_enc_key_${userId}`;
    let storedKey = localStorage.getItem(keyName);

    if (!storedKey) {
      // Generate a new random key and store it
      const randomKey = crypto.getRandomValues(new Uint8Array(32));
      storedKey = Array.from(randomKey).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(keyName, storedKey);
      console.log('🔑 Generated new self-encryption key');
    }

    // Convert hex string back to Uint8Array
    const keyBytes = new Uint8Array(storedKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    return await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  
  // Encrypt data for the current user (Sender Copy)
  async encryptForSelf(content) {
    try {
      const key = await this.getSelfEncryptionKey();
      const enc = new TextEncoder();

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(content)
      );

      return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
      };
    } catch (e) {
      console.error("Self encryption failed", e);
      return null;
    }
  }

  // Decrypt data for the current user
  async decryptForSelf(encryptedObj) {
    try {
      if (!encryptedObj || !encryptedObj.iv || !encryptedObj.data) return "[Unreadable]";
      
      const key = await this.getSelfEncryptionKey();

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(encryptedObj.iv) },
        key,
        new Uint8Array(encryptedObj.data)
      );

      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error("Self decryption failed", e);
      return "[Decryption Error]";
    }
  }

  // --- CORE MESSAGING METHODS ---

  // Smart caching with size limits
  cacheMessage(key, data, ttl = 300000) { // 5 minutes default
    if (this.localCache.size >= this.maxCacheSize) {
      const firstKey = this.localCache.keys().next().value;
      this.localCache.delete(firstKey);
    }
    
    this.localCache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }

  getCachedMessage(key) {
    const cached = this.localCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.localCache.delete(key);
    }
    return null;
  }

  // Aligned with backend Lambda - POST /messages with E2E encryption
  async sendMessage(recipientId, content, options = {}) {
    const senderId = this.getCurrentUserId();
    
    if (!this.isOnline) {
      const tempMessage = {
        messageId: `temp_${Date.now()}`,
        senderId,
        recipientId,
        content,
        status: 'queued',
        createdAt: new Date().toISOString()
      };
      this.messageQueue.push({ recipientId, content, options });
      return { message: tempMessage };
    }
    
    try {
      // Ensure Signal Protocol is initialized and sessions loaded
      if (!signalProtocol.initialized || !signalProtocol.identityKeyPair) {
        await signalProtocol.initialize();
      }
      await signalProtocol.loadSessions();

      // Establish session if not exists
      if (!signalProtocol.hasSession(recipientId)) {
        const recipientBundle = await this.getPublicKeyBundle(recipientId);
        await signalProtocol.establishSession(recipientId, recipientBundle);
      }
      
      // Note: Media encryption happens in uploadMedia() before sending
      // No need to encrypt media here - it's already encrypted during upload
      
      // 1. Encrypt for Recipient (Signal Protocol)
      // For media-only messages, use a special placeholder that won't get trimmed
      const textContent = content && content.trim() ? content.trim() : '';
      let signalEncrypted = null;
      
      // Always encrypt something - for media-only messages use placeholder
      // Use '[media]' instead of space because Signal Protocol trims input
      const messageToEncrypt = textContent || (options.media?.length > 0 ? '[media]' : '');
      
      if (messageToEncrypt) {
        signalEncrypted = await signalProtocol.encryptMessage(recipientId, messageToEncrypt);
      }

      // 2. Encrypt for Self (AES-GCM) - FIX FOR SENDER DECRYPTION
      const selfEncrypted = await this.encryptForSelf(messageToEncrypt);
      
      // 3. Validate encryption result
      if (!signalEncrypted || !signalEncrypted.body || signalEncrypted.body.length === 0) {
        console.error('❌ Encryption failed: signalEncrypted has no body', signalEncrypted);
        throw new Error('Encryption produced empty body - cannot send message');
      }

      console.log('📦 Creating dual payload with signalEncrypted:', {
        type: signalEncrypted.type,
        bodyLength: signalEncrypted.body?.length,
        registrationId: signalEncrypted.registrationId,
        hasMedia: options.media && options.media.length > 0
      });

      const dualPayload = {
        scheme: 'dual',
        recipientData: signalEncrypted,
        senderData: selfEncrypted
      };
      
      const payload = {
        recipientId,
        messageType: options.messageType || 'text',
        encrypted: true, 
        encryptedData: dualPayload, // Send the DUAL payload
        encryptedMedia: options.media && options.media.length > 0 ? options.media : null, // Already encrypted during upload
        replyTo: options.replyTo || null // Include reply reference if replying to a message
      };

      // Final validation before sending
      console.log('📤 Sending message payload:', {
        recipientId,
        encrypted: true,
        recipientDataType: dualPayload.recipientData?.type,
        recipientDataBodyLength: dualPayload.recipientData?.body?.length,
        senderDataPresent: !!dualPayload.senderData
      });
      
      const response = await api.post('/messages/v2', payload);
      
      const message = response.data.message || response.data;
      // Store decrypted version locally for display (use original content, not placeholder)
      message.decryptedContent = textContent || '';
      
      // Decrypt media for sender's own display
      message.decryptedMedia = [];
      if (options.media && options.media.length > 0) {
        for (const encMedia of options.media) {
          try {
            // Fetch encrypted data from S3
            const response = await fetch(encMedia.url);
            if (!response.ok) {
              throw new Error(`Failed to fetch media: ${response.status}`);
            }
            const encryptedArrayBuffer = await response.arrayBuffer();
            
            // Decrypt using the stored key and IV
            const decryptedData = await signalProtocol.decryptMedia(
              encryptedArrayBuffer,
              encMedia.encryptionKey,
              encMedia.encryptionIv
            );
            
            if (decryptedData) {
              const blob = new Blob([decryptedData], { type: encMedia.mimeType });
              message.decryptedMedia.push({
                url: URL.createObjectURL(blob),
                type: encMedia.type || encMedia.mimeType,
                messageType: encMedia.messageType,
                name: encMedia.name,
                size: encMedia.size,
                duration: encMedia.duration,
                waveform: encMedia.waveform
              });
            }
          } catch (e) {
            console.error('Failed to decrypt sender media:', e);
            // Fallback: just use the encrypted URL (won't play but won't crash)
            message.decryptedMedia.push(encMedia);
          }
        }
      }
      
      return { 
        message,
        conversationId: message.conversationId
      };
    } catch (error) {
      console.error('Send message error:', error);
      throw error;
    }
  }

  // Send a call log message (to display call history in chat like WhatsApp/Telegram)
  async sendCallLogMessage(recipientId, callData) {
    const senderId = this.getCurrentUserId();
    if (!senderId || !recipientId) return;
    
    try {
      const { callType = 'voice', duration = 0, status = 'completed', isOutgoing = true } = callData;
      
      // Create call log content
      const callLogContent = JSON.stringify({
        type: 'call_log',
        callType,
        duration,
        status,
        isOutgoing,
        timestamp: new Date().toISOString()
      });
      
      // Encrypt for both parties
      if (!signalProtocol.initialized || !signalProtocol.identityKeyPair) {
        await signalProtocol.initialize();
      }
      await signalProtocol.loadSessions();
      
      if (!signalProtocol.hasSession(recipientId)) {
        const recipientBundle = await this.getPublicKeyBundle(recipientId);
        await signalProtocol.establishSession(recipientId, recipientBundle);
      }
      
      const signalEncrypted = await signalProtocol.encryptMessage(recipientId, callLogContent);
      const selfEncrypted = await this.encryptForSelf(callLogContent);
      
      const dualPayload = {
        scheme: 'dual',
        recipientData: signalEncrypted,
        senderData: selfEncrypted
      };
      
      const payload = {
        recipientId,
        messageType: 'call_log',
        encrypted: true,
        encryptedData: dualPayload
      };
      
      const response = await api.post('/messages/v2', payload);
      console.log('📞 Call log message sent:', response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to send call log message:', error);
    }
  }

  // Aligned with backend Lambda - GET /conversations/{conversationId}/messages with decryption
  async getConversationMessages(conversationId, options = {}) {
    const { limit = 50, useCache = false, lastKey = null } = options;
    const cacheKey = `conv_${conversationId}_${limit}_${lastKey || 'first'}`;
    
    if (useCache) {
      const cached = this.getCachedMessage(cacheKey);
      if (cached) return cached;
    }
    
    try {
      // Ensure Signal Protocol is initialized and sessions loaded
      if (!signalProtocol.initialized || !signalProtocol.identityKeyPair) {
        await signalProtocol.initialize();
      }
      await signalProtocol.loadSessions();

      const params = new URLSearchParams({ limit: limit.toString() });
      if (lastKey) params.append('lastKey', lastKey);
      
      const response = await api.get(`/conversations/${encodeURIComponent(conversationId)}/messages?${params}`);
      const messages = response.data.messages || [];
      
      // Decrypt messages
      const participants = conversationId.split('#');
      const userId = this.getCurrentUserId();
      let otherUserId = participants.find(p => p !== userId) || participants[0]; // Fallback safely
      
      // If it's a partial ID (8 chars), get the full UUID
      if (otherUserId && otherUserId.length === 8 && !otherUserId.includes('-')) {
        otherUserId = await this.getFullUserIdFromPartial(otherUserId);
      }
      
      if (messages.length > 0) {
        // Check if session exists for the other person (only needed for incoming messages)
        if (otherUserId && otherUserId !== userId && !signalProtocol.hasSession(otherUserId)) {
          try {
            const recipientBundle = await this.getPublicKeyBundle(otherUserId);
            await signalProtocol.establishSession(otherUserId, recipientBundle);
          } catch (e) {
            console.error('Session establishment failed:', e);
          }
        }
        
        // Decrypt all messages (with IndexedDB cache like Telegram/WhatsApp)
        for (const msg of messages) {
          if (msg.encrypted && msg.encryptedData) {
            // FIRST: Check if we already have decrypted plaintext cached
            const cached = await this.getDecryptedMessage(msg.messageId);
            if (cached && cached.decryptedContent) {
              console.log('✅ Using cached plaintext for:', msg.messageId);
              msg.decryptedContent = cached.decryptedContent;
              continue; // Skip decryption - use cached plaintext
            }

            // NOT CACHED: Decrypt for the first time
            try {
              // DETECT: Is this a "Dual" payload or legacy/raw Signal?
              const isDual = msg.encryptedData.scheme === 'dual';
              
              if (msg.senderId === userId) {
                // === OUTGOING MESSAGE (I sent it) ===
                if (isDual && msg.encryptedData.senderData) {
                  // Decrypt using my Self-Key
                  msg.decryptedContent = await this.decryptForSelf(msg.encryptedData.senderData);
                } else {
                  // Legacy message or no self-copy: Cannot decrypt
                  msg.decryptedContent = '[Sent Encrypted Message]';
                }
              } else {
                // === INCOMING MESSAGE (I received it) ===
                let signalData = msg.encryptedData;
                
                // Extract the specific Signal part if it's a dual payload
                if (isDual && msg.encryptedData.recipientData) {
                  signalData = msg.encryptedData.recipientData;
                }

                // Check for corrupted message (empty body)
                if (!signalData?.body || signalData.body === '') {
                  console.warn('⚠️ Message has empty encrypted body - likely corrupted:', msg.messageId);
                  msg.decryptedContent = '[Message corrupted - empty body]';
                  continue;
                }

                // Decrypt using Signal Protocol with Sender's ID
                msg.decryptedContent = await signalProtocol.decryptMessage(msg.senderId, signalData);
              }

              // Replace [media] placeholder with empty string for display
              if (msg.decryptedContent === '[media]') {
                msg.decryptedContent = '';
              }

              // SUCCESS: Cache the decrypted plaintext for future loads
              if (msg.decryptedContent && !msg.decryptedContent.startsWith('[')) {
                await this.saveDecryptedMessage(
                  msg.messageId,
                  msg.conversationId,
                  msg.decryptedContent,
                  msg.createdAt
                );
              }
            } catch (e) {
              console.error('Decryption error for message:', msg.messageId, e);
              
              // SPECIAL CASE: Session healed error (expected - message sent with old keys)
              if (e.sessionHealed || e.message?.includes('old key')) {
                msg.decryptedContent = '🔄 [Message sent while you were offline - waiting for sender to resend]';
                msg.requiresResend = true;
                continue;
              }
              
              // Provide better error messages based on the error type
              if (e.message?.includes('expired key')) {
                msg.decryptedContent = '⏱️ [Message expired - encryption key no longer available]';
              } else if (e.message?.includes('corrupted') || e.message?.includes('invalid')) {
                msg.decryptedContent = '❌ [Message corrupted]';
              } else {
                msg.decryptedContent = '[Unable to decrypt]';
              }
            }
          } else {
            msg.decryptedContent = msg.content || '[No encrypted data]';
          }
          
          // Decrypt media (Standard AES keys)
          msg.decryptedMedia = [];
          if (msg.encryptedMedia && msg.encryptedMedia.length > 0) {
            for (const encMedia of msg.encryptedMedia) {
              try {
                // Fetch encrypted data from S3
                const response = await fetch(encMedia.url);
                if (!response.ok) {
                  throw new Error(`Failed to fetch media: ${response.status}`);
                }
                const encryptedArrayBuffer = await response.arrayBuffer();
                
                // Decrypt using the stored key and IV
                const decryptedData = await signalProtocol.decryptMedia(
                  encryptedArrayBuffer,
                  encMedia.encryptionKey,
                  encMedia.encryptionIv
                );
                
                if (decryptedData) {
                  const blob = new Blob([decryptedData], { type: encMedia.mimeType });
                  msg.decryptedMedia.push({
                    url: URL.createObjectURL(blob),
                    type: encMedia.type || encMedia.mimeType,
                    messageType: encMedia.messageType,
                    name: encMedia.name,
                    size: encMedia.size,
                    duration: encMedia.duration,
                    waveform: encMedia.waveform
                  });
                }
              } catch (e) {
                console.error('Media decryption failed:', e);
              }
            }
          }
        }
      }
      
      const result = {
        messages,
        lastKey: response.data.lastKey || null,
        hasMore: !!response.data.lastKey
      };
      
      // Don't cache decrypted messages for security
      return result;
    } catch (error) {
      console.error('Get conversation messages error:', error);
      return { messages: [], hasMore: false };
    }
  }

  // Aligned with backend Lambda - POST /conversations/{conversationId}/typing
  async setTypingIndicator(conversationId, isTyping) {
    if (!this.isOnline) return;
    
    const userId = this.getCurrentUserId();
    const key = `typing_${conversationId}_${userId}`;
    
    if (isTyping) {
      localStorage.setItem(key, Date.now().toString());
    } else {
      localStorage.removeItem(key);
    }
    
    try {
      await api.post(`/conversations/${encodeURIComponent(conversationId)}/typing`, {
        isTyping,
        userId
      });
    } catch (error) {
      
    }
  }

  // Get typing users - GET /conversations/{conversationId}/typing
  async getTypingUsers(conversationId) {
    if (!conversationId) return [];
    
    try {
      const response = await api.get(`/conversations/${encodeURIComponent(conversationId)}/typing`);
      const typingUsers = response.data?.typingUsers || [];
      return Array.isArray(typingUsers) ? typingUsers : [];
    } catch (error) {
      console.error('Get typing users error:', error);
      return [];
    }
  }

  // Set online status - PUT /users/online-status with heartbeat
  async setOnlineStatus(isOnline) {
    const userId = this.getCurrentUserId();
    if (!userId) return;
    
    try {
      // eslint-disable-next-line no-unused-vars
      const response = await api.put('/users/online-status', { isOnline });
      if (isOnline) {
        localStorage.setItem(`online_${userId}`, Date.now().toString());
        // Start heartbeat to maintain online status
        this.startOnlineHeartbeat();
      } else {
        localStorage.removeItem(`online_${userId}`);
        this.stopOnlineHeartbeat();
      }
    } catch (error) {
      console.error('Set online status error:', error);
    }
  }
  
  // Heartbeat to maintain online status
  startOnlineHeartbeat() {
    if (this.onlineHeartbeatInterval) return; // Already running
    
    this.onlineHeartbeatInterval = setInterval(async () => {
      const userId = this.getCurrentUserId();
      if (!userId) {
        this.stopOnlineHeartbeat();
        return;
      }
      
      try {
        await api.put('/users/online-status', { isOnline: true });
        localStorage.setItem(`online_${userId}`, Date.now().toString());
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, 30000); // Send heartbeat every 30 seconds
  }
  
  stopOnlineHeartbeat() {
    if (this.onlineHeartbeatInterval) {
      clearInterval(this.onlineHeartbeatInterval);
      this.onlineHeartbeatInterval = null;
    }
  }

  // Get online status - Check if user is online
  async getOnlineStatus(userId) {
    if (!userId) return false;
    
    try {
      const response = await api.get(`/users/${userId}/online-status`);
      const isOnline = response.data?.isOnline === true;
      
      // Cache the result
      if (isOnline) {
        localStorage.setItem(`online_${userId}`, Date.now().toString());
      } else {
        localStorage.removeItem(`online_${userId}`);
      }
      
      return isOnline;
    } catch (error) {
      console.error('Get online status error:', error);
      return false;
    }
  }

  // Delete message - DELETE /messages/{messageId}
  async deleteMessage(messageId, deleteForEveryone = false) {
    try {
      await api.delete(`/messages/${messageId}`, {
        data: { deleteForEveryone }
      });
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // Edit message - PUT /messages/{messageId}
  async editMessage(messageId, content) {
    try {
      const response = await api.put(`/messages/${messageId}`, { content });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Add reaction - POST /messages/{messageId}/reactions
  async addReaction(messageId, emoji) {
    try {
      const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Remove reaction - DELETE /messages/{messageId}/reactions
  async removeReaction(messageId, emoji) {
    try {
      const response = await api.delete(`/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Clear conversation - DELETE /conversations/{conversationId}/clear
  async clearConversation(conversationId) {
    try {
      const userId = this.getCurrentUserId();
      const response = await api.delete(`/conversations/${encodeURIComponent(conversationId)}/clear`, {
        data: { userId },
        headers: { 'Content-Type': 'application/json' }
      });
      this.localCache.delete(`conv_${conversationId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Block user
  async blockUser(userId, username) {
    try {
      const currentUserId = this.getCurrentUserId();
      await api.post(`/users/${username}/block`, { userId: currentUserId });
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // Unblock user
  async unblockUser(userId, username) {
    try {
      const currentUserId = this.getCurrentUserId();
      await api.delete(`/users/${username}/block`, { data: { userId: currentUserId } });
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // Check if user is blocked
  async isUserBlocked(username) {
    try {
      const blockedUsers = await this.getBlockedUsers();
      return blockedUsers.some(blocked => blocked.blockedUsername === username);
    } catch (error) {
      console.error('Error checking block status:', error);
      return false;
    }
  }

  // Get blocked users
  async getBlockedUsers() {
    try {
      const response = await api.get('/users/blocked');
      return response.data.blocked || [];
    } catch (error) {
      console.error('Error fetching blocked users:', error);
      return [];
    }
  }

  // ========================================
  // REACTIONS
  // ========================================
  // eslint-disable-next-line no-dupe-class-members
  async addReaction(messageId, emoji) {
    try {
      const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
      return response.data;
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  // eslint-disable-next-line no-dupe-class-members
  async removeReaction(messageId) {
    try {
      const response = await api.delete(`/messages/${messageId}/reactions`);
      return response.data;
    } catch (error) {
      console.error('Error removing reaction:', error);
      throw error;
    }
  }

  // ========================================
  // STARRED MESSAGES
  // ========================================
  async starMessage(messageId) {
    try {
      const response = await api.put(`/messages/${messageId}/star`);
      return response.data;
    } catch (error) {
      console.error('Error starring message:', error);
      throw error;
    }
  }

  async unstarMessage(messageId) {
    try {
      const response = await api.delete(`/messages/${messageId}/star`);
      return response.data;
    } catch (error) {
      console.error('Error unstarring message:', error);
      throw error;
    }
  }

  async getStarredMessages() {
    try {
      const response = await api.get('/messages/starred');
      return response.data.starred || [];
    } catch (error) {
      console.error('Error fetching starred messages:', error);
      return [];
    }
  }

  // ========================================
  // PINNED MESSAGES
  // ========================================
  async pinMessage(messageId, conversationId) {
    try {
      const response = await api.put(`/messages/${messageId}/pin`, { conversationId });
      return response.data;
    } catch (error) {
      console.error('Error pinning message:', error);
      throw error;
    }
  }

  async unpinMessage(messageId, conversationId) {
    try {
      const response = await api.delete(`/messages/${messageId}/pin?conversationId=${conversationId}`);
      return response.data;
    } catch (error) {
      console.error('Error unpinning message:', error);
      throw error;
    }
  }

  async getPinnedMessages(conversationId) {
    try {
      const response = await api.get(`/conversations/${conversationId}/pinned`);
      return response.data.pinned || [];
    } catch (error) {
      console.error('Error fetching pinned messages:', error);
      return [];
    }
  }

  // ========================================
  // FORWARD MESSAGES
  // ========================================
  async forwardMessages(messageIds, recipientUserIds) {
    try {
      const response = await api.post('/messages/forward', {
        messageIds,
        recipientUserIds
      });
      return response.data;
    } catch (error) {
      console.error('Error forwarding messages:', error);
      throw error;
    }
  }

  // ========================================
  // REPORT MESSAGE
  // ========================================
  async reportMessage(messageId, reason, details) {
    try {
      const response = await api.post(`/messages/${messageId}/report`, {
        reason,
        details
      });
      return response.data;
    } catch (error) {
      console.error('Error reporting message:', error);
      throw error;
    }
  }

  // ========================================
  // BACKGROUND PREFERENCE
  // ========================================
  async saveBackground(background) {
    try {
      const response = await api.put('/users/background', { background });
      return response.data;
    } catch (error) {
      console.error('Error saving background:', error);
      throw error;
    }
  }

  // Mark conversation as read - PUT /conversations/{conversationId}/read
  async markConversationRead(conversationId) {
    if (!this.isOnline) return;
    
    try {
      await api.put(`/conversations/${encodeURIComponent(conversationId)}/read`, {
        userId: this.getCurrentUserId()
      });
    } catch (error) {
      
    }
  }

  // Get message requests - GET /messages/requests
  async getMessageRequests(limit = 20) {
    try {
      const response = await api.get(`/messages/requests?userId=${this.getCurrentUserId()}&limit=${limit}`);
      return response.data.requests || [];
    } catch (error) {
      return [];
    }
  }

  // Respond to message request - PUT /messages/requests/{requestId}
  async respondToMessageRequest(requestId, action) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Process offline message queue
  async processQueue() {
    if (!this.isOnline || this.messageQueue.length === 0) return;
    
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const item of queue) {
      try {
        await this.sendMessage(item.recipientId, item.content, item.options);
      } catch (error) {
        // Re-queue failed messages
        this.messageQueue.push(item);
      }
    }
  }

  // Aligned with backend Lambda - GET /conversations
  async getUserConversations(limit = 20) {
    const cacheKey = `user_conversations_${limit}`;
    const cached = this.getCachedMessage(cacheKey);
    
    if (cached) return cached;
    
    try {
      const response = await api.get(`/conversations?limit=${limit}`);
      const result = response.data.conversations || response.data || [];
      
      this.cacheMessage(cacheKey, { conversations: result }, 30000);
      return { conversations: result };
    } catch (error) {
      return cached || { conversations: [] };
    }
  }

  // Aligned with backend Lambda - PUT /messages/{messageId}/read
  async markMessageRead(messageId, isViewingConversation = false) {
    try {
      const response = await api.put(`/messages/${messageId}/read`, {
        isViewingConversation
      });
      
      const cached = this.getCachedMessage(`msg_${messageId}`);
      if (cached) {
        cached.status = 'read';
        cached.readAt = new Date().toISOString();
        this.cacheMessage(`msg_${messageId}`, cached);
      }
      
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // Mark message as delivered - PUT /messages/{messageId}/delivered
  async markMessageDelivered(messageId) {
    try {
      const response = await api.put(`/messages/${messageId}/delivered`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // Get username from userId
  async getUsernameFromId(userId) {
    try {
      const response = await api.get(`/users/search?q=${userId}`);
      const users = response.data.users || [];
      const user = users.find(u => u.userId === userId);
      return user?.username || userId;
    } catch (error) {
      console.error('Failed to get username:', error);
      return userId;
    }
  }

  // Get userId from username (reverse lookup)
  async getUserIdFromUsername(username) {
    try {
      const response = await api.get(`/users/search?q=${username}`);
      const users = response.data.users || [];
      const user = users.find(u => u.username === username);
      return user?.userId || null;
    } catch (error) {
      console.error('Failed to get userId from username:', error);
      return null;
    }
  }

  // Get full userId from partial ID (first 8 chars)
  async getFullUserIdFromPartial(partialId) {
    try {
      const response = await api.get(`/users/search?q=${partialId}`);
      const users = response.data.users || [];
      const user = users.find(u => u.userId && u.userId.startsWith(partialId));
      return user?.userId || partialId;
    } catch (error) {
      console.error('Failed to get full userId from partial:', error);
      return partialId;
    }
  }

  // Check if recipient has encryption keys (returns true/false)
  async hasEncryptionKeys(usernameOrId) {
    try {
      // Use userId directly if it looks like a UUID, otherwise convert username to userId
      let userId = usernameOrId;
      if (!usernameOrId.includes('-') && usernameOrId.length <= 20) {
        // It's a username, need to get userId
        const userIdFromUsername = await this.getUserIdFromUsername(usernameOrId);
        if (!userIdFromUsername) {
          return false; // User not found
        }
        userId = userIdFromUsername;
      }
      
      // Check the keybackup endpoint (where bundles are actually stored)
      const response = await api.get(`/keybackup/bundle/${userId}`);
      return !!response.data?.bundle;
    } catch (error) {
      if (error.response?.status === 404) {
        return false; // User hasn't uploaded keys yet
      }
      console.error('Error checking encryption keys:', error);
      return false;
    }
  }

  // Get recipient's public key bundle for key exchange
  async getPublicKeyBundle(usernameOrId) {
    try {
      // Convert to userId if it's a username
      let userId = usernameOrId;
      if (!usernameOrId.includes('-') && usernameOrId.length <= 20) {
        // It's a username, need to get userId
        const userIdFromUsername = await this.getUserIdFromUsername(usernameOrId);
        if (!userIdFromUsername) {
          throw new Error('User not found');
        }
        userId = userIdFromUsername;
      }
      
      // Delegate to signalProtocol.fetchPreKeyBundle (uses correct /keybackup/bundle endpoint)
      return await signalProtocol.fetchPreKeyBundle(userId);
    } catch (error) {
      console.error('Failed to get public key bundle:', error);
      throw new Error('Cannot establish secure session');
    }
  }

  // Upload user's public key bundle to server
  async uploadPublicKeyBundle() {
    if (!signalProtocol.identityKeyPair) {
      await signalProtocol.initialize();
    }
    const bundle = await signalProtocol.getPublicKeyBundle();
    await api.post('/users/public-keys', { bundle });
  }

  // Poll for new messages - GET /conversations/{conversationId}/messages with since parameter
  async pollMessages(conversationId, sinceMessageId = null, limit = 50) {
    try {
      const response = await api.get(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`);
      const allMessages = response.data.messages || [];
      
      if (!sinceMessageId || allMessages.length === 0) {
        return { messages: [], hasMore: false };
      }
      
      const sinceIndex = allMessages.findIndex(m => m.messageId === sinceMessageId);
      const newMessages = sinceIndex >= 0 ? allMessages.slice(sinceIndex + 1) : [];
      
      return {
        messages: newMessages,
        hasMore: response.data.hasMore || false
      };
    } catch (error) {
      return { messages: [], hasMore: false };
    }
  }

  // Resend a failed message (like WhatsApp)
  async resendMessage(originalMessage, recipientId) {
    try {
      console.log('🔄 Resending message:', originalMessage.messageId);
      
      // Extract original content and media
      const content = originalMessage.decryptedContent || originalMessage.content || '';
      const media = originalMessage.decryptedMedia || originalMessage.media || [];
      
      // Resend using the same content and media
      return await this.sendMessage(recipientId, content, {
        media,
        messageType: originalMessage.messageType || 'text'
      });
    } catch (error) {
      console.error('Resend failed:', error);
      throw error;
    }
  }

  // Production S3 media upload (encrypted)
  async uploadMedia(file) {
    try {
      // Encrypt file first
      const encrypted = await signalProtocol.encryptMedia(file);
      
      // Create blob from encrypted data
      const encryptedBlob = new Blob([encrypted.encryptedData], { type: 'application/octet-stream' });
      
      // Get presigned URL
      const presignResponse = await api.post('/media/presign', {
        filename: `${Date.now()}_encrypted`,
        contentType: 'application/octet-stream',
        size: encryptedBlob.size
      });
      
      const { uploadUrl, s3Key } = presignResponse.data;
      const fileUrl = `https://${process.env.REACT_APP_MEDIA_BUCKET || 'buchat-media'}.s3.amazonaws.com/${s3Key}`;
      
      // Upload encrypted data to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        body: encryptedBlob,
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });
      
      return {
        type: file.messageType === 'voice' ? 'voice' :
              file.type.startsWith('image/') ? 'image' :
              file.type.startsWith('video/') ? 'video' :
              file.type.startsWith('audio/') ? 'audio' : 'document',
        messageType: file.messageType || (file.type.startsWith('audio/') ? 'audio' : null),
        url: fileUrl,
        name: encrypted.name,
        size: encrypted.size,
        mimeType: encrypted.mimeType,
        key: s3Key,
        // Store encryption keys (will be encrypted again in message)
        encryptionKey: encrypted.key,
        encryptionIv: encrypted.iv,
        // Preserve voice message metadata
        duration: file.voiceDuration || null,
        waveform: file.voiceWaveform || null,
        metadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
          encrypted: true
        }
      };
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error('Failed to upload media');
    }
  }

  // Event handlers
  onMessageUpdate = null;
  onConversationUpdate = null;

  // Cleanup
  cleanup() {
    this.localCache.clear();
    this.messageQueue = [];
    this.retryAttempts.clear();
    this.stopOnlineHeartbeat();
    // DON'T clear sessions - keep encryption keys for next login
    // signalProtocol.clearSessions(); // ❌ REMOVED - causes decryption errors
    this.setOnlineStatus(false);
  }

  // Reset encryption - clears all sessions and forces re-initialization
  async resetEncryption() {
    console.log('🔄 Resetting encryption...');
    signalProtocol.clearSessions();
    localStorage.removeItem('signal_store');
    await signalProtocol.initialize();
    const userId = this.getCurrentUserId();
    if (userId) {
      await this.uploadPublicKeyBundle(userId);
    }
    console.log('✅ Encryption reset complete');
  }

  // ========== BLOCK/UNBLOCK USER METHODS ==========
  
  // Block a user
  // eslint-disable-next-line no-dupe-class-members
  async blockUser(username) {
    try {
      const response = await api.post(`/users/${username}/block`);
      return response.data;
    } catch (error) {
      console.error('Failed to block user:', error);
      throw error;
    }
  }

  // Unblock a user
  // eslint-disable-next-line no-dupe-class-members
  async unblockUser(username) {
    try {
      const response = await api.delete(`/users/${username}/block`);
      return response.data;
    } catch (error) {
      console.error('Failed to unblock user:', error);
      throw error;
    }
  }

  // Check if a user is blocked by username
  // eslint-disable-next-line no-dupe-class-members
  async isUserBlocked(username) {
    try {
      const blockedList = await this.getBlockedUsers();
      return blockedList.some(user => user.username === username || user.userId === username);
    } catch (error) {
      console.error('Failed to check block status:', error);
      return false;
    }
  }

  // Get list of blocked users
  // eslint-disable-next-line no-dupe-class-members
  async getBlockedUsers() {
    try {
      const response = await api.get('/users/blocked-list');
      return response.data.blockedUsers || [];
    } catch (error) {
      console.error('Failed to get blocked users:', error);
      return [];
    }
  }

  // ========== READ RECEIPT SETTINGS ==========
  
  // Set read receipt preference for a conversation
  async setReadReceiptPreference(conversationId, enabled) {
    try {
      const response = await api.put(`/conversations/${conversationId}/read-receipts`, { enabled });
      return response.data;
    } catch (error) {
      console.error('Failed to set read receipt preference:', error);
      throw error;
    }
  }

  // Get read receipt preference for a conversation
  async getReadReceiptPreference(conversationId) {
    try {
      const response = await api.get(`/conversations/${conversationId}/read-receipts`);
      return response.data.enabled;
    } catch (error) {
      console.error('Failed to get read receipt preference:', error);
      return true; // Default to enabled
    }
  }

  // ========== SELF-DESTRUCT TIMER ==========
  
  // Set self-destruct timer for a conversation (in seconds)
  async setSelfDestructTimer(conversationId, timer) {
    try {
      const response = await api.put(`/conversations/${conversationId}/self-destruct`, { timer });
      return response.data;
    } catch (error) {
      console.error('Failed to set self-destruct timer:', error);
      throw error;
    }
  }

  // Get self-destruct timer for a conversation
  async getSelfDestructTimer(conversationId) {
    try {
      const response = await api.get(`/conversations/${conversationId}/self-destruct`);
      return response.data;
    } catch (error) {
      console.error('Failed to get self-destruct timer:', error);
      return { timer: 0, setBy: null, updatedAt: null };
    }
  }

  // ========== ARCHIVE CONVERSATIONS ==========
  
  // Archive a conversation
  async archiveConversation(conversationId) {
    try {
      const response = await api.put(`/conversations/${conversationId}/archive`);
      return response.data;
    } catch (error) {
      console.error('Failed to archive conversation:', error);
      throw error;
    }
  }

  // Unarchive a conversation
  async unarchiveConversation(conversationId) {
    try {
      const response = await api.delete(`/conversations/${conversationId}/archive`);
      return response.data;
    } catch (error) {
      console.error('Failed to unarchive conversation:', error);
      throw error;
    }
  }

  // Check if a conversation is archived
  async isConversationArchived(conversationId) {
    try {
      const response = await api.get(`/conversations/${conversationId}/archived`);
      return response.data.isArchived;
    } catch (error) {
      console.error('Failed to check archive status:', error);
      return false;
    }
  }

  // Get list of archived conversations
  async getArchivedConversations() {
    try {
      const response = await api.get('/conversations/archived-list');
      return response.data.archivedConversations || [];
    } catch (error) {
      console.error('Failed to get archived conversations:', error);
      return [];
    }
  }

  // Initialize encryption on login
  async initializeEncryption() {
    const userId = this.getCurrentUserId();
    if (!userId) {
      console.warn('Cannot initialize encryption: No user ID');
      return;
    }
    
    // Step 1: Initialize Signal Protocol (loads from localStorage or generates new identity)
    await signalProtocol.initialize();
    
    // Step 2: Clear all cached bundle versions to force fresh session establishment
    // This prevents stale session issues when logging in after being offline
    // WhatsApp/Signal pattern: Always rebuild sessions dynamically, never cache
    const bundleKeys = Object.keys(localStorage).filter(k => k.startsWith('bundle_version_'));
    bundleKeys.forEach(key => localStorage.removeItem(key));
    if (bundleKeys.length > 0) {
      console.log(`🧹 Cleared ${bundleKeys.length} cached bundle versions for fresh sessions`);
    }
    
    // Step 3: Ensure self-encryption key exists
    await this.getSelfEncryptionKey();
    
    // Step 4: Check if preKeys already exist (from cloud restore or previous session)
    const existingPreKeyCount = Object.keys(signalProtocol.store?.preKeys || {}).length;
    console.log('📊 Existing preKeys before upload:', existingPreKeyCount);
    
    // Determine if this is a fresh key generation (no preKeys = fresh start)
    // eslint-disable-next-line no-unused-vars
    const isFreshKeyGeneration = existingPreKeyCount === 0;
    
    // Step 5: Generate preKey bundle (this creates preKeys ONLY if they don't exist)
    // This is CRITICAL - we need preKeys to exist before uploading or backing up
    await signalProtocol.getPreKeyBundle();
    
    // Step 6: Upload the bundle to server (so others can message us)
    // ALWAYS force replace to ensure server has latest bundle (critical for key rotation)
    // Without this, server may serve stale bundles causing "preKey not found" errors
    await this.uploadPublicKeyBundle(userId, true);
    
    console.log('✅ Encryption fully initialized with keys');
  }

  // Backup encryption keys to cloud (call after login with password)
  async backupEncryptionKeys(password) {
    const userId = this.getCurrentUserId();
    if (!userId || !password) {
      console.error('Cannot backup: Missing user ID or password');
      return;
    }
    
    try {
      // Ensure encryption is fully initialized before backup
      if (!signalProtocol.identityKeyPair) {
        await signalProtocol.initialize();
      }
      
      // CRITICAL: Ensure preKeys exist before backing up
      // Otherwise we backup empty keys!
      const preKeyCount = Object.keys(signalProtocol.store?.preKeys || {}).length;
      if (preKeyCount === 0) {
        console.log('ℹ️ No preKeys exist yet, generating before backup...');
        await signalProtocol.getPreKeyBundle();
      }
      
      // Ensure self-encryption key exists before backup
      await this.getSelfEncryptionKey();
      await signalProtocol.backupToCloud(userId, password);
    } catch (error) {
      console.error('Failed to backup encryption keys:', error);
    }
  }

  // Restore encryption keys from cloud (call on login with password)
  // CRITICAL: This should be called BEFORE initializeEncryption to avoid generating new keys
  async restoreEncryptionKeys(password) {
    const userId = this.getCurrentUserId();
    if (!userId || !password) {
      console.error('Cannot restore: Missing user ID or password');
      return false;
    }
    
    try {
      // Initialize Signal Protocol store (but don't generate identity yet)
      await signalProtocol.initialize();
      
      // Try to restore from cloud FIRST (this may restore identity and preKeys)
      const restored = await signalProtocol.restoreFromCloud(userId, password);
      
      if (restored) {
        console.log('✅ E2E keys restored from cloud');
      } else {
        // No backup found - will generate new keys in initializeEncryption
        console.log('ℹ️ No cloud backup found, will generate new keys');
      }
      
      return restored;
    } catch (error) {
      console.error('Failed to restore encryption keys:', error);
      return false;
    }
  }

  // Upload public key bundle to backend
  // eslint-disable-next-line no-dupe-class-members
  async uploadPublicKeyBundle(userId, forceReplace = false) {
    if (!userId) {
      userId = this.getCurrentUserId();
    }
    if (!userId) {
      console.error('Cannot upload key bundle: No user ID');
      return;
    }
    
    try {
      await signalProtocol.uploadPreKeyBundle(userId, forceReplace);
      console.log('✅ Public key bundle uploaded');
    } catch (error) {
      console.error('Failed to upload public key bundle:', error);
    }
  }
}

// Create singleton instance
const messagingService = new OptimizedMessagingService();

export default messagingService;