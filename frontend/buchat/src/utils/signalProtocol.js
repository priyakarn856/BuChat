import { SignalProtocolAddress, SessionBuilder, SessionCipher, KeyHelper } from '@privacyresearch/libsignal-protocol-typescript';
import api from '../services/api';

// Global singleton instance to prevent React StrictMode from creating multiple instances
let globalSignalInstance = null;

class SignalE2EManager {
  constructor() {
    // Return existing instance if one exists (prevents StrictMode duplication)
    if (globalSignalInstance) {
      console.log('♻️ Reusing existing Signal Protocol instance');
      return globalSignalInstance;
    }
    
    this.store = null;
    this.identityKeyPair = null;
    this.registrationId = null;
    this.initialized = false;
    this.initializing = null; // Promise to prevent race conditions
    this.preKeys = new Map();
    this.signedPreKeys = new Map();
    
    // Store this as the global instance
    globalSignalInstance = this;
    console.log('🆕 Created new Signal Protocol instance');
  }

  async initialize() {
    // Already initialized - return immediately
    if (this.initialized && this.store && Object.keys(this.store.preKeys || {}).length > 0) {
      return;
    }
    
    // If already initializing, wait for that to complete (prevents race condition)
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this._doInitialize();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }
  
  async _doInitialize() {
    try {
      // STORAGE VERSION - increment this to force refresh of all stored keys
      const STORAGE_VERSION = 2; // Bumped to force refresh of corrupted preKey data
      const storedVersion = parseInt(localStorage.getItem('signal_storage_version') || '0');
      
      const stored = localStorage.getItem('signal_store');
      
      // Only create store if we don't have one, or it's empty
      if (!this.store) {
        this.store = new SignalStore(this);
      }
      
      // If storage version changed, clear old data to force fresh generation
      if (stored && storedVersion < STORAGE_VERSION) {
        console.warn(`🔄 Storage version mismatch (${storedVersion} < ${STORAGE_VERSION}), clearing stale data`);
        localStorage.removeItem('signal_store');
        localStorage.removeItem('signal_signed_prekey_cache');
        localStorage.setItem('signal_storage_version', String(STORAGE_VERSION));
        // Don't load from storage - will generate fresh keys
        this.initialized = false;
        console.log('✅ Signal Protocol storage cleared for fresh initialization');
        return;
      }
      
      if (stored) {
        const data = JSON.parse(stored);
        // Only load if store is empty or we have more data in storage
        const currentPreKeyCount = Object.keys(this.store.preKeys || {}).length;
        const storedPreKeyCount = Object.keys(data.preKeys || {}).length;
        
        if (currentPreKeyCount === 0 || storedPreKeyCount > currentPreKeyCount) {
          await this.loadFromStorage(data);
        }
        this.initialized = true;
        localStorage.setItem('signal_storage_version', String(STORAGE_VERSION));
        console.log('✅ Signal Protocol initialized from localStorage');
      } else {
        // DON'T generate identity yet - let restoreFromCloud try first
        // Identity will be generated if needed in getPreKeyBundle()
        localStorage.setItem('signal_storage_version', String(STORAGE_VERSION));
        console.log('ℹ️ Signal Protocol store created (no stored data)');
      }
    } catch (error) {
      console.error('❌ Signal initialization failed:', error);
      throw error;
    }
  }

