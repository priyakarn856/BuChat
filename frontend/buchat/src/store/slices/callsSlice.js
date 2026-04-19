/**
 * Calls Slice - Redux state for audio/video calls
 * Industry-standard WebRTC call management
 */
import { createSlice } from '@reduxjs/toolkit';

// Video quality presets (resolution, bitrate, framerate)
export const VIDEO_QUALITY_PRESETS = {
  '144p': {
    width: 256,
    height: 144,
    frameRate: 15,
    maxBitrate: 100000, // 100 Kbps
    label: '144p - Data Saver',
  },
  '240p': {
    width: 426,
    height: 240,
    frameRate: 20,
    maxBitrate: 200000, // 200 Kbps
    label: '240p - Low',
  },
  '360p': {
    width: 640,
    height: 360,
    frameRate: 24,
    maxBitrate: 400000, // 400 Kbps
    label: '360p - Medium Low',
  },
  '480p': {
    width: 854,
    height: 480,
    frameRate: 24,
    maxBitrate: 750000, // 750 Kbps
    label: '480p - Standard',
  },
  '720p': {
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 1500000, // 1.5 Mbps
    label: '720p - HD',
  },
  '1080p': {
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 4000000, // 4 Mbps
    label: '1080p - Full HD',
  },
  '1440p': {
    width: 2560,
    height: 1440,
    frameRate: 30,
    maxBitrate: 8000000, // 8 Mbps
    label: '1440p - 2K',
  },
  '2160p': {
    width: 3840,
    height: 2160,
    frameRate: 30,
    maxBitrate: 16000000, // 16 Mbps
    label: '2160p - 4K',
  },
  'auto': {
    width: 0, // Adaptive
    height: 0,
    frameRate: 30,
    maxBitrate: 0, // Adaptive bitrate
    label: 'Auto (Adaptive)',
  },
};

// Audio quality presets
export const AUDIO_QUALITY_PRESETS = {
  'low': {
    sampleRate: 22050,
    channelCount: 1,
    maxBitrate: 24000, // 24 Kbps
    label: 'Low (24 Kbps)',
  },
  'medium': {
    sampleRate: 44100,
    channelCount: 1,
    maxBitrate: 64000, // 64 Kbps
    label: 'Medium (64 Kbps)',
  },
  'high': {
    sampleRate: 48000,
    channelCount: 2,
    maxBitrate: 128000, // 128 Kbps
    label: 'High (128 Kbps)',
  },
  'studio': {
    sampleRate: 48000,
    channelCount: 2,
    maxBitrate: 256000, // 256 Kbps
    label: 'Studio (256 Kbps)',
  },
};

const initialState = {
  // Active call state
  activeCall: null, // { callId, recipientId, recipientName, callType, isIncoming, startTime }
  callStatus: 'idle', // 'idle', 'ringing', 'connecting', 'connected', 'ended', 'failed'
  isInCall: false,
  
  // Media streams (non-serializable, stored as refs in component)
  hasLocalStream: false,
  hasRemoteStream: false,
  
  // Media controls
  audioEnabled: true,
  videoEnabled: true,
  speakerEnabled: true,
  isScreenSharing: false,
  
  // Quality settings
  videoQuality: 'auto', // Key from VIDEO_QUALITY_PRESETS
  audioQuality: 'high', // Key from AUDIO_QUALITY_PRESETS
  adaptiveBitrate: true,
  
  // Network stats
  networkStats: {
    bandwidth: 0,
    packetLoss: 0,
    latency: 0,
    jitter: 0,
    resolution: null,
    frameRate: 0,
  },
  
  // Call history
  callHistory: [],
  
  // UI state
  isMinimized: false,
  showQualityMenu: false,
  callDuration: 0,
  
  // Error handling
  error: null,
};

