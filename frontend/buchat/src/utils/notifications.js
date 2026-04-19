// Browser Notification Manager

class NotificationManager {
  constructor() {
    this.permission = Notification.permission;
    this.enabled = false;
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }

    if (this.permission === 'granted') {
      this.enabled = true;
      return true;
    }

    if (this.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.enabled = permission === 'granted';
      return this.enabled;
    }

    return false;
  }

  showNotification(title, options = {}) {
    if (!this.enabled || this.permission !== 'granted') return;

    const notification = new Notification(title, {
      icon: '/logo192.png',
      badge: '/logo192.png',
      vibrate: [200, 100, 200],
      ...options
    });

    notification.onclick = () => {
      window.focus();
      if (options.onClick) options.onClick();
      notification.close();
    };

    setTimeout(() => notification.close(), 5000);
    return notification;
  }

  showMessageNotification(sender, message, conversationId) {
    return this.showNotification(`New message from ${sender}`, {
      body: message.length > 50 ? message.substring(0, 50) + '...' : message,
      tag: `msg_${conversationId}`,
      onClick: () => {
        window.location.href = `/messages?conversation=${conversationId}`;
      }
    });
  }
}

export default new NotificationManager();