  // Ensure identity exists - called before operations that require it
  async ensureIdentity() {
    // Preserve existing store if it has data
    if (!this.store) {
      this.store = new SignalStore(this);
    } else if (!this.store.preKeys) {
      // Store exists but preKeys object is missing - reinitialize it
      this.store.preKeys = {};
    }
    
    // Try to reload from storage if preKeys are empty
    if (Object.keys(this.store.preKeys || {}).length === 0) {
      const stored = localStorage.getItem('signal_store');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.preKeys && Object.keys(data.preKeys).length > 0) {
            await this.loadFromStorage(data);
            console.log('🔄 Reloaded preKeys from storage in ensureIdentity');
          }
        } catch (e) {
          console.warn('Failed to reload from storage:', e);
        }
      }
    }
    
    if (!this.identityKeyPair) {
      await this.generateIdentity();
      console.log('🔑 Generated new identity');
    }
    
    // Check if preKeys need replenishment (industry standard)
    await this.checkAndReplenishPreKeys();
    
    this.initialized = true;
    this.store.initialized = true; // Mark store as initialized
  }

  async generateIdentity() {
    this.identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    this.registrationId = KeyHelper.generateRegistrationId();
    await this.saveToStorage();
  }

  // Generate multiple preKeys at once (industry standard: 100 keys)
  async generatePreKeyBatch(startId = 0, count = 100) {
    const preKeys = [];
    
    for (let i = 0; i < count; i++) {
      const preKeyId = (startId + i) % 16777215; // Prevent overflow
      const generated = await KeyHelper.generatePreKey(preKeyId);
      
      await this.store.storePreKey(generated.keyId, generated.keyPair);
      this.preKeys.set(generated.keyId, generated.keyPair);
      preKeys.push(generated);
    }
    
    await this.saveToStorage();
    return preKeys;
  }

  // Check and replenish preKeys if running low (industry standard)
  async checkAndReplenishPreKeys() {
    const currentCount = Object.keys(this.store.preKeys || {}).length;
    const threshold = 20; // Replenish when below 20
    
    if (currentCount < threshold) {
      console.log(`🔄 PreKey count low (${currentCount}), replenishing...`);
      
      // Find max existing ID
      const existingIds = Object.keys(this.store.preKeys || {}).map(Number);
      const maxId = existingIds.length > 0 ? Math.max(...existingIds) : Date.now() % 16777215;
      
      // Generate 100 new preKeys
      await this.generatePreKeyBatch(maxId + 1, 100);
      
      // Upload new bundle to server (force replace to clear stale keys)
      const userId = localStorage.getItem('userId');
      if (userId) {
        await this.uploadPreKeyBundle(userId, true); // Force replace
        console.log('✅ PreKeys replenished and uploaded to server');
      }
    }
  }

  async getPreKeyBundle() {
    await this.initialize();
    
    // Ensure identity exists (generates if needed after cloud restore attempted)
    await this.ensureIdentity();
    
    // IMPORTANT: Reuse existing preKeys if available, don't regenerate!
    // This ensures recipients can decrypt messages encrypted with our public keys
    
    let preKey = null;
    let preKeyId = null;
    let signedPreKey = null;
    let signedPreKeyId = null;
    
    // Check if we have existing preKeys in store
    const existingPreKeyIds = Object.keys(this.store.preKeys || {}).filter(id => {
      // Verify the preKey actually has a keyPair (not just an empty object)
      const keyPair = this.store.preKeys[id];
      return keyPair && keyPair.pubKey && keyPair.privKey;
    });
    
    if (existingPreKeyIds.length > 0) {
      // Use the LOWEST numbered preKey (most likely to still exist)
      // Sort numerically to get consistent ordering
      const sortedIds = existingPreKeyIds.map(Number).sort((a, b) => a - b);
      preKeyId = sortedIds[0];
      const existingKeyPair = this.store.preKeys[preKeyId];
      preKey = { keyId: preKeyId, keyPair: existingKeyPair };
      console.log('♻️ Reusing existing preKey:', preKeyId, '(', existingPreKeyIds.length, 'total valid preKeys available)');
    } else {
      // Generate 100 preKeys (industry standard) - Signal/WhatsApp pattern
      console.log('🏭 Generating 100 preKeys for key pool...');
      const startId = Date.now() % 16777215;
      const generatedKeys = await this.generatePreKeyBatch(startId, 100);
      
      // Use first generated key for this bundle
      preKeyId = generatedKeys[0].keyId;
      preKey = generatedKeys[0];
      console.log('🔑 Generated 100 preKeys, using first:', preKeyId);
    }
    
    // For signedPreKey, always generate fresh with valid signature
    // The signedPreKey signature MUST be generated by libsignal to be valid
    // Check if we have a cached signedPreKey with signature in localStorage
    const cachedBundle = this.getCachedSignedPreKey();
    
    if (cachedBundle && this.store.signedPreKeys && this.store.signedPreKeys[cachedBundle.keyId]) {
      // Reuse cached signedPreKey with its signature
      signedPreKeyId = cachedBundle.keyId;
      signedPreKey = {
        keyId: signedPreKeyId,
        keyPair: this.store.signedPreKeys[signedPreKeyId],
        signature: this.base64ToArrayBuffer(cachedBundle.signature)
      };
      console.log('♻️ Reusing cached signedPreKey:', signedPreKeyId);
    } else {
      // Generate new signedPreKey with valid signature
      signedPreKeyId = Math.floor(Date.now() / 1000) % 16777215;
      signedPreKey = await KeyHelper.generateSignedPreKey(this.identityKeyPair, signedPreKeyId);
      await this.store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);
      this.signedPreKeys.set(signedPreKey.keyId, signedPreKey.keyPair);
      
      // Cache the signature for future reuse
      this.cacheSignedPreKey(signedPreKey.keyId, this.arrayBufferToBase64(signedPreKey.signature));
      console.log('🔑 Generated new signedPreKey:', signedPreKeyId);
    }
    
    // Save to storage after any key operations
    await this.saveToStorage();

    // CRITICAL VALIDATION: Ensure the preKey we're about to upload actually exists in our store
    const preKeyExists = this.store.preKeys[preKey.keyId];
    if (!preKeyExists || !preKeyExists.pubKey || !preKeyExists.privKey) {
      console.error('❌ CRITICAL: PreKey', preKey.keyId, 'does not exist in store! Available:', Object.keys(this.store.preKeys || {}));
      throw new Error(`Cannot create bundle: preKey ${preKey.keyId} missing from local store`);
    }
    
    console.log('✅ Bundle validation passed - preKey', preKey.keyId, 'exists in store');

    return {
      identityKey: this.arrayBufferToBase64(this.identityKeyPair.pubKey),
      registrationId: this.registrationId,
      preKey: {
        keyId: preKey.keyId,
        publicKey: this.arrayBufferToBase64(preKey.keyPair.pubKey)
      },
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKey: this.arrayBufferToBase64(signedPreKey.keyPair.pubKey),
        signature: this.arrayBufferToBase64(signedPreKey.signature)
      }
    };
  }
  
  // Cache signedPreKey signature in localStorage for reuse
  cacheSignedPreKey(keyId, signatureBase64) {
    try {
      localStorage.setItem('signal_signed_prekey_cache', JSON.stringify({
        keyId,
        signature: signatureBase64,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to cache signedPreKey:', e);
    }
  }
  
  // Get cached signedPreKey signature from localStorage
  getCachedSignedPreKey() {
    try {
      const cached = localStorage.getItem('signal_signed_prekey_cache');
      if (cached) {
        const data = JSON.parse(cached);
        // Only use cache if less than 30 days old
        if (Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000) {
          return data;
        }
      }
    } catch (e) {
      console.warn('Failed to read cached signedPreKey:', e);
    }
    return null;
  }

  async uploadPreKeyBundle(userId, forceReplace = false) {
    const bundle = await this.getPreKeyBundle();
    // Add timestamp for freshness tracking (Signal/WhatsApp pattern)
    bundle.uploadedAt = Date.now();
    bundle.version = Date.now(); // Version ID for cache invalidation
    
    console.log('📤 Uploading preKey bundle:', {
      preKeyId: bundle.preKey.keyId,
      signedPreKeyId: bundle.signedPreKey.keyId,
      registrationId: bundle.registrationId,
      uploadedAt: new Date(bundle.uploadedAt).toISOString(),
      forceReplace
    });
    
    // CRITICAL: If forceReplace, delete old bundle first to prevent stale key issues
    if (forceReplace) {
      try {
        console.log('🗑️ Deleting stale server bundle before upload');
        await api.delete(`/keybackup/bundle/${userId}`);
        console.log('✅ Old bundle deleted');
      } catch (e) {
        // Ignore 404 - bundle might not exist
        if (e.response?.status !== 404) {
          console.warn('Could not delete old bundle:', e.message);
        }
      }
    }
    
    await api.post('/keybackup/upload', { userId, bundle });
    return bundle;
  }

  async fetchPreKeyBundle(recipientId) {
    try {
      // Cache-bust via query param only (no extra headers to avoid CORS issues)
      const response = await api.get(`/keybackup/bundle/${recipientId}`, {
        params: { t: Date.now() }
      });
      const bundle = response.data.bundle;
      
      if (!bundle || !bundle.preKey || !bundle.identityKey) {
        console.error('❌ Invalid bundle structure for', recipientId);
        throw new Error('Recipient has not set up encryption yet');
      }
      
      // Validate bundle structure
      if (!bundle.preKey.keyId || !bundle.preKey.publicKey) {
        console.error('❌ Bundle missing preKey data:', bundle.preKey);
        throw new Error('Invalid bundle: missing preKey data');
      }
      
      if (!bundle.signedPreKey?.keyId || !bundle.signedPreKey?.publicKey) {
        console.error('❌ Bundle missing signedPreKey data:', bundle.signedPreKey);
        throw new Error('Invalid bundle: missing signedPreKey data');
      }
      
      console.log('📥 Fetched preKey bundle for', recipientId, ':', {
        preKeyId: bundle?.preKey?.keyId,
        signedPreKeyId: bundle?.signedPreKey?.keyId,
        registrationId: bundle?.registrationId,
        uploadedAt: bundle?.uploadedAt ? new Date(bundle.uploadedAt).toISOString() : 'unknown'
      });
      return bundle;
    } catch (error) {
      if (error.response?.status === 404) {
        console.error('❌ No encryption bundle found for recipient:', recipientId);
        throw new Error('Recipient has not set up encryption. They need to log in first.');
      }
      throw error;
    }
  }

  async encryptMessage(recipientId, plaintext) {
    await this.initialize();
    await this.ensureIdentity();
    
    if (!plaintext || plaintext.trim() === '') {
      throw new Error('Cannot encrypt empty message');
    }
    
    const address = new SignalProtocolAddress(recipientId, 1);
    
    // ALWAYS fetch fresh bundle to check if recipient's keys have changed
    // This is the Signal/WhatsApp pattern - verify bundle before first message
    let bundle = null;
    try {
      bundle = await this.fetchPreKeyBundle(recipientId);
    } catch (error) {
      console.error('❌ Cannot send message - recipient bundle unavailable:', error.message);
      throw new Error('Cannot send encrypted message: ' + error.message);
    }
    
    // Check if we have a session and if it matches the current bundle
    const hasSession = await this.store.loadSession(address.toString());
    const cachedBundleVersion = localStorage.getItem(`bundle_version_${recipientId}`);
    const currentBundleVersion = bundle.version || bundle.uploadedAt || bundle.preKey?.keyId;
    
    // If bundle version changed, clear old session - recipient regenerated keys
    if (hasSession && cachedBundleVersion && cachedBundleVersion !== String(currentBundleVersion)) {
      console.log('🔄 Recipient bundle changed, clearing stale session');
      await this.store.removeSession(address.toString());
    }
    
    // Store current bundle version for future checks
    localStorage.setItem(`bundle_version_${recipientId}`, String(currentBundleVersion));
    
    // Always re-load session after potential invalidation
    let validSession = await this.store.loadSession(address.toString());
    if (!validSession) {
      console.log('📤 Establishing new session with', recipientId, 'using preKeyId:', bundle.preKey?.keyId);
      await this.processPreKeyBundle(address, bundle);
      validSession = await this.store.loadSession(address.toString());
    }

    const sessionCipher = new SessionCipher(this.store, address);
    const ciphertext = await sessionCipher.encrypt(this.stringToArrayBuffer(plaintext));

    // Debug: Log the ciphertext structure
    console.log('🔐 Encryption result:', {
      type: ciphertext.type,
      bodyType: typeof ciphertext.body,
      bodyLength: ciphertext.body?.length || ciphertext.body?.byteLength || 0,
      registrationId: ciphertext.registrationId
    });

    // Handle body - it could be ArrayBuffer, Uint8Array, or already a string
    let bodyBase64;
    if (typeof ciphertext.body === 'string') {
      // Check if it's already valid base64 or a binary string
      // Binary strings from Signal have non-printable characters
      const hasNonBase64Chars = /[^A-Za-z0-9+/=]/.test(ciphertext.body);
      // eslint-disable-next-line no-control-regex
      const hasBinaryChars = /[\x00-\x1f\x7f-\xff]/.test(ciphertext.body);
      
      if (hasBinaryChars || hasNonBase64Chars) {
        // It's a binary string, convert to base64
        console.log('🔄 Converting binary string to base64');
        const bytes = new Uint8Array(ciphertext.body.length);
        for (let i = 0; i < ciphertext.body.length; i++) {
          bytes[i] = ciphertext.body.charCodeAt(i);
        }
        bodyBase64 = this.arrayBufferToBase64(bytes);
      } else {
        // Already a base64 string
        bodyBase64 = ciphertext.body;
      }
    } else if (ciphertext.body instanceof ArrayBuffer || ciphertext.body instanceof Uint8Array) {
      bodyBase64 = this.arrayBufferToBase64(ciphertext.body);
    } else if (ciphertext.body && typeof ciphertext.body === 'object') {
      // Could be a buffer-like object, try to convert
      bodyBase64 = this.arrayBufferToBase64(new Uint8Array(Object.values(ciphertext.body)));
    } else {
      console.error('❌ Unknown ciphertext body type:', ciphertext.body);
      throw new Error('Encryption produced invalid ciphertext body');
    }

    // Validate the base64 string
    if (!bodyBase64 || bodyBase64.length === 0) {
      console.error('❌ Encryption produced empty body');
      throw new Error('Encryption produced empty body');
    }

    // Extra validation: ensure it's actually valid base64
    try {
      atob(bodyBase64);
    } catch (e) {
      console.error('❌ Produced invalid base64:', bodyBase64.substring(0, 50));
      throw new Error('Encryption produced invalid base64');
    }

    console.log('✅ Encryption produced valid base64, length:', bodyBase64.length);

    // Save session after encryption
    await this.saveToStorage();

    return {
      type: ciphertext.type,
      body: bodyBase64,
      registrationId: ciphertext.registrationId || this.registrationId
    };
  }

  async decryptMessage(senderId, encryptedData) {
    await this.initialize();
    await this.ensureIdentity();
    
    // Critical: Check and reload preKeys if empty (React StrictMode race condition fix)
    const preKeyCount = Object.keys(this.store.preKeys || {}).length;
    console.log(`🔍 PreKeys before decrypt: ${preKeyCount}`);
    
    if (preKeyCount === 0) {
      console.warn('⚠️ PreKeys empty before decrypt! Attempting emergency reload...');
      const stored = localStorage.getItem('signal_store');
      console.log('📦 LocalStorage has signal_store:', !!stored);
      
      if (stored) {
        try {
          const data = JSON.parse(stored);
          console.log('📦 Stored preKeys count:', Object.keys(data.preKeys || {}).length);
          
          // Manually restore preKeys to ensure they're loaded
          if (data.preKeys) {
            this.store.preKeys = {};
            for (const [keyId, keyData] of Object.entries(data.preKeys)) {
              this.store.preKeys[keyId] = {
                pubKey: this.base64ToArrayBuffer(keyData.pubKey),
                privKey: this.base64ToArrayBuffer(keyData.privKey)
              };
            }
            console.log('✅ Emergency restored preKeys:', Object.keys(this.store.preKeys));
          }
          
          // Also restore signed preKeys
          if (data.signedPreKeys) {
            this.store.signedPreKeys = {};
            for (const [keyId, keyData] of Object.entries(data.signedPreKeys)) {
              this.store.signedPreKeys[keyId] = {
                pubKey: this.base64ToArrayBuffer(keyData.pubKey),
                privKey: this.base64ToArrayBuffer(keyData.privKey)
              };
            }
          }
        } catch (e) {
          console.error('❌ Emergency reload failed:', e);
        }
      } else {
        console.error('❌ No signal_store in localStorage!');
      }
    }
    
    const address = new SignalProtocolAddress(senderId, 1);
    const sessionCipher = new SessionCipher(this.store, address);

    // Robustly get type and body
    const messageBody = encryptedData?.body;
    const messageType = encryptedData?.type;

    if (!messageBody) {
        console.error('❌ Decryption failed: encryptedData.body is missing', encryptedData);
        throw new Error('Invalid encrypted data format');
    }

    console.log('🔓 Attempting to decrypt:', {
      type: messageType,
      bodyLength: messageBody?.length,
      bodyPreview: messageBody?.substring(0, 30) + '...',
      localPreKeyIds: Object.keys(this.store.preKeys || {}),
      localSignedPreKeyIds: Object.keys(this.store.signedPreKeys || {})
    });

    // Validate base64 before converting
    let bodyBuffer;
    try {
      bodyBuffer = this.base64ToArrayBuffer(messageBody);
    } catch (e) {
      console.error('❌ Invalid base64 in message body:', e.message);
      throw new Error('Message has invalid encoding');
    }

    try {
      let plaintext;
      
      // Type 3 = PreKeyWhisperMessage (first message), Type 1 = WhisperMessage (subsequent)
      if (messageType === 3) {
        plaintext = await sessionCipher.decryptPreKeyWhisperMessage(bodyBuffer, 'binary');
      } else {
        // Default to WhisperMessage for type 1 or if type is missing
        plaintext = await sessionCipher.decryptWhisperMessage(bodyBuffer, 'binary');
      }
      
      // 🔑 Save session state after successful decryption
      // Note: saveToStorage now has protection against saving empty state
      await this.saveToStorage();
      
      return this.arrayBufferToString(plaintext);
    } catch (error) {
      console.warn('⚠️ Decryption failed, attempting session healing. Error:', error.message);
      
      // INDUSTRY STANDARD: Session Healing (Signal/WhatsApp pattern)
      // If decryption fails, automatically heal the session for future messages
      if (error.message?.includes('No session') || 
          error.message?.includes('Bad MAC') || 
          error.message?.includes('unable to find session')) {
        
        console.log('🔄 Initiating automatic session healing...');
        
        try {
          // Step 1: Delete corrupted session
          await this.store.deleteSession(address.toString());
          console.log('✅ Deleted corrupted session');
          
          // Step 2: Clear cached bundle version to force fresh fetch
          localStorage.removeItem(`bundle_version_${senderId}`);
          
          // Step 3: Fetch fresh preKey bundle from sender
          console.log('📥 Fetching fresh bundle from sender:', senderId);
          const freshBundle = await this.fetchPreKeyBundle(senderId);
          
          // Step 4: Establish new session with fresh keys
          await this.processPreKeyBundle(address, freshBundle);
          
          // Step 5: Cache the new bundle version
          const newBundleVersion = freshBundle.version || freshBundle.uploadedAt || freshBundle.preKey?.keyId;
          localStorage.setItem(`bundle_version_${senderId}`, String(newBundleVersion));
          
          // Step 6: Save healed session immediately to storage
          await this.saveToStorage();
          
          console.log('✅ Session healed with fresh keys and saved to storage');
          
          // This message is unrecoverable (encrypted with expired key), but future messages will work
          const error = new Error('[Message encrypted with old key - ask sender to resend]');
          error.sessionHealed = true; // Flag for UI to show resend request
          throw error;
        } catch (healError) {
          console.error('❌ Session healing failed:', healError.message);
          throw new Error('Unable to decrypt message. Please ask sender to resend.');
        }
      }
      
      // Check if this is a "missing preKey" error - these messages are permanently unrecoverable
      if (error.message?.includes('unable to find session for base key')) {
        console.error('❌ PreKey not found - message was encrypted with a key that no longer exists');

        // Defensive: clear any stale session and refresh sender bundle so future messages succeed
        try {
          await this.store.removeSession(address.toString());
          localStorage.removeItem(`bundle_version_${senderId}`);
          const freshBundle = await this.fetchPreKeyBundle(senderId);
          await this.processPreKeyBundle(address, freshBundle);
          
          // Cache new bundle version
          const newBundleVersion = freshBundle.version || freshBundle.uploadedAt || freshBundle.preKey?.keyId;
          localStorage.setItem(`bundle_version_${senderId}`, String(newBundleVersion));
          
          await this.saveToStorage();
          console.log('🔄 Refreshed session after missing preKey for future messages');
        } catch (refreshErr) {
          console.warn('⚠️ Failed to refresh session after missing preKey:', refreshErr.message);
        }

        throw new Error('Message encrypted with expired key - cannot decrypt');
      }
      
      // Fallback: try the other decryption method.
      try {
        let plaintext;
        if (messageType !== 3) { // If we thought it was a WhisperMessage, try as PreKeyWhisperMessage
          plaintext = await sessionCipher.decryptPreKeyWhisperMessage(bodyBuffer, 'binary');
        } else { // If we thought it was a PreKeyWhisperMessage, try as WhisperMessage
          plaintext = await sessionCipher.decryptWhisperMessage(bodyBuffer, 'binary');
        }
        
        console.log('✅ Fallback decryption successful!');
        await this.saveToStorage();
        return this.arrayBufferToString(plaintext);
      } catch (fallbackError) {
        console.error('❌ Fallback decryption also failed:', fallbackError.message);
        
        // Check for preKey error in fallback too
        if (fallbackError.message?.includes('unable to find session for base key') ||
            fallbackError.message?.includes('index out of range')) {
          throw new Error('Message encrypted with expired key - cannot decrypt');
        }
        
        throw new Error('Unable to decrypt message');
      }
    }
  }

  async processPreKeyBundle(address, bundle) {
    const sessionBuilder = new SessionBuilder(this.store, address);
    
    await sessionBuilder.processPreKey({
      registrationId: bundle.registrationId,
      identityKey: this.base64ToArrayBuffer(bundle.identityKey),
      signedPreKey: {
        keyId: bundle.signedPreKey.keyId,
        publicKey: this.base64ToArrayBuffer(bundle.signedPreKey.publicKey),
        signature: this.base64ToArrayBuffer(bundle.signedPreKey.signature)
      },
      preKey: {
        keyId: bundle.preKey.keyId,
        publicKey: this.base64ToArrayBuffer(bundle.preKey.publicKey)
      }
    });
  }

  // Clear session with a specific user (called when recipient regenerates keys)
  async clearSessionFor(userId) {
    try {
      const address = new SignalProtocolAddress(userId, 1);
      await this.store.removeSession(address.toString());
      localStorage.removeItem(`bundle_version_${userId}`);
      await this.saveToStorage();
      console.log('🗑️ Cleared stale session for:', userId);
      return true;
    } catch (error) {
      console.warn('⚠️ Failed to clear session:', error);
      return false;
    }
  }

  // Reset all cloud keys and local storage - use for fresh start
  async resetAllKeys(userId) {
    try {
      // Delete cloud backup and bundle
      await api.delete(`/keybackup/reset/${userId}`);
      console.log('✅ Cloud keys deleted');
    } catch (error) {
      if (error.response?.status !== 404) {
        console.warn('⚠️ Failed to delete cloud keys:', error.message);
      }
    }
    
    // Clear local storage
    localStorage.removeItem('signal_store');
    localStorage.removeItem('signal_signed_prekey_cache');
    localStorage.removeItem(`self_enc_key_${userId}`);
    
    // Reset in-memory state
    this.store = null;
    this.identityKeyPair = null;
    this.registrationId = null;
    this.preKeys = new Map();
    this.signedPreKeys = new Map();
    this.sessions = new Map();
    
    console.log('✅ All encryption keys reset - fresh start');
  }

  async backupToCloud(userId, password) {
    // Ensure we have identity and store
    await this.initialize();
    await this.ensureIdentity();
    
    // Get self-encryption key from localStorage
    const selfEncKeyName = `self_enc_key_${userId}`;
    const selfEncKey = localStorage.getItem(selfEncKeyName);
    
    // Get cached signedPreKey signature for backup
    const signedPreKeyCache = this.getCachedSignedPreKey();
    
    // Serialize preKeys and signedPreKeys for backup
    const serializedPreKeys = {};
    for (const [keyId, keyPair] of Object.entries(this.store.preKeys)) {
      serializedPreKeys[keyId] = {
        pubKey: this.arrayBufferToBase64(keyPair.pubKey),
        privKey: this.arrayBufferToBase64(keyPair.privKey)
      };
    }
    
    const serializedSignedPreKeys = {};
    for (const [keyId, keyPair] of Object.entries(this.store.signedPreKeys)) {
      serializedSignedPreKeys[keyId] = {
        pubKey: this.arrayBufferToBase64(keyPair.pubKey),
        privKey: this.arrayBufferToBase64(keyPair.privKey)
      };
    }
    
    // Serialize identity keys (trusted contacts)
    const serializedIdentityKeys = {};
    for (const [identifier, identityKey] of Object.entries(this.store.identityKeys)) {
      serializedIdentityKeys[identifier] = this.arrayBufferToBase64(identityKey);
    }
    
    const data = {
      version: 3, // Version 3 includes signedPreKey signature cache
      identity: {
        pubKey: this.arrayBufferToBase64(this.identityKeyPair.pubKey),
        privKey: this.arrayBufferToBase64(this.identityKeyPair.privKey)
      },
      registrationId: this.registrationId,
      sessions: this.store.sessions,
      preKeys: serializedPreKeys,
      signedPreKeys: serializedSignedPreKeys,
      signedPreKeyCache: signedPreKeyCache, // Include signature for cross-device bundle regeneration
      identityKeys: serializedIdentityKeys,
      selfEncryptionKey: selfEncKey, // Include self-encryption key for cross-device support
      timestamp: Date.now()
    };

    const encrypted = await this.encryptBackup(JSON.stringify(data), password);
    await api.post('/keybackup/backup', { userId, encryptedKeys: encrypted });
    console.log('✅ E2E keys backed up to cloud (complete backup v3)');
  }

  async restoreFromCloud(userId, password) {
    try {
      // Check if restoration should be skipped (set by nuclear reset)
      const skipRestore = sessionStorage.getItem('skip_cloud_restore');
      if (skipRestore === 'true') {
        console.log('⏭️ Skipping cloud restore (fresh keys requested)');
        sessionStorage.removeItem('skip_cloud_restore');
        
        // Delete stale cloud backup and server bundle
        try {
          await api.delete(`/keybackup/reset/${userId}`);
          console.log('ℹ️ No cloud backup found - clearing any stale KEYBUNDLE');
        } catch (e) {
          // Ignore 404 errors
        }
        
        return false;
      }
      
      // Ensure store exists before restoring
      if (!this.store) {
        this.store = new SignalStore(this);
      }
      
      const response = await api.get(`/keybackup/restore/${userId}`);
      if (!response.data || !response.data.encryptedKeys) {
        console.log('ℹ️ No E2E backup found on cloud for user');
        
        // Delete any stale KEYBUNDLE from server
        try {
          await api.delete(`/keybackup/bundle/${userId}`);
          console.log('ℹ️ No cloud backup found - clearing any stale KEYBUNDLE');
        } catch (e) {
          // Ignore 404 errors
        }
        
        return false;
      }

      const decrypted = await this.decryptBackup(response.data.encryptedKeys, password);
      const data = JSON.parse(decrypted);
      
      // CRITICAL: Only restore identity if we don't have one locally, OR if cloud has newer data
      const hasLocalIdentity = this.identityKeyPair && this.identityKeyPair.pubKey;
      // eslint-disable-next-line no-unused-vars
      const cloudHasKeys = data.preKeys && Object.keys(data.preKeys).length > 0;
      
      if (!hasLocalIdentity) {
        // No local identity, restore from cloud
        this.identityKeyPair = {
          pubKey: this.base64ToArrayBuffer(data.identity.pubKey),
          privKey: this.base64ToArrayBuffer(data.identity.privKey)
        };
        this.registrationId = data.registrationId;
        console.log('✅ Restored identity from cloud (no local identity)');
      } else {
        console.log('ℹ️ Keeping local identity (already exists)');
      }
      
      // CRITICAL FIX: Restore preKeys from cloud - they're needed to decrypt messages
      // that were encrypted with our old public bundle (before we logged in)
      // This happens when:
      // 1. User A sends to User B using User B's old public bundle
      // 2. User B logs in and would clear their old preKeys
      // 3. User B can't decrypt because they don't have the old private key
      
      // Restore preKeys from cloud backup
      if (data.preKeys && typeof data.preKeys === 'object') {
        const cloudPreKeyCount = Object.keys(data.preKeys).length;
        const localPreKeyCount = Object.keys(this.store.preKeys || {}).length;
        
        // Build a plain object with all preKeys (cloud + local)
        const restoredPreKeys = { ...this.store._preKeys }; // Start with current keys
        
        // Merge cloud preKeys into the object
        for (const [keyId, keyData] of Object.entries(data.preKeys)) {
          try {
            const keyPair = {
              pubKey: this.base64ToArrayBuffer(keyData.pubKey),
              privKey: this.base64ToArrayBuffer(keyData.privKey)
            };
            restoredPreKeys[keyId] = keyPair;
            this.preKeys.set(parseInt(keyId), keyPair);
          } catch (e) {
            console.warn(`⚠️ Failed to restore preKey ${keyId}:`, e.message);
          }
        }
        
        // Use setter to properly update the store
        this.store.preKeys = restoredPreKeys;
        
        console.log(`✅ Restored ${cloudPreKeyCount} preKeys from cloud (local had ${localPreKeyCount})`);
      }
      
      // Restore signedPreKeys from cloud backup
      if (data.signedPreKeys && typeof data.signedPreKeys === 'object') {
        const cloudSignedCount = Object.keys(data.signedPreKeys).length;
        const localSignedCount = Object.keys(this.store.signedPreKeys || {}).length;
        
        // Build a plain object with all signedPreKeys (cloud + local)
        const restoredSignedPreKeys = { ...this.store._signedPreKeys }; // Start with current keys
        
        // Merge cloud signedPreKeys into the object
        for (const [keyId, keyData] of Object.entries(data.signedPreKeys)) {
          try {
            const keyPair = {
              pubKey: this.base64ToArrayBuffer(keyData.pubKey),
              privKey: this.base64ToArrayBuffer(keyData.privKey)
            };
            restoredSignedPreKeys[keyId] = keyPair;
            this.signedPreKeys.set(parseInt(keyId), keyPair);
          } catch (e) {
            console.warn(`⚠️ Failed to restore signedPreKey ${keyId}:`, e.message);
          }
        }
        
        // Use setter to properly update the store
        this.store.signedPreKeys = restoredSignedPreKeys;
        
        console.log(`✅ Restored ${cloudSignedCount} signedPreKeys from cloud (local had ${localSignedCount})`);
      }
      
      // ⚠️ CRITICAL: Do NOT restore sessions from cloud (WhatsApp/Signal pattern)
      // Sessions contain ephemeral Double Ratchet state that becomes stale when offline
      // Instead, sessions will be rebuilt automatically when needed using preKey bundles
      // This prevents "Bad MAC" errors from session state mismatch
      if (data.sessions && typeof data.sessions === 'object') {
        const sessionCount = Object.keys(data.sessions).length;
        console.log(`⏭️ Skipping restore of ${sessionCount} sessions from cloud (will rebuild dynamically)`);
        // DON'T restore: this.store.sessions = { ...this.store.sessions, ...data.sessions };
      }
      
      // ⚠️ CRITICAL: Do NOT restore trusted identities from cloud either
      // These should be re-verified when sessions are rebuilt
      // This ensures we always verify the latest keys from the server
      if (data.identityKeys && typeof data.identityKeys === 'object') {
        const identityCount = Object.keys(data.identityKeys).length;
        console.log(`⏭️ Skipping restore of ${identityCount} identities from cloud (will verify dynamically)`);
        // DON'T restore: for (const [addr, keyData] of Object.entries(data.identityKeys)) { ... }
      }
      
      // 💾 Save restored keys to localStorage for persistence
      // This ensures the restored keys are immediately persisted
      await this.saveToStorage();
      
      // Restore self-encryption key if available
      if (data.selfEncryptionKey) {
        const selfEncKeyName = `self_enc_key_${userId}`;
        localStorage.setItem(selfEncKeyName, data.selfEncryptionKey);
        console.log('✅ Self-encryption key restored from cloud');
      }
      
      // Restore signedPreKey cache if available (version 3+)
      // This ensures the signature matches what we have in store
      if (data.signedPreKeyCache && data.signedPreKeyCache.keyId && data.signedPreKeyCache.signature) {
        localStorage.setItem('signal_signed_prekey_cache', JSON.stringify({
          keyId: data.signedPreKeyCache.keyId,
          signature: data.signedPreKeyCache.signature,
          timestamp: data.signedPreKeyCache.timestamp || Date.now()
        }));
        console.log('✅ SignedPreKey cache restored from cloud:', data.signedPreKeyCache.keyId);
      } else {
        console.log('ℹ️ No signedPreKey cache in backup - will generate fresh signature');
      }
      
      console.log(`✅ E2E keys restored from cloud (version ${data.version || 1})`);
      return true;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // No backup found - this means user has new/reset keys
        // CRITICAL: Delete any stale KEYBUNDLE from server
        // This prevents senders from encrypting with outdated public keys
        console.log('ℹ️ No cloud backup found - clearing any stale KEYBUNDLE');
        try {
          await api.delete(`/keybackup/bundle/${userId}`);
          console.log('✅ Stale KEYBUNDLE deleted from server');
        } catch (deleteError) {
          // Ignore - bundle might not exist or already deleted
          if (deleteError.response?.status !== 404) {
            console.warn('Could not delete stale bundle:', deleteError.message);
          }
        }
      } else {
        console.warn('ℹ️ E2E keys not found or backup unavailable:', error.message);
      }
      return false;
    }
  }

  // Delete cloud backup and server bundle (nuclear reset)
  async deleteCloudBackup(userId) {
    try {
      console.log('🗑️ Deleting cloud backup and server bundle for:', userId);
      await api.delete(`/keybackup/reset/${userId}`);
      console.log('✅ Cloud backup and bundle deleted successfully');
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('ℹ️ No cloud backup to delete (already clean)');
        return true;
      }
      console.error('❌ Failed to delete cloud backup:', error.message);
      return false;
    }
  }

  async encryptBackup(data, password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const derivedKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encoder.encode(data)
    );

    return {
      salt: Array.from(salt),
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    };
  }

  async decryptBackup(encrypted, password) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const derivedKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new Uint8Array(encrypted.salt), iterations: 100000, hash: 'SHA-256' },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
      derivedKey,
      new Uint8Array(encrypted.data)
    );

    return new TextDecoder().decode(decrypted);
  }

  stringToArrayBuffer(str) {
    return new TextEncoder().encode(str).buffer;
  }

  arrayBufferToString(buffer) {
    return new TextDecoder().decode(buffer);
  }

  async saveToStorage() {
    // Serialize preKeys for storage
    const serializedPreKeys = {};
    if (this.store && this.store.preKeys) {
      for (const [keyId, keyPair] of Object.entries(this.store.preKeys)) {
        if (keyPair && keyPair.pubKey && keyPair.privKey) {
          serializedPreKeys[keyId] = {
            pubKey: this.arrayBufferToBase64(keyPair.pubKey),
            privKey: this.arrayBufferToBase64(keyPair.privKey)
          };
        }
      }
    }
    
    // Serialize signedPreKeys for storage
    const serializedSignedPreKeys = {};
    if (this.store && this.store.signedPreKeys) {
      for (const [keyId, keyPair] of Object.entries(this.store.signedPreKeys)) {
        if (keyPair && keyPair.pubKey && keyPair.privKey) {
          serializedSignedPreKeys[keyId] = {
            pubKey: this.arrayBufferToBase64(keyPair.pubKey),
            privKey: this.arrayBufferToBase64(keyPair.privKey)
          };
        }
      }
    }
    
    // 🛡️ CRITICAL: Don't save if both preKeys and signedPreKeys are empty
    // This prevents overwriting good cloud data with empty state
    const hasPreKeys = Object.keys(serializedPreKeys).length > 0;
    const hasSignedPreKeys = Object.keys(serializedSignedPreKeys).length > 0;
    
    if (!hasPreKeys && !hasSignedPreKeys) {
      console.warn('⚠️ Skipping saveToStorage - no keys to save (prevents overwriting cloud data)');
      return;
    }
    
    // Serialize identityKeys for storage
    const serializedIdentityKeys = {};
    if (this.store && this.store.identityKeys) {
      for (const [identifier, identityKey] of Object.entries(this.store.identityKeys)) {
        if (identityKey) {
          serializedIdentityKeys[identifier] = this.arrayBufferToBase64(identityKey);
        }
      }
    }
    
    const data = {
      identity: {
        pubKey: this.arrayBufferToBase64(this.identityKeyPair.pubKey),
        privKey: this.arrayBufferToBase64(this.identityKeyPair.privKey)
      },
      registrationId: this.registrationId,
      sessions: this.store ? Object.fromEntries(
        Object.entries(this.store.sessions).map(([key, val]) => [key, val])
      ) : {},
      preKeys: serializedPreKeys,
      signedPreKeys: serializedSignedPreKeys,
      identityKeys: serializedIdentityKeys
    };
    localStorage.setItem('signal_store', JSON.stringify(data));
  }

  async loadFromStorage(data) {
    this.identityKeyPair = {
      pubKey: this.base64ToArrayBuffer(data.identity.pubKey),
      privKey: this.base64ToArrayBuffer(data.identity.privKey)
    };
    this.registrationId = data.registrationId;
    
    // Restore sessions if available
    if (data.sessions && this.store) {
      this.store.sessions = data.sessions;
    }
    
    // Restore preKeys if available
    if (data.preKeys && this.store) {
      this.store.preKeys = {};
      for (const [keyId, keyData] of Object.entries(data.preKeys)) {
        this.store.preKeys[keyId] = {
          pubKey: this.base64ToArrayBuffer(keyData.pubKey),
          privKey: this.base64ToArrayBuffer(keyData.privKey)
        };
      }
    }
    
    // Restore signedPreKeys if available
    if (data.signedPreKeys && this.store) {
      this.store.signedPreKeys = {};
      for (const [keyId, keyData] of Object.entries(data.signedPreKeys)) {
        this.store.signedPreKeys[keyId] = {
          pubKey: this.base64ToArrayBuffer(keyData.pubKey),
          privKey: this.base64ToArrayBuffer(keyData.privKey)
        };
      }
    }
    
    // Restore identityKeys if available
    if (data.identityKeys && this.store) {
      this.store.identityKeys = {};
      for (const [identifier, keyBase64] of Object.entries(data.identityKeys)) {
        this.store.identityKeys[identifier] = this.base64ToArrayBuffer(keyBase64);
      }
    }
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  clearSessions() {
    if (this.store) {
      this.store.sessions = {};
    }
    this.preKeys.clear();
    this.signedPreKeys.clear();
    localStorage.removeItem('signal_store');
    this.initialized = false;
  }

  // Alias for compatibility
  getPublicKeyBundle() {
    return this.getPreKeyBundle();
  }

  // Stub methods for compatibility with messagingService
  async loadSessions() {
    // Sessions are loaded automatically in initialize()
    return true;
  }

  hasSession(recipientId) {
    if (!this.store) return false;
    const address = new SignalProtocolAddress(recipientId, 1);
    return !!this.store.sessions[address.toString()];
  }

  async establishSession(recipientId, bundle) {
    const address = new SignalProtocolAddress(recipientId, 1);
    await this.processPreKeyBundle(address, bundle);
  }

  clearSession(recipientId) {
    if (!this.store) return;
    const address = new SignalProtocolAddress(recipientId, 1);
    delete this.store.sessions[address.toString()];
  }

  async processSessionEstablishment(senderId, ephemeralPublicKey) {
    // For compatibility - actual session is established via processPreKeyBundle
    console.log('Session establishment from ephemeral key not yet implemented');
  }

  async encryptMedia(file) {
    // Simple media encryption using AES-GCM
    const fileData = await file.arrayBuffer();
    const key = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      fileData
    );
    
    return {
      encryptedData,
      key: this.arrayBufferToBase64(key),
      iv: this.arrayBufferToBase64(iv),
      name: file.name,
      size: file.size,
      mimeType: file.type
    };
  }

  async decryptMedia(encryptedData, keyBase64, ivBase64) {
    const key = this.base64ToArrayBuffer(keyBase64);
    const iv = this.base64ToArrayBuffer(ivBase64);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encryptedData
    );
  }
}

