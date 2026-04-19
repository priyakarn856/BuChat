/**
 * Enhanced WebRTC Hook with Adaptive Bitrate and Quality Controls
 * Industry-standard video calling with full quality settings
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { callService } from '../services/callService';
import {
  VIDEO_QUALITY_PRESETS,
  AUDIO_QUALITY_PRESETS,
  updateNetworkStats,
  setLocalStream,
  setRemoteStream,
} from '../store/slices/callsSlice';

// Free TURN servers (Metered.ca free tier)
const FREE_TURN_SERVERS = [
  {
    urls: 'stun:stun.l.google.com:19302',
  },
  {
    urls: 'stun:stun1.l.google.com:19302',
  },
  {
    urls: 'stun:stun2.l.google.com:19302',
  },
  {
    urls: 'stun:stun3.l.google.com:19302',
  },
  {
    urls: 'stun:stun4.l.google.com:19302',
  },
  // Open STUN servers
  {
    urls: 'stun:stun.stunprotocol.org:3478',
  },
  // Twilio's free STUN
  {
    urls: 'stun:global.stun.twilio.com:3478',
  },
];

// Get ICE configuration with optional TURN
const getIceConfiguration = (turnCredentials = null) => {
  const config = {
    iceServers: [...FREE_TURN_SERVERS],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
  };

  // Add TURN servers if credentials are provided
  if (turnCredentials) {
    config.iceServers.push({
      urls: `turn:${turnCredentials.server}:3478`,
      username: turnCredentials.username,
      credential: turnCredentials.credential,
    });
    config.iceServers.push({
      urls: `turn:${turnCredentials.server}:3478?transport=tcp`,
      username: turnCredentials.username,
      credential: turnCredentials.credential,
    });
  }

  return config;
};

// Codec preferences for optimal quality/compatibility
const CODEC_PREFERENCES = {
  video: ['VP9', 'VP8', 'H264', 'AV1'],
  audio: ['opus', 'PCMU', 'PCMA'],
};

/**
 * Enhanced WebRTC Hook
 */
