import { useState, useRef, useEffect, useCallback } from 'react';
import { callService } from '../services/callService';

// Enhanced ICE configuration with TURN fallback
const getIceServers = () => {
  const servers = [
    // Google's public STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Open STUN servers for redundancy
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voip.blackberry.com:3478' }
  ];
  
  // Add TURN servers if configured (for NAT traversal)
  // These would typically come from your backend
  const turnServer = process.env.REACT_APP_TURN_SERVER;
  const turnUser = process.env.REACT_APP_TURN_USER;
  const turnPass = process.env.REACT_APP_TURN_PASS;
  
  if (turnServer && turnUser && turnPass) {
    servers.push({
      urls: `turn:${turnServer}:3478`,
      username: turnUser,
      credential: turnPass
    });
    servers.push({
      urls: `turn:${turnServer}:3478?transport=tcp`,
      username: turnUser,
      credential: turnPass
    });
  }
  
  return servers;
};

const ICE_SERVERS = {
  iceServers: getIceServers(),
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all', // Use 'relay' to force TURN
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Optimal audio constraints for low latency
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
    latency: 0,
    googEchoCancellation: true,
    googAutoGainControl: true,
    googNoiseSuppression: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true
  },
  video: false
};

// Video constraints with quality presets
// eslint-disable-next-line no-unused-vars
const VIDEO_CONSTRAINTS = {
  low: { width: 320, height: 240, frameRate: 15 },
  medium: { width: 640, height: 480, frameRate: 24 },
  high: { width: 1280, height: 720, frameRate: 30 },
  hd: { width: 1920, height: 1080, frameRate: 30 }
};

export const useWebRTC = (callId, isInitiator, onRemoteStream, onCallEnd) => {
  const [localStream, setLocalStream] = useState(null);
  const [connectionState, setConnectionState] = useState('new');
  const peerConnection = useRef(null);
  const pollingInterval = useRef(null);

  const startLocalStream = useCallback(async (audio = true, video = true) => {
    try {
      const constraints = video ? { audio: AUDIO_CONSTRAINTS.audio, video: true } : AUDIO_CONSTRAINTS;
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply audio optimizations
      stream.getAudioTracks().forEach(track => {
        const settings = track.getSettings();
        console.log('Audio track settings:', settings);
      });
      
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Enable low latency mode
    pc.onicecandidate = async (event) => {
      if (event.candidate && callId) {
        try {
          await callService.exchangeIceCandidate(callId, event.candidate);
        } catch (error) {
          console.error('Error sending ICE candidate:', error);
        }
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        onCallEnd?.();
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [callId, onRemoteStream, onCallEnd]);

  const startCall = useCallback(async (audio = true, video = true) => {
    try {
      const stream = await startLocalStream(audio, video);
      const pc = createPeerConnection();

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create offer with optimal settings for low latency
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: video,
        voiceActivityDetection: true,
        iceRestart: false
      });
      
      await pc.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error('Error starting call:', error);
      throw error;
    }
  }, [startLocalStream, createPeerConnection]);

  const answerCall = useCallback(async (offer, audio = true, video = true) => {
    try {
      const stream = await startLocalStream(audio, video);
      const pc = createPeerConnection();

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create answer with optimal settings
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: video,
        voiceActivityDetection: true
      });
      
      await pc.setLocalDescription(answer);
      return answer;
    } catch (error) {
      console.error('Error answering call:', error);
      throw error;
    }
  }, [startLocalStream, createPeerConnection]);

  const setRemoteAnswer = useCallback(async (answer) => {
    try {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error setting remote answer:', error);
      throw error;
    }
  }, []);

  const pollIceCandidates = useCallback(async () => {
    if (!callId) return;
    try {
      const { candidates } = await callService.getIceCandidates(callId);
      for (const item of candidates) {
        if (peerConnection.current && item.candidate) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(item.candidate));
        }
      }
    } catch (error) {
      console.error('Error polling ICE candidates:', error);
    }
  }, [callId]);

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

  const endCall = useCallback(() => {
    console.log('🔚 Ending call - cleaning up resources');
    
    // Stop all media tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      setLocalStream(null);
    }
    
    // Close peer connection
    if (peerConnection.current) {
      // Remove all transceivers/senders
      peerConnection.current.getSenders().forEach(sender => {
        try {
          peerConnection.current.removeTrack(sender);
        } catch (e) {
          console.log('Could not remove track:', e);
        }
      });
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    // Clear polling interval
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    setConnectionState('closed');
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 useWebRTC unmounting - cleaning up');
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (callId && peerConnection.current) {
      pollingInterval.current = setInterval(pollIceCandidates, 2000);
    }
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [callId, pollIceCandidates]);

  return {
    localStream,
    connectionState,
    startCall,
    answerCall,
    setRemoteAnswer,
    toggleAudio,
    toggleVideo,
    endCall
  };
};