// Signal Protocol Store Implementation
class SignalStore {
  constructor(manager) {
    this.manager = manager;
    this.sessions = {};
    this.identityKeys = {};
    this._preKeys = {}; // Use private field
    this._signedPreKeys = {}; // Use private field
    this.initialized = false; // Track if store is fully initialized
    
    console.log('🏗️ SignalStore constructed');
  }
  
  // Getter/setter to track preKey access
  get preKeys() {
    const count = Object.keys(this._preKeys).length;
    if (count === 0 && this.initialized) {
      console.warn('⚠️ preKeys getter called but empty after initialization!', new Error().stack);
    }
    return this._preKeys;
  }
  
  set preKeys(value) {
    const oldCount = Object.keys(this._preKeys).length;
    const newCount = Object.keys(value || {}).length;
    console.log(`📝 preKeys setter: ${oldCount} → ${newCount} keys`);
    if (newCount === 0 && oldCount > 0) {
      console.error('🚨 preKeys being CLEARED!', new Error().stack);
    }
    this._preKeys = value || {};
  }
  
  get signedPreKeys() {
    return this._signedPreKeys;
  }
  
  set signedPreKeys(value) {
    this._signedPreKeys = value || {};
  }

  deleteSession(identifier) {
    console.log('🗑️ Deleting session for:', identifier);
    delete this.sessions[identifier];
    return Promise.resolve();
  }

