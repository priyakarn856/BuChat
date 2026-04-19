import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, X, Send, Trash2 } from 'lucide-react';
import './VoiceRecorder.css';

const VoiceRecorder = ({ onSend, onCancel }) => {
  const [isRecording, setIsRecording] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [pausedDuration, setPausedDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioLevels, setAudioLevels] = useState(Array(40).fill(0));
  const [recordedLevels, setRecordedLevels] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const isPausedRef = useRef(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const previewAudioRef = useRef(null);
  const allRecordedLevelsRef = useRef([]);

  useEffect(() => {
    // Clear any existing timers first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    startRecording();
    
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Setup audio analysis
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 128;
      
      // Start visualizing
      visualize();
      
      // Setup recorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Calculate average waveform from all recorded levels
        const avgLevels = Array(40).fill(0);
        const totalFrames = allRecordedLevelsRef.current.length;
        
        if (totalFrames > 0) {
          for (let i = 0; i < 40; i++) {
            let sum = 0;
            for (let frame of allRecordedLevelsRef.current) {
              sum += frame[i] || 0;
            }
            avgLevels[i] = sum / totalFrames;
          }
        }
        
        setRecordedLevels(avgLevels);
        setAudioLevels(avgLevels);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Clear any existing timer before creating new one
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      timerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          setDuration(prev => prev + 1);
        }
      }, 1000);
    } catch (error) {
      console.error('Microphone access denied:', error);
      onCancel();
    }
  };

  const visualize = () => {
    if (!analyserRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const updateLevels = () => {
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const levels = [];
      const step = Math.floor(bufferLength / 40);
      
      for (let i = 0; i < 40; i++) {
        const start = i * step;
        const end = start + step;
        let sum = 0;
        for (let j = start; j < end && j < bufferLength; j++) {
          sum += dataArray[j];
        }
        const avg = sum / step;
        levels.push(Math.min(avg / 255, 1));
      }
      
      allRecordedLevelsRef.current.push([...levels]);
      setAudioLevels(levels);
      animationFrameRef.current = requestAnimationFrame(updateLevels);
    };
    
    updateLevels();
  };

  const stopRecording = () => {
    const state = mediaRecorderRef.current?.state;
    if (mediaRecorderRef.current && (state === 'recording' || state === 'paused')) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const handlePauseResume = () => {
    if (isPaused) {
      // Resume recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        isPausedRef.current = false;
        setIsPaused(false);
        mediaRecorderRef.current.resume();
      }
    } else {
      // Pause recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        isPausedRef.current = true;
        setIsPaused(true);
        mediaRecorderRef.current.pause();
      }
    }
  };

  const togglePlayback = () => {
    if (!previewAudioRef.current) return;
    
    if (isPlaying) {
      previewAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (duration < 1) return;
    
    if (isRecording) {
      stopRecording();
      setIsPreviewing(true);
      return;
    }
    
    if (audioBlob) {
      const file = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      Object.assign(file, { 
        messageType: 'voice',
        voiceDuration: duration,
        voiceWaveform: recordedLevels.length > 0 ? recordedLevels : audioLevels
      });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      cleanup();
      onSend(file);
    }
  };

  const handleCancel = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    cleanup();
    onCancel();
  };

  useEffect(() => {
    if (audioUrl && previewAudioRef.current) {
      previewAudioRef.current.onended = () => setIsPlaying(false);
    }
  }, [audioUrl]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      className="voice-recorder-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="voice-recorder-container"
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
      >
        <button className="voice-cancel-btn" onClick={handleCancel}>
          <X size={24} />
        </button>

        {isRecording ? (
          <>
            <div className="voice-recording-indicator">
              <motion.div 
                className="voice-pulse"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Mic size={32} />
              </motion.div>
              
              <div className="voice-waveform-animation">
                {audioLevels.map((level, i) => {
                  const height = 8 + (level * 50);
                  return (
                    <div
                      key={i}
                      className="wave-bar-anim"
                      style={{ height: `${height}px` }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="voice-duration">{formatTime(duration)}</div>

            <div className="voice-actions">
              <motion.button 
                className="voice-delete-btn"
                onClick={handleCancel}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Trash2 size={24} />
              </motion.button>

              <motion.button 
                className={`voice-pause-btn ${isPaused ? 'paused' : ''}`}
                onClick={handlePauseResume}
                disabled={duration < 1}
                whileHover={{ scale: duration >= 1 ? 1.1 : 1 }}
                whileTap={{ scale: duration >= 1 ? 0.9 : 1 }}
              >
                {isPaused ? (
                  <div className="resume-icon">
                    <div className="play-triangle" />
                  </div>
                ) : (
                  <div className="pause-icon-rec">
                    <div /><div />
                  </div>
                )}
              </motion.button>

              <motion.button 
                className="voice-done-btn"
                onClick={() => {
                  stopRecording();
                  setIsPreviewing(true);
                }}
                disabled={duration < 1}
                whileHover={{ scale: duration >= 1 ? 1.1 : 1 }}
                whileTap={{ scale: duration >= 1 ? 0.9 : 1 }}
              >
                <Send size={20} fill="currentColor" />
              </motion.button>
            </div>

            <p className="voice-hint">{isPaused ? 'Paused - Tap to resume' : 'Recording...'}</p>
          </>
        ) : (
          <>
            <div className="voice-preview-section">
              <motion.button
                className="voice-play-preview"
                onClick={togglePlayback}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isPlaying ? (
                  <div className="pause-icon">
                    <div /><div />
                  </div>
                ) : (
                  <div className="play-icon" />
                )}
              </motion.button>
              
              <div className="voice-waveform-preview">
                {recordedLevels.length > 0 ? recordedLevels.map((level, i) => {
                  const height = 8 + (level * 50);
                  return (
                    <div
                      key={i}
                      className="wave-bar-preview"
                      style={{ height: `${height}px` }}
                    />
                  );
                }) : audioLevels.map((level, i) => {
                  const height = 8 + (level * 50);
                  return (
                    <div
                      key={i}
                      className="wave-bar-preview"
                      style={{ height: `${height}px` }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="voice-duration">{formatTime(duration)}</div>

            <div className="voice-actions">
              <motion.button 
                className="voice-delete-btn"
                onClick={handleCancel}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Trash2 size={24} />
              </motion.button>

              <motion.button 
                className="voice-send-btn"
                onClick={handleSend}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Send size={24} fill="currentColor" />
              </motion.button>
            </div>

            <p className="voice-hint">Tap play to preview</p>
            
            <audio ref={previewAudioRef} src={audioUrl} hidden />
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

export default VoiceRecorder;
