import api from '../services/api';

export const testAuthentication = async () => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  
  
  }...` : 'None');
  
  
  
  
  if (!token) {
    
    return false;
  }
  
  if (!user.userId) {
    
    return false;
  }
  
  try {
    // Test a simple authenticated endpoint
    
    const response = await api.get(`/messages/requests?userId=${user.userId}`);
    
    return true;
  } catch (error) {
    
    return false;
  }
};

export const debugMessageSend = async (recipientId, message) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  
  
  
  
  
  
  if (!token || !user.userId) {
    
    return false;
  }
  
  try {
    const response = await api.post('/messages', {
      senderId: user.userId,
      recipientId,
      encryptedMessage: message,
      media: []
    });
    
    return true;
  } catch (error) {
    
    return false;
  }
};

// Add to window for easy console access
if (typeof window !== 'undefined') {
  window.authTest = testAuthentication;
  window.debugMessageSend = debugMessageSend;
}
