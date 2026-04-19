import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { socialService } from '../../services/socialService';
import './StatusViewer.css';

const StatusViewer = ({ statuses, initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const currentStatus = statuses[currentIndex];
  const DURATION = 5000;

  useEffect(() => {
    if (!currentStatus || isPaused) return;

    if (!currentStatus.hasViewed && !currentStatus.isOwn) {
      socialService.viewStatus(currentStatus.statusId, currentStatus.userId).catch(console.error);
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / (DURATION / 50));
        return newProgress >= 100 ? 100 : newProgress;
      });
    }, 50);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isPaused]);

  useEffect(() => {
    if (progress >= 100) {
      if (currentIndex < statuses.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setProgress(0);
      } else {
        onClose();
      }
    }
  }, [progress, currentIndex, statuses.length, onClose]);

  const handleNext = () => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    }
  };

  if (!currentStatus) return null;

  return (
    <motion.div className="status-viewer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <div className="status-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="status-progress-bars">
          {statuses.map((_, idx) => (
            <div key={idx} className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%' }} />
            </div>
          ))}
        </div>

        <div className="status-header">
          <div className="status-user-info">
            <img src={currentStatus.user?.avatar || `https://ui-avatars.com/api/?name=${currentStatus.user?.username || 'User'}&background=6366f1&color=fff&size=40`} alt="" />
            <div>
              <div className="status-username">{currentStatus.user?.displayName || currentStatus.user?.username}</div>
              <div className="status-time">{new Date(currentStatus.createdAt).toLocaleTimeString()}</div>
            </div>
          </div>
          <button className="status-close-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="status-media" onMouseDown={() => setIsPaused(true)} onMouseUp={() => setIsPaused(false)} onTouchStart={() => setIsPaused(true)} onTouchEnd={() => setIsPaused(false)}>
          {currentStatus.mediaType === 'video' ? <video src={currentStatus.mediaUrl} autoPlay muted loop /> : <img src={currentStatus.mediaUrl} alt="" />}
        </div>

        {currentStatus.caption && <div className="status-caption">{currentStatus.caption}</div>}

        {currentIndex > 0 && <button className="status-nav-btn prev" onClick={handlePrev}><ChevronLeft size={32} /></button>}
        {currentIndex < statuses.length - 1 && <button className="status-nav-btn next" onClick={handleNext}><ChevronRight size={32} /></button>}
      </div>
    </motion.div>
  );
};

export default StatusViewer;
