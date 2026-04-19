import { useEffect, useRef } from 'react';
import notificationManager from '../utils/notifications';

export const useMessageNotifications = (messages, currentUserId, recipientName, conversationId, enabled = true) => {
  const lastCountRef = useRef(0);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2jdXvzn0pBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuIwUug8zx2Ik3CBhku+zooVARC0yl4fG5ZRwFNo3V7859KQUofsz';
      audio.volume = 0.3;
      audioRef.current = audio;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    
    if (messages.length > lastCountRef.current && lastCountRef.current > 0) {
      const newMessages = messages.slice(lastCountRef.current);
      
      newMessages.forEach(msg => {
        if (msg.senderId !== currentUserId && !msg.messageId?.startsWith('temp_')) {
          if (document.hidden || !document.hasFocus()) {
            notificationManager.showMessageNotification(
              recipientName,
              msg.content || 'New message',
              conversationId
            );
          }
          
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
        }
      });
    }
    
    lastCountRef.current = messages.length;
  }, [messages, currentUserId, recipientName, conversationId, enabled])
};

export default useMessageNotifications;