export const useEnhancedWebRTC = (callId, isInitiator, onRemoteStream, onCallEnd) => {
  const dispatch = useDispatch();
  const videoQuality = useSelector(state => state.settings?.videoQuality || 'auto');
  const audioQuality = useSelector(state => state.settings?.audioSettings?.quality || 'high');
  
  const [localStream, setLocalStreamState] = useState(null);
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [signalingState, setSignalingState] = useState('stable');
  
  const peerConnection = useRef(null);
  const statsInterval = useRef(null);
  const candidateQueue = useRef([]);
  const bitrateController = useRef(null);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    dispatch(setLocalStream(false));
    dispatch(setRemoteStream(false));
  }, [localStream, dispatch]);

  /**
   * Get video constraints based on quality preset
   */
  const getVideoConstraints = useCallback((qualityKey = 'auto') => {
    const preset = VIDEO_QUALITY_PRESETS[qualityKey] || VIDEO_QUALITY_PRESETS['auto'];
    
    if (qualityKey === 'auto') {
      // For auto, let the browser decide with some guidelines
      return {
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        frameRate: { min: 15, ideal: 30, max: 60 },
        facingMode: 'user',
      };
    }
    
    return {
      width: { exact: preset.width },
      height: { exact: preset.height },
      frameRate: { ideal: preset.frameRate, max: preset.frameRate },
      facingMode: 'user',
    };
  }, []);

  /**
   * Get audio constraints based on quality preset
   */
  const getAudioConstraints = useCallback((qualityKey = 'high') => {
    const preset = AUDIO_QUALITY_PRESETS[qualityKey] || AUDIO_QUALITY_PRESETS['high'];
    
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: preset.sampleRate,
      channelCount: preset.channelCount,
      latency: 0,
      // Chrome-specific optimizations
      googEchoCancellation: true,
      googAutoGainControl: true,
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
      googAudioMirroring: false,
    };
  }, []);

  /**
   * Start local media stream
   */
  const startLocalStream = useCallback(async (audio = true, video = true) => {
    try {
      const constraints = {
        audio: audio ? getAudioConstraints(audioQuality) : false,
        video: video ? getVideoConstraints(videoQuality) : false,
      };

      console.log('📹 Requesting media with constraints:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log track info
      stream.getTracks().forEach(track => {
        console.log(`✅ Got ${track.kind} track:`, track.getSettings());
      });
      
      setLocalStreamState(stream);
      dispatch(setLocalStream(true));
      
      return stream;
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      
      // Try with fallback constraints
      if (video && error.name === 'OverconstrainedError') {
        console.log('🔄 Retrying with lower quality...');
        const fallbackConstraints = {
          audio: audio ? true : false,
          video: video ? { facingMode: 'user' } : false,
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        setLocalStreamState(stream);
        dispatch(setLocalStream(true));
        return stream;
      }
      
      throw error;
    }
  }, [audioQuality, videoQuality, getAudioConstraints, getVideoConstraints, dispatch]);

  /**
   * Create peer connection with enhanced configuration
   */
  const createPeerConnection = useCallback(async () => {
    // Get TURN credentials if available (from backend)
    let turnCredentials = null;
    try {
      const turnResponse = await callService.getTurnCredentials?.();
      if (turnResponse?.credentials) {
        turnCredentials = turnResponse.credentials;
      }
    } catch (err) {
      console.warn('⚠️ Could not get TURN credentials, using STUN only');
    }

    const config = getIceConfiguration(turnCredentials);
    console.log('🔧 Creating peer connection with config:', config);
    
    const pc = new RTCPeerConnection(config);

    // ICE candidate handling
    pc.onicecandidate = async (event) => {
      if (event.candidate && callId) {
        console.log('🧊 ICE candidate:', event.candidate.type);
        try {
          await callService.exchangeIceCandidate(callId, event.candidate);
        } catch (error) {
          console.error('❌ Error sending ICE candidate:', error);
        }
      }
    };

    // Remote track handling
    pc.ontrack = (event) => {
      console.log('📥 Remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);
        dispatch(setRemoteStream(true));
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log('🔌 Connection state:', pc.connectionState);
      setConnectionState(pc.connectionState);
      
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        onCallEnd?.();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state:', pc.iceConnectionState);
      setIceConnectionState(pc.iceConnectionState);
    };

    pc.onsignalingstatechange = () => {
      console.log('📡 Signaling state:', pc.signalingState);
      setSignalingState(pc.signalingState);
    };

    // Start stats collection
    startStatsCollection(pc);

    peerConnection.current = pc;
    return pc;
  }, [callId, onRemoteStream, onCallEnd, dispatch]);

  /**
   * Start collecting WebRTC stats for quality monitoring
   */
  const startStatsCollection = useCallback((pc) => {
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
    }

    let lastBytesReceived = 0;
    let lastBytesSent = 0;
    let lastTimestamp = Date.now();

    statsInterval.current = setInterval(async () => {
      if (!pc || pc.connectionState !== 'connected') return;

      try {
        const stats = await pc.getStats();
        let inboundStats = null;
        let outboundStats = null;
        let candidatePair = null;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            inboundStats = report;
          } else if (report.type === 'outbound-rtp' && report.kind === 'video') {
            outboundStats = report;
          } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            candidatePair = report;
          }
        });

        const now = Date.now();
        const timeDiff = (now - lastTimestamp) / 1000;

        const networkStats = {
          latency: candidatePair?.currentRoundTripTime 
            ? Math.round(candidatePair.currentRoundTripTime * 1000) 
            : 0,
          jitter: inboundStats?.jitter 
            ? Math.round(inboundStats.jitter * 1000) 
            : 0,
          packetLoss: inboundStats?.packetsLost 
            ? (inboundStats.packetsLost / (inboundStats.packetsReceived + inboundStats.packetsLost)) * 100 
            : 0,
          resolution: inboundStats 
            ? `${inboundStats.frameWidth}x${inboundStats.frameHeight}` 
            : null,
          frameRate: inboundStats?.framesPerSecond || 0,
        };

        // Calculate bandwidth
        if (inboundStats?.bytesReceived) {
          const bytesReceivedDiff = inboundStats.bytesReceived - lastBytesReceived;
          networkStats.downloadBandwidth = Math.round((bytesReceivedDiff * 8) / timeDiff / 1000); // kbps
          lastBytesReceived = inboundStats.bytesReceived;
        }

        if (outboundStats?.bytesSent) {
          const bytesSentDiff = outboundStats.bytesSent - lastBytesSent;
          networkStats.uploadBandwidth = Math.round((bytesSentDiff * 8) / timeDiff / 1000); // kbps
          lastBytesSent = outboundStats.bytesSent;
        }

        lastTimestamp = now;
        dispatch(updateNetworkStats(networkStats));
        
        // Adaptive bitrate adjustment
        if (bitrateController.current) {
          bitrateController.current.adjustBitrate(networkStats);
        }
      } catch (error) {
        console.error('Error collecting stats:', error);
      }
    }, 2000);
  }, [dispatch]);

  /**
   * Set video quality dynamically during call
   */
  const setVideoQualityDynamic = useCallback(async (qualityKey) => {
    if (!peerConnection.current || !localStream) return;

    const preset = VIDEO_QUALITY_PRESETS[qualityKey];
    if (!preset || qualityKey === 'auto') return;

    const sender = peerConnection.current.getSenders().find(s => s.track?.kind === 'video');
    if (!sender) return;

    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      params.encodings[0].maxBitrate = preset.maxBitrate;
      params.encodings[0].maxFramerate = preset.frameRate;

      await sender.setParameters(params);
      console.log(`✅ Video quality set to ${qualityKey}`);
    } catch (error) {
      console.error('❌ Error setting video quality:', error);
    }
  }, [localStream]);

  /**
   * Start outgoing call
   */
  const startCall = useCallback(async (audio = true, video = true) => {
    try {
      const stream = await startLocalStream(audio, video);
      const pc = await createPeerConnection();

      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        console.log(`➕ Adding ${track.kind} track to peer connection`);
        pc.addTrack(track, stream);
      });

      // Set initial video quality
      await setVideoQualityDynamic(videoQuality);

      // Create offer with optimal settings
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: video,
        voiceActivityDetection: true,
        iceRestart: false,
      });

      await pc.setLocalDescription(offer);
      console.log('📤 Created offer');
      
      return offer;
    } catch (error) {
      console.error('❌ Error starting call:', error);
      throw error;
    }
  }, [startLocalStream, createPeerConnection, setVideoQualityDynamic, videoQuality]);

  /**
   * Answer incoming call
   */
  const answerCall = useCallback(async (offer, audio = true, video = true) => {
    try {
      const stream = await startLocalStream(audio, video);
      const pc = await createPeerConnection();

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Process any queued candidates
      for (const candidate of candidateQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      candidateQueue.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      console.log('📤 Created answer');
      return answer;
    } catch (error) {
      console.error('❌ Error answering call:', error);
      throw error;
    }
  }, [startLocalStream, createPeerConnection]);

  /**
   * Set remote answer (for caller)
   */
  const setRemoteAnswer = useCallback(async (answer) => {
    if (!peerConnection.current) return;

    try {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ Remote answer set');

      // Process any queued candidates
      for (const candidate of candidateQueue.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
      candidateQueue.current = [];
    } catch (error) {
      console.error('❌ Error setting remote answer:', error);
      throw error;
    }
  }, []);

  /**
   * Add ICE candidate
   */
  const addIceCandidate = useCallback(async (candidate) => {
    if (!peerConnection.current || !peerConnection.current.remoteDescription) {
      // Queue candidate if remote description not set yet
      candidateQueue.current.push(candidate);
      return;
    }

    try {
      await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }, []);

  /**
   * Toggle audio track
   */
  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  /**
   * Toggle video track
   */
  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  /**
   * Start screen sharing
   */
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        },
        audio: true,
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnection.current?.getSenders().find(s => s.track?.kind === 'video');

      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
        
        // Handle screen share end
        videoTrack.onended = async () => {
          // Switch back to camera
          if (localStream) {
            const cameraTrack = localStream.getVideoTracks()[0];
            if (cameraTrack && sender) {
              await sender.replaceTrack(cameraTrack);
            }
          }
        };

        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error starting screen share:', error);
      return false;
    }
  }, [localStream]);

  /**
   * Stop screen sharing
   */
  const stopScreenShare = useCallback(async () => {
    if (localStream && peerConnection.current) {
      const cameraTrack = localStream.getVideoTracks()[0];
      const sender = peerConnection.current.getSenders().find(s => s.track?.kind === 'video');

      if (sender && cameraTrack) {
        await sender.replaceTrack(cameraTrack);
        return true;
      }
    }
    return false;
  }, [localStream]);

  /**
   * End call and cleanup
   */
  const endCall = useCallback(() => {
    cleanup();
  }, [cleanup]);

  /**
   * Switch camera (front/back on mobile)
   */
  const switchCamera = useCallback(async () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        const newFacingMode = settings.facingMode === 'user' ? 'environment' : 'user';
        
        videoTrack.stop();
        
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode },
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        localStream.removeTrack(videoTrack);
        localStream.addTrack(newVideoTrack);
        
        const sender = peerConnection.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
        
        return true;
      }
    }
    return false;
  }, [localStream]);

  return {
    localStream,
    connectionState,
    iceConnectionState,
    signalingState,
    startCall,
    answerCall,
    setRemoteAnswer,
    addIceCandidate,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    switchCamera,
    setVideoQuality: setVideoQualityDynamic,
    endCall,
  };
};

export default useEnhancedWebRTC;
