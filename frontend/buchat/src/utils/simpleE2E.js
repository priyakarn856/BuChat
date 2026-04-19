// Simple E2E Encryption using Web Crypto API (WhatsApp-style)
// ECDH for key exchange + AES-GCM for message encryption

class SimpleE2EEncryption {
  constructor() {
    this.keyPair = null;
    this.sharedSecrets = new Map(); // recipientId -> shared secret
  }

  async initialize() {
    const stored = localStorage.getItem('e2e_keypair');
    if (stored) {
      const data = JSON.parse(stored);
      this.keyPair = {
        publicKey: await crypto.subtle.importKey('jwk', data.publicKey, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
        privateKey: await crypto.subtle.importKey('jwk', data.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
      };
    } else {
      this.keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
      await this.saveKeys();
    }
  }

  async saveKeys() {
    const publicKey = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey('jwk', this.keyPair.privateKey);
    localStorage.setItem('e2e_keypair', JSON.stringify({ publicKey, privateKey }));
  }

  async getPublicKeyBundle() {
    if (!this.keyPair) await this.initialize();
    const publicKey = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    return { publicKey, timestamp: Date.now() };
  }

  async deriveSharedSecret(recipientPublicKeyJWK) {
    if (!this.keyPair) await this.initialize();
    
    const recipientPublicKey = await crypto.subtle.importKey(
      'jwk',
      recipientPublicKeyJWK,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const sharedSecret = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientPublicKey },
      this.keyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return sharedSecret;
  }

  async encryptMessage(recipientId, recipientPublicKeyJWK, plaintext) {
    let sharedSecret = this.sharedSecrets.get(recipientId);
    
    if (!sharedSecret) {
      sharedSecret = await this.deriveSharedSecret(recipientPublicKeyJWK);
      this.sharedSecrets.set(recipientId, sharedSecret);
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      sharedSecret,
      encoder.encode(plaintext)
    );

    return {
      body: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
      timestamp: Date.now()
    };
  }

  async decryptMessage(senderId, senderPublicKeyJWK, encryptedData) {
    let sharedSecret = this.sharedSecrets.get(senderId);
    
    if (!sharedSecret) {
      sharedSecret = await this.deriveSharedSecret(senderPublicKeyJWK);
      this.sharedSecrets.set(senderId, sharedSecret);
    }

    const encrypted = this.base64ToArrayBuffer(encryptedData.body);
    const iv = this.base64ToArrayBuffer(encryptedData.iv);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      sharedSecret,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  async encryptMedia(file) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const fileData = await file.arrayBuffer();
    
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileData);
    const exportedKey = await crypto.subtle.exportKey('raw', key);

    return {
      encryptedData: encrypted,
      key: this.arrayBufferToBase64(exportedKey),
      iv: this.arrayBufferToBase64(iv),
      name: file.name,
      size: file.size,
      mimeType: file.type
    };
  }

  async decryptMedia(encryptedData, keyBase64, ivBase64) {
    const key = await crypto.subtle.importKey('raw', this.base64ToArrayBuffer(keyBase64), { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = this.base64ToArrayBuffer(ivBase64);
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedData);
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

  clearAll() {
    this.sharedSecrets.clear();
    localStorage.removeItem('e2e_keypair');
    this.keyPair = null;
  }
}

export default new SimpleE2EEncryption();