const callsSlice = createSlice({
  name: 'calls',
  initialState,
  reducers: {
    // Start an outgoing call
    initiateCall: (state, action) => {
      const { callId, recipientId, recipientName, callType } = action.payload;
      state.activeCall = {
        callId,
        recipientId,
        recipientName,
        callType,
        isIncoming: false,
        startTime: null,
      };
      state.callStatus = 'ringing';
      state.isInCall = true;
      state.videoEnabled = callType === 'video';
      state.error = null;
    },
    
    // Receive an incoming call
    receiveCall: (state, action) => {
      const { callId, callerId, callerName, callType, offer } = action.payload;
      state.activeCall = {
        callId,
        recipientId: callerId,
        recipientName: callerName,
        callType,
        isIncoming: true,
        offer,
        startTime: null,
      };
      state.callStatus = 'ringing';
      state.isInCall = true;
      state.videoEnabled = callType === 'video';
    },
    
    // Call connected
    callConnected: (state) => {
      state.callStatus = 'connected';
      if (state.activeCall) {
        state.activeCall.startTime = Date.now();
      }
    },
    
    // End call
    endCall: (state, action) => {
      const reason = action.payload?.reason || 'ended';
      
      // Add to history if call was connected
      if (state.activeCall && state.activeCall.startTime) {
        state.callHistory.unshift({
          ...state.activeCall,
          endTime: Date.now(),
          duration: Date.now() - state.activeCall.startTime,
          endReason: reason,
        });
        
        // Keep only last 50 calls in history
        if (state.callHistory.length > 50) {
          state.callHistory = state.callHistory.slice(0, 50);
        }
      }
      
      state.activeCall = null;
      state.callStatus = 'idle';
      state.isInCall = false;
      state.hasLocalStream = false;
      state.hasRemoteStream = false;
      state.audioEnabled = true;
      state.videoEnabled = true;
      state.isScreenSharing = false;
      state.networkStats = initialState.networkStats;
      state.callDuration = 0;
    },
    
    // Toggle audio
    toggleAudio: (state) => {
      state.audioEnabled = !state.audioEnabled;
    },
    
    // Toggle video
    toggleVideo: (state) => {
      state.videoEnabled = !state.videoEnabled;
    },
    
    // Toggle speaker
    toggleSpeaker: (state) => {
      state.speakerEnabled = !state.speakerEnabled;
    },
    
    // Toggle screen sharing
    toggleScreenShare: (state) => {
      state.isScreenSharing = !state.isScreenSharing;
    },
    
    // Set video quality
    setVideoQuality: (state, action) => {
      const quality = action.payload;
      if (VIDEO_QUALITY_PRESETS[quality]) {
        state.videoQuality = quality;
      }
    },
    
    // Set audio quality
    setAudioQuality: (state, action) => {
      const quality = action.payload;
      if (AUDIO_QUALITY_PRESETS[quality]) {
        state.audioQuality = quality;
      }
    },
    
    // Toggle adaptive bitrate
    toggleAdaptiveBitrate: (state) => {
      state.adaptiveBitrate = !state.adaptiveBitrate;
    },
    
    // Update network stats
    updateNetworkStats: (state, action) => {
      state.networkStats = { ...state.networkStats, ...action.payload };
    },
    
    // Set stream availability
    setLocalStream: (state, action) => {
      state.hasLocalStream = action.payload;
    },
    
    setRemoteStream: (state, action) => {
      state.hasRemoteStream = action.payload;
    },
    
    // UI controls
    toggleMinimized: (state) => {
      state.isMinimized = !state.isMinimized;
    },
    
    toggleQualityMenu: (state) => {
      state.showQualityMenu = !state.showQualityMenu;
    },
    
    // Update call duration
    updateCallDuration: (state, action) => {
      state.callDuration = action.payload;
    },
    
    // Set error
    setCallError: (state, action) => {
      state.error = action.payload;
      state.callStatus = 'failed';
    },
    
    // Clear error
    clearCallError: (state) => {
      state.error = null;
    },
  },
});

export const {
  initiateCall,
  receiveCall,
  callConnected,
  endCall,
  toggleAudio,
  toggleVideo,
  toggleSpeaker,
  toggleScreenShare,
  setVideoQuality,
  setAudioQuality,
  toggleAdaptiveBitrate,
  updateNetworkStats,
  setLocalStream,
  setRemoteStream,
  toggleMinimized,
  toggleQualityMenu,
  updateCallDuration,
  setCallError,
  clearCallError,
} = callsSlice.actions;

export default callsSlice.reducer;

// Selectors
export const selectActiveCall = (state) => state.calls.activeCall;
export const selectCallStatus = (state) => state.calls.callStatus;
export const selectIsInCall = (state) => state.calls.isInCall;
export const selectVideoQuality = (state) => state.calls.videoQuality;
export const selectAudioQuality = (state) => state.calls.audioQuality;
export const selectNetworkStats = (state) => state.calls.networkStats;
export const selectCallHistory = (state) => state.calls.callHistory;
export const selectMediaControls = (state) => ({
  audioEnabled: state.calls.audioEnabled,
  videoEnabled: state.calls.videoEnabled,
  speakerEnabled: state.calls.speakerEnabled,
  isScreenSharing: state.calls.isScreenSharing,
});
