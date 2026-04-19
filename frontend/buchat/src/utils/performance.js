/**
 * Performance Utilities
 * Industry-standard performance optimizations for React applications
 */

/**
 * Debounce function with immediate execution option
 */
export const debounce = (func, wait, immediate = false) => {
  let timeout;
  
  return function executedFunction(...args) {
    const context = this;
    
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func.apply(context, args);
  };
};

/**
 * Throttle function with trailing call option
 */
export const throttle = (func, limit, { leading = true, trailing = true } = {}) => {
  let lastFunc;
  let lastRan;
  
  return function executedFunction(...args) {
    const context = this;
    
    if (!lastRan && leading) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, trailing ? limit - (Date.now() - lastRan) : limit);
    }
  };
};

/**
 * Request Animation Frame throttle for smooth UI updates
 */
export const rafThrottle = (callback) => {
  let requestId = null;
  
  return function throttled(...args) {
    if (requestId === null) {
      requestId = requestAnimationFrame(() => {
        callback.apply(this, args);
        requestId = null;
      });
    }
  };
};

/**
 * Memoize function results
 */
export const memoize = (fn, keyResolver) => {
  const cache = new Map();
  
  return function memoized(...args) {
    const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = fn.apply(this, args);
    cache.set(key, result);
    
    return result;
  };
};

/**
 * LRU Cache for limited memory usage
 */
export class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }
  
  has(key) {
    return this.cache.has(key);
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  get size() {
    return this.cache.size;
  }
}

/**
 * Batch multiple function calls into one
 */
export const batchCalls = (fn, delay = 16) => {
  let batch = [];
  let timeout = null;
  
  return function batched(...args) {
    batch.push(args);
    
    if (!timeout) {
      timeout = setTimeout(() => {
        const currentBatch = batch;
        batch = [];
        timeout = null;
        fn(currentBatch);
      }, delay);
    }
  };
};

/**
 * Lazy load images with IntersectionObserver
 */
export const createImageObserver = (options = {}) => {
  const {
    rootMargin = '50px',
    threshold = 0.1,
    onLoad,
    onError
  } = options;
  
  if (typeof IntersectionObserver === 'undefined') {
    return null;
  }
  
  return new IntersectionObserver(
    (entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;
          
          if (src) {
            img.src = src;
            img.onload = () => {
              img.classList.add('loaded');
              onLoad?.(img);
            };
            img.onerror = () => {
              img.classList.add('error');
              onError?.(img);
            };
          }
          
          observer.unobserve(img);
        }
      });
    },
    { rootMargin, threshold }
  );
};

/**
 * Virtual scroll helper
 */
export const calculateVisibleItems = (
  scrollTop,
  containerHeight,
  itemHeight,
  totalItems,
  overscan = 3
) => {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    totalItems - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  return {
    startIndex,
    endIndex,
    visibleCount: endIndex - startIndex + 1,
    offsetTop: startIndex * itemHeight,
    totalHeight: totalItems * itemHeight
  };
};

/**
 * Measure render performance
 */
export const measureRender = (componentName) => {
  if (process.env.NODE_ENV !== 'development') {
    return { start: () => {}, end: () => {} };
  }
  
  let startTime;
  
  return {
    start: () => {
      startTime = performance.now();
    },
    end: () => {
      const duration = performance.now() - startTime;
      if (duration > 16) {
        console.warn(`[Performance] ${componentName} took ${duration.toFixed(2)}ms to render`);
      }
    }
  };
};

/**
 * Idle callback wrapper with fallback
 */
export const requestIdleCallback = 
  window.requestIdleCallback || 
  ((cb) => setTimeout(cb, 1));

export const cancelIdleCallback = 
  window.cancelIdleCallback || 
  ((id) => clearTimeout(id));

/**
 * Schedule low-priority work during idle time
 */
export const scheduleIdleWork = (tasks, { timeout = 1000, onComplete } = {}) => {
  let index = 0;
  
  const processNextTask = (deadline) => {
    while (index < tasks.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
      tasks[index]();
      index++;
    }
    
    if (index < tasks.length) {
      requestIdleCallback(processNextTask, { timeout });
    } else {
      onComplete?.();
    }
  };
  
  requestIdleCallback(processNextTask, { timeout });
};

/**
 * Check if browser supports certain APIs
 */
export const browserSupport = {
  webGL: (() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  })(),
  webP: (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  })(),
  serviceWorker: 'serviceWorker' in navigator,
  pushNotifications: 'PushManager' in window,
  webRTC: !!(
    window.RTCPeerConnection || 
    window.mozRTCPeerConnection || 
    window.webkitRTCPeerConnection
  ),
  indexedDB: !!window.indexedDB,
  webWorker: !!window.Worker,
  sharedWorker: !!window.SharedWorker,
  intersectionObserver: 'IntersectionObserver' in window,
  resizeObserver: 'ResizeObserver' in window,
  mutationObserver: 'MutationObserver' in window,
  pictureInPicture: 'pictureInPictureEnabled' in document,
  bluetooth: 'bluetooth' in navigator,
  share: 'share' in navigator,
  clipboard: 'clipboard' in navigator,
  vibrate: 'vibrate' in navigator,
  mediaSession: 'mediaSession' in navigator,
  wakeLock: 'wakeLock' in navigator
};

/**
 * Network Information API helper
 */
export const getNetworkInfo = () => {
  const connection = navigator.connection || 
    navigator.mozConnection || 
    navigator.webkitConnection;
  
  if (!connection) {
    return { type: 'unknown', effectiveType: 'unknown', saveData: false };
  }
  
  return {
    type: connection.type,
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData
  };
};

/**
 * Preload resources
 */
export const preloadResource = (url, type = 'fetch') => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  link.as = type;
  document.head.appendChild(link);
  
  return () => link.remove();
};

/**
 * Prefetch pages for faster navigation
 */
export const prefetchPage = (url) => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  document.head.appendChild(link);
  
  return () => link.remove();
};

export default {
  debounce,
  throttle,
  rafThrottle,
  memoize,
  LRUCache,
  batchCalls,
  createImageObserver,
  calculateVisibleItems,
  measureRender,
  requestIdleCallback,
  cancelIdleCallback,
  scheduleIdleWork,
  browserSupport,
  getNetworkInfo,
  preloadResource,
  prefetchPage
};
