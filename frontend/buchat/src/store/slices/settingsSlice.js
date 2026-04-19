/**
 * Settings Slice - User preferences and app settings
 */
import { createSlice } from '@reduxjs/toolkit';

// Load persisted settings
const loadPersistedSettings = () => {
  try {
    const stored = localStorage.getItem('buchat_settings');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Failed to load persisted settings:', err);
  }
  return {};
};

const persistedSettings = loadPersistedSettings();

const initialState = {
  // Video quality settings
  videoQuality: persistedSettings.videoQuality || 'auto',
  
  // Audio settings
  audioSettings: persistedSettings.audioSettings || {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    quality: 'high',
  },
  
  // Theme settings
  theme: persistedSettings.theme || 'system', // 'light', 'dark', 'system'
  chatBackground: 'default',
  
  // Notification settings
  notifications: persistedSettings.notifications || {
    enabled: true,
    sound: true,
    vibration: true,
    preview: true,
    muteUntil: null,
  },
  
  // Privacy settings
  privacy: {
    readReceipts: true,
    onlineStatus: true,
    typingIndicator: true,
    lastSeen: 'everyone', // 'everyone', 'contacts', 'nobody'
  },
  
  // Media settings
  media: {
    autoDownload: {
      images: true,
      videos: false,
      documents: false,
      audio: true,
    },
    imageCompression: 'balanced', // 'low', 'balanced', 'high', 'original'
    videoCompression: 'balanced',
  },
  
  // Accessibility
  accessibility: {
    fontSize: 'medium', // 'small', 'medium', 'large', 'xlarge'
    highContrast: false,
    reduceMotion: false,
  },
  
  // Network preferences
  network: {
    useCellularForCalls: true,
    useCellularForMedia: false,
    dataSaverMode: false,
    proxyEnabled: false,
    proxyUrl: '',
  },
  
  // Storage management
  storage: {
    autoDeleteAfter: null, // days, null = never
    cacheSize: 0,
    lastCleared: null,
  },
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // Video quality
    setVideoQuality: (state, action) => {
      state.videoQuality = action.payload;
    },
    
    // Audio settings
    updateAudioSettings: (state, action) => {
      state.audioSettings = { ...state.audioSettings, ...action.payload };
    },
    
    // Theme
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    
    setChatBackground: (state, action) => {
      state.chatBackground = action.payload;
    },
    
    // Notifications
    updateNotifications: (state, action) => {
      state.notifications = { ...state.notifications, ...action.payload };
    },
    
    muteNotifications: (state, action) => {
      const duration = action.payload; // in minutes, null to unmute
      state.notifications.muteUntil = duration 
        ? Date.now() + (duration * 60 * 1000) 
        : null;
    },
    
    // Privacy
    updatePrivacy: (state, action) => {
      state.privacy = { ...state.privacy, ...action.payload };
    },
    
    // Media
    updateMediaSettings: (state, action) => {
      state.media = { ...state.media, ...action.payload };
    },
    
    updateAutoDownload: (state, action) => {
      state.media.autoDownload = { ...state.media.autoDownload, ...action.payload };
    },
    
    // Accessibility
    updateAccessibility: (state, action) => {
      state.accessibility = { ...state.accessibility, ...action.payload };
    },
    
    // Network
    updateNetwork: (state, action) => {
      state.network = { ...state.network, ...action.payload };
    },
    
    toggleDataSaver: (state) => {
      state.network.dataSaverMode = !state.network.dataSaverMode;
      if (state.network.dataSaverMode) {
        // Enable data saver settings
        state.videoQuality = '360p';
        state.media.autoDownload = {
          images: true,
          videos: false,
          documents: false,
          audio: true,
        };
        state.media.imageCompression = 'high';
        state.media.videoCompression = 'high';
      }
    },
    
    // Storage
    updateStorage: (state, action) => {
      state.storage = { ...state.storage, ...action.payload };
    },
    
    clearCache: (state) => {
      state.storage.cacheSize = 0;
      state.storage.lastCleared = Date.now();
    },
    
    // Reset all settings
    resetSettings: () => initialState,
  },
});

export const {
  setVideoQuality,
  updateAudioSettings,
  setTheme,
  setChatBackground,
  updateNotifications,
  muteNotifications,
  updatePrivacy,
  updateMediaSettings,
  updateAutoDownload,
  updateAccessibility,
  updateNetwork,
  toggleDataSaver,
  updateStorage,
  clearCache,
  resetSettings,
} = settingsSlice.actions;

export default settingsSlice.reducer;

// Selectors
export const selectVideoQuality = (state) => state.settings.videoQuality;
export const selectAudioSettings = (state) => state.settings.audioSettings;
export const selectTheme = (state) => state.settings.theme;
export const selectNotifications = (state) => state.settings.notifications;
export const selectPrivacy = (state) => state.settings.privacy;
export const selectMedia = (state) => state.settings.media;
export const selectAccessibility = (state) => state.settings.accessibility;
export const selectNetwork = (state) => state.settings.network;
export const selectIsDataSaverEnabled = (state) => state.settings.network.dataSaverMode;
