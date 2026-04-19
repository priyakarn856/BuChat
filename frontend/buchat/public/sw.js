/* eslint-disable no-restricted-globals */

// Service Worker for BuChat - Push Notifications and Offline Support

const CACHE_NAME = 'buchat-v1';
const OFFLINE_URL = '/offline.html';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API requests - always fetch from network
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('execute-api') ||
      event.request.url.includes('amazonaws.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and fetch update in background
        event.waitUntil(
          fetch(event.request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {})
        );
        return cachedResponse;
      }
      
      // Not in cache - fetch from network
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        return null;
      });
    })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'BuChat',
    body: 'You have a new notification',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: 'buchat-notification',
    data: {}
  };
  
  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        ...data,
        title: payload.title || data.title,
        body: payload.body || data.body,
        tag: payload.tag || data.tag,
        data: payload.data || {}
      };
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    vibrate: [200, 100, 200],
    renotify: true,
    data: data.data,
    actions: getActionsForType(data.data?.type)
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Get notification actions based on type
function getActionsForType(type) {
  switch (type) {
    case 'message':
      return [
        { action: 'reply', title: 'Reply' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    case 'call':
      return [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' }
      ];
    case 'follow':
    case 'like':
    case 'comment':
      return [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    default:
      return [];
  }
}

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();
  
  const data = event.notification.data || {};
  let url = '/';
  
  // Handle actions
  switch (event.action) {
    case 'reply':
    case 'view':
      if (data.conversationId) {
        url = `/messages?conversation=${data.conversationId}`;
      } else if (data.postId) {
        url = `/post/${data.postId}`;
      } else if (data.userId) {
        url = `/profile/${data.userId}`;
      }
      break;
    case 'accept':
      if (data.callId) {
        url = `/call/${data.callId}?action=accept`;
      }
      break;
    case 'decline':
    case 'dismiss':
      return; // Just close the notification
    default:
      // Default click - open relevant page
      if (data.type === 'message' && data.conversationId) {
        url = `/messages?conversation=${data.conversationId}`;
      } else if (data.type === 'call' && data.callId) {
        url = `/call/${data.callId}`;
      } else if (data.postId) {
        url = `/post/${data.postId}`;
      }
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

// Background sync for offline messages
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'send-messages') {
    event.waitUntil(sendQueuedMessages());
  }
});

// Send queued messages when back online
async function sendQueuedMessages() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('messageQueue', 'readonly');
    const store = tx.objectStore('messageQueue');
    const messages = await getAllFromStore(store);
    
    for (const message of messages) {
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${message.token}`
          },
          body: JSON.stringify(message.data)
        });
        
        // Remove from queue on success
        const deleteTx = db.transaction('messageQueue', 'readwrite');
        deleteTx.objectStore('messageQueue').delete(message.id);
      } catch (e) {
        console.error('[SW] Failed to send queued message:', e);
      }
    }
  } catch (e) {
    console.error('[SW] Error processing message queue:', e);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('buchat-sw', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('messageQueue')) {
        db.createObjectStore('messageQueue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Periodic background sync for notifications (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-notifications') {
    event.waitUntil(checkForNewNotifications());
  }
});

async function checkForNewNotifications() {
  // This would poll the server for new notifications
  // Implementation depends on your notification API
  console.log('[SW] Checking for new notifications...');
}

console.log('[SW] Service Worker loaded');
