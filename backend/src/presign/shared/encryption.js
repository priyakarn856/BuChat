// DEPRECATED: Backend should NOT decrypt messages in E2E encryption
// Messages are encrypted client-side and server only stores encrypted blobs

// This file is kept for backward compatibility but does nothing
// True E2E encryption means server cannot decrypt messages

module.exports = {
  encryptMessage: async (content) => content,
  decryptMessage: async (content) => content
};