  async getIdentityKeyPair() {
    return this.manager.identityKeyPair;
  }

  async getLocalRegistrationId() {
    return this.manager.registrationId;
  }

  async isTrustedIdentity(identifier, identityKey) {
    const trusted = this.identityKeys[identifier];
    if (!trusted) return true;
    return this.manager.arrayBufferToBase64(identityKey) === this.manager.arrayBufferToBase64(trusted);
  }

  async loadIdentityKey(identifier) {
    return this.identityKeys[identifier];
  }

  async saveIdentity(identifier, identityKey) {
    this.identityKeys[identifier] = identityKey;
    return true;
  }

  async loadPreKey(keyId) {
    // Handle both string and integer keys (JSON stores keys as strings)
    const key = this.preKeys[keyId] || this.preKeys[String(keyId)];
    if (!key) {
      console.warn(`🔍 loadPreKey(${keyId}) - NOT FOUND. Available keys:`, Object.keys(this.preKeys));
    }
    return key;
  }

  async storePreKey(keyId, keyPair) {
    this.preKeys[keyId] = keyPair;
  }

  async removePreKey(keyId) {
    delete this.preKeys[keyId];
  }

  async loadSignedPreKey(keyId) {
    // Handle both string and integer keys (JSON stores keys as strings)
    return this.signedPreKeys[keyId] || this.signedPreKeys[String(keyId)];
  }

  async storeSignedPreKey(keyId, keyPair) {
    this.signedPreKeys[keyId] = keyPair;
  }

  async removeSignedPreKey(keyId) {
    delete this.signedPreKeys[keyId];
  }

  async loadSession(identifier) {
    return this.sessions[identifier];
  }

  async storeSession(identifier, record) {
    this.sessions[identifier] = record;
  }

  async removeSession(identifier) {
    delete this.sessions[identifier];
  }

  async removeAllSessions(identifier) {
    Object.keys(this.sessions).forEach(key => {
      if (key.startsWith(identifier)) {
        delete this.sessions[key];
      }
    });
  }
}

const signalManager = new SignalE2EManager();
export default signalManager;
