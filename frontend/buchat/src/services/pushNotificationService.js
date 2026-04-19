import api from './api';

class PushNotificationService {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.registration = null;
    this.subscription = null;
  }

  // Initialize push notifications
  async init() {
    if (!this.isSupported) {
      console.log('Push notifications not supported');
      return false;
    }

    try {
      // Register service worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('✅ Service Worker registered');

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('✅ Service Worker ready');

      return true;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      return false;
    }
  }

  // Request notification permission
  async requestPermission() {
    if (!this.isSupported) return false;

    try {
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);
      return permission === 'granted';
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  // Subscribe to push notifications
  async subscribe() {
    if (!this.isSupported || !this.registration) {
      console.log('Cannot subscribe: not supported or not registered');
      return null;
    }

    try {
      // Get VAPID public key from backend
      const vapidResponse = await api.get('/notifications/vapid-key');
      const vapidPublicKey = vapidResponse.data.publicKey;

      if (!vapidPublicKey) {
        console.error('No VAPID public key available');
        return null;
      }

      // Convert VAPID key to Uint8Array
      const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);

      // Subscribe to push
      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      console.log('✅ Push subscription created');

      // Send subscription to backend
      await this.sendSubscriptionToServer(this.subscription);

      return this.subscription;
    } catch (error) {
      console.error('❌ Push subscription failed:', error);
      return null;
    }
  }

  // Send subscription to backend
  async sendSubscriptionToServer(subscription) {
    try {
      await api.post('/notifications/subscribe', {
        subscription: subscription.toJSON()
      });
      console.log('✅ Subscription sent to server');
      return true;
    } catch (error) {
      console.error('❌ Failed to send subscription to server:', error);
      return false;
    }
  }

  // Unsubscribe from push notifications
  async unsubscribe() {
    if (!this.subscription) {
      this.subscription = await this.getSubscription();
    }

    if (this.subscription) {
      try {
        await this.subscription.unsubscribe();
        
        // Notify backend
        await api.post('/notifications/unsubscribe', {
          endpoint: this.subscription.endpoint
        });

        this.subscription = null;
        console.log('✅ Unsubscribed from push notifications');
        return true;
      } catch (error) {
        console.error('❌ Unsubscribe failed:', error);
        return false;
      }
    }
    return true;
  }

  // Get current subscription
  async getSubscription() {
    if (!this.isSupported || !this.registration) return null;

    try {
      return await this.registration.pushManager.getSubscription();
    } catch (error) {
      console.error('Error getting subscription:', error);
      return null;
    }
  }

  // Check if subscribed
  async isSubscribed() {
    const subscription = await this.getSubscription();
    return !!subscription;
  }

  // Show local notification (for testing or when app is focused)
  showLocalNotification(title, options = {}) {
    if (this.registration) {
      this.registration.showNotification(title, {
        icon: '/logo192.png',
        badge: '/logo192.png',
        vibrate: [200, 100, 200],
        ...options
      });
    }
  }

  // Convert VAPID key
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Test push notification (development only)
  async testPush(message = 'Test notification') {
    try {
      await api.post('/notifications/test-push', { message });
      console.log('Test push sent');
      return true;
    } catch (error) {
      console.error('Test push failed:', error);
      return false;
    }
  }
}

// Singleton instance
const pushNotificationService = new PushNotificationService();

export default pushNotificationService;
