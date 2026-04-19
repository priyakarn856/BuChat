import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, 
  Play, ChevronUp, ChevronDown, MoreHorizontal, 
  Music, ArrowLeft
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { postService } from '../services/postService';
import { useAuth } from '../contexts/AuthContext';
import HLSVideoPlayer from '../components/media/HLSVideoPlayer';
import './Reels.css';

const Reels = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [reels, setReels] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef(null);
  // eslint-disable-next-line no-unused-vars
  const videoRefs = useRef({});
  const touchStartY = useRef(0);
  const preloadedVideos = useRef(new Set());

  // Preload next video for seamless transitions
  const preloadNextVideo = useCallback((index) => {
    const nextReel = reels[index + 1];
    if (nextReel && !preloadedVideos.current.has(nextReel.postId)) {
      const videoMedia = nextReel.media?.find(m => {
        const url = m.url?.toLowerCase() || '';
        return url.includes('.mp4') || url.includes('.webm') || m.type === 'video';
      });
      if (videoMedia) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = videoMedia.metadata?.hlsManifest || videoMedia.url;
        link.as = 'fetch';
        document.head.appendChild(link);
        preloadedVideos.current.add(nextReel.postId);
      }
    }
  }, [reels]);

  // Trigger preload when index changes
  useEffect(() => {
    preloadNextVideo(currentIndex);
  }, [currentIndex, preloadNextVideo]);

  // Memory-efficient: Only render 3 videos at a time (prev, current, next)
  // eslint-disable-next-line no-unused-vars
  const visibleReels = useMemo(() => {
    const start = Math.max(0, currentIndex - 1);
    const end = Math.min(reels.length, currentIndex + 2);
    return reels.slice(start, end).map((reel, idx) => ({
      ...reel,
      _originalIndex: start + idx
    }));
  }, [reels, currentIndex]);

  // Fetch reels (video posts only) with engagement-based scoring
  const fetchReels = useCallback(async (reset = false) => {
    try {
      if (reset) setLoading(true);

      
      const response = await postService.getFeed('trending', {
        limit: 20,
        userId: user?.userId,
        postType: 'video' // Only get video posts
      });
      
      // Filter to only include posts with video media
      const videoPosts = (response.posts || []).filter(post => 
        post.media?.some(m => {
          const url = m.url?.toLowerCase() || '';
          return url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || 
                 m.type === 'video' || m.metadata?.hlsManifest;
        })
      );
      
      // Industry-standard engagement scoring algorithm
      const scoredPosts = videoPosts.map(post => {
        const hoursSincePost = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
        const decayFactor = Math.pow(0.95, hoursSincePost / 6); // Half-life of ~6 hours
        
        // Engagement score: likes + 2*comments + 3*shares + view velocity
        const engagementScore = (
          (post.voteCount || 0) * 1 +
          (post.commentCount || 0) * 2 +
          (post.shareCount || 0) * 3 +
          (post.viewCount || 0) * 0.1
        ) * decayFactor;
        
        // Boost for HLS content (better quality = better UX)
        const hlsBoost = post.media?.some(m => m.metadata?.hlsManifest) ? 1.2 : 1;
        
        return { ...post, _score: engagementScore * hlsBoost };
      });
      
      // Sort by score with randomization for freshness
      const sortedPosts = scoredPosts.sort((a, b) => {
        const scoreDiff = b._score - a._score;
        // Add slight randomization (±10%) for variety
        return scoreDiff + (Math.random() - 0.5) * Math.abs(scoreDiff) * 0.2;
      });
      
      if (reset) {
        setReels(sortedPosts);
      } else {
        setReels(prev => [...prev, ...sortedPosts]);
      }
      
      setHasMore(videoPosts.length === 20);
    } catch (error) {
      console.error('Error fetching reels:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReels(true);
  }, [fetchReels]);

  // Define handleVote early so it can be used in keyboard handler and double-tap
  const handleVoteRef = useRef(null);
  handleVoteRef.current = async (reel, voteValue) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setReels(prev => prev.map(r => {
      if (r.postId === reel.postId) {
        const wasLiked = r.userVote === 1;
        return {
          ...r,
          userVote: wasLiked ? 0 : 1,
          voteCount: (r.voteCount || 0) + (wasLiked ? -1 : 1)
        };
      }
      return r;
    }));
    try {
      await postService.votePost(reel.postId, user?.userId, voteValue);
    } catch (error) {
      console.error('Vote failed:', error);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      } else if (e.key === 'ArrowDown' && currentIndex < reels.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPaused(prev => !prev);
      } else if (e.key === 'm') {
        setMuted(prev => !prev);
      } else if (e.key === 'Escape') {
        navigate('/');
      } else if (e.key === 'l') {
        // Quick like with 'L' key
        const currentReel = reels[currentIndex];
        if (currentReel) handleVoteRef.current?.(currentReel, 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, reels.length, navigate, reels]);

  // Double-tap to like (industry standard)
  const lastTap = useRef(0);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  
  const handleDoubleTap = useCallback((reel) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - like the video
      if (reel.userVote !== 1) {
        handleVoteRef.current?.(reel, 1);
      }
      setShowLikeAnimation(true);
      setTimeout(() => setShowLikeAnimation(false), 1000);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      // Single tap - toggle pause after delay
      setTimeout(() => {
        if (lastTap.current !== 0 && Date.now() - lastTap.current >= DOUBLE_TAP_DELAY) {
          setPaused(prev => !prev);
        }
      }, DOUBLE_TAP_DELAY);
    }
  }, []);

  // Touch/scroll handling
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;

    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < reels.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (diff < 0 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  // Debounced wheel handler to prevent rapid scrolling
  const wheelTimeout = useRef(null);
  const handleWheel = useCallback((e) => {
    if (wheelTimeout.current) return;
    
    wheelTimeout.current = setTimeout(() => {
      wheelTimeout.current = null;
    }, 300); // 300ms debounce
    
    if (e.deltaY > 0 && currentIndex < reels.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (e.deltaY < 0 && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, reels.length]);

  // Load more when near end
  useEffect(() => {
    if (currentIndex >= reels.length - 3 && hasMore && !loading) {
      fetchReels(false);
    }
  }, [currentIndex, reels.length, hasMore, loading, fetchReels]);

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  // Wrapper for button clicks  
  const handleVote = (reel, voteValue) => handleVoteRef.current?.(reel, voteValue);

  const handleSave = async (reel) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    setReels(prev => prev.map(r => {
      if (r.postId === reel.postId) {
        return { ...r, isSaved: !r.isSaved };
      }
      return r;
    }));

    try {
      if (reel.isSaved) {
        await postService.unsavePost(reel.postId, user.userId);
      } else {
        await postService.savePost(reel.postId, user.userId);
      }
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const handleShare = async (reel) => {
    const url = `${window.location.origin}/post/${reel.postId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: reel.title, url });
      } catch (e) {}
    } else {
      navigator.clipboard.writeText(url);
      // Could show toast here
    }
  };

  if (loading && reels.length === 0) {
    return (
      <div className="reels-page">
        <div className="reels-loading">
          <div className="reels-spinner"></div>
          <span>Loading Reels...</span>
        </div>
      </div>
    );
  }

  if (!loading && reels.length === 0) {
    return (
      <div className="reels-page">
        <div className="reels-empty">
          <Play size={48} />
          <h2>No Reels Yet</h2>
          <p>Be the first to share a video!</p>
          <button onClick={() => navigate('/create-post')} className="create-reel-btn">
            Create Reel
          </button>
        </div>
        <button className="reels-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={24} />
        </button>
      </div>
    );
  }

  return (
    <div 
      className="reels-page" 
      ref={containerRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="reels-header">
        <button className="reels-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={24} />
        </button>
        <h1>Reels</h1>
        <div className="reels-header-right">
          <button 
            className="reels-sound-btn" 
            onClick={() => setMuted(prev => !prev)}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>

      {/* Navigation indicators */}
      <div className="reels-nav-buttons">
        <button 
          className="reel-nav-btn up" 
          onClick={() => currentIndex > 0 && setCurrentIndex(prev => prev - 1)}
          disabled={currentIndex === 0}
        >
          <ChevronUp size={28} />
        </button>
        <button 
          className="reel-nav-btn down" 
          onClick={() => currentIndex < reels.length - 1 && setCurrentIndex(prev => prev + 1)}
          disabled={currentIndex === reels.length - 1}
        >
          <ChevronDown size={28} />
        </button>
      </div>

      {/* Progress indicators */}
      <div className="reels-progress">
        {reels.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((_, idx) => {
          const actualIdx = Math.max(0, currentIndex - 2) + idx;
          return (
            <div 
              key={actualIdx}
              className={`progress-dot ${actualIdx === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(actualIdx)}
            />
          );
        })}
      </div>

      {/* Reels container */}
      <AnimatePresence mode="wait">
        {reels.map((reel, index) => (
          <motion.div
            key={reel.postId}
            className={`reel-item ${index === currentIndex ? 'active' : ''}`}
            initial={{ opacity: 0, y: index > currentIndex ? 100 : -100 }}
            animate={{ 
              opacity: index === currentIndex ? 1 : 0,
              y: index === currentIndex ? 0 : (index > currentIndex ? 100 : -100),
              scale: index === currentIndex ? 1 : 0.9
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ 
              display: Math.abs(index - currentIndex) <= 1 ? 'flex' : 'none',
              zIndex: index === currentIndex ? 10 : 1
            }}
            onClick={() => handleDoubleTap(reel)}
          >
            {/* Video */}
            <div className="reel-video-container">
              {(() => {
                const videoMedia = reel.media?.find(m => {
                  const url = m.url?.toLowerCase() || '';
                  return url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || 
                         m.type === 'video' || m.metadata?.hlsManifest;
                });

                if (!videoMedia) return null;

                if (videoMedia.metadata?.hlsManifest) {
                  return (
                    <HLSVideoPlayer
                      src={videoMedia.metadata.hlsManifest}
                      poster={videoMedia.thumbnail}
                      muted={muted}
                      autoPlay={index === currentIndex && !paused}
                      loop
                      controls={false}
                      className="reel-video"
                    />
                  );
                }

                return (
                  <HLSVideoPlayer
                    src={videoMedia.url}
                    poster={videoMedia.thumbnail}
                    muted={muted}
                    autoPlay={index === currentIndex && !paused}
                    loop
                    controls={false}
                    className="reel-video"
                  />
                );
              })()}

              {/* Double-tap like animation */}
              <AnimatePresence>
                {showLikeAnimation && index === currentIndex && (
                  <motion.div
                    className="reel-like-animation"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                  >
                    <Heart size={100} fill="#ef4444" color="#ef4444" />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Pause overlay */}
              <AnimatePresence>
                {paused && index === currentIndex && (
                  <motion.div
                    className="reel-pause-overlay"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                  >
                    <Play size={64} fill="white" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Gradient overlays */}
              <div className="reel-gradient-top" />
              <div className="reel-gradient-bottom" />
            </div>

            {/* Right sidebar actions */}
            <div className="reel-actions">
              {/* Author avatar */}
              <Link 
                to={`/u/${reel.username || reel.userId}`} 
                className="reel-author-avatar"
                onClick={(e) => e.stopPropagation()}
              >
                {reel.userAvatar ? (
                  <img src={reel.userAvatar} alt={reel.username} />
                ) : (
                  <div className="avatar-placeholder">
                    {(reel.username || reel.userId)?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className="follow-badge">+</div>
              </Link>

              {/* Like */}
              <motion.button 
                className={`reel-action-btn ${reel.userVote === 1 ? 'liked' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleVote(reel, 1); }}
                whileTap={{ scale: 1.3 }}
              >
                <Heart size={28} fill={reel.userVote === 1 ? '#ef4444' : 'none'} />
                <span>{formatNumber(reel.voteCount)}</span>
              </motion.button>

              {/* Comment */}
              <Link 
                to={`/post/${reel.postId}`} 
                className="reel-action-btn"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle size={28} />
                <span>{formatNumber(reel.commentCount)}</span>
              </Link>

              {/* Share */}
              <motion.button 
                className="reel-action-btn"
                onClick={(e) => { e.stopPropagation(); handleShare(reel); }}
                whileTap={{ scale: 1.2, rotate: 15 }}
              >
                <Share2 size={28} />
                <span>Share</span>
              </motion.button>

              {/* Save */}
              <motion.button 
                className={`reel-action-btn ${reel.isSaved ? 'saved' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleSave(reel); }}
                whileTap={{ scale: 1.2 }}
              >
                <Bookmark size={28} fill={reel.isSaved ? 'currentColor' : 'none'} />
              </motion.button>

              {/* More */}
              <button className="reel-action-btn" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal size={28} />
              </button>
            </div>

            {/* Bottom info */}
            <div className="reel-info" onClick={(e) => e.stopPropagation()}>
              <Link to={`/u/${reel.username || reel.userId}`} className="reel-author">
                <span className="author-name">
                  {reel.userDisplayName || reel.username || reel.userId}
                </span>
                <span className="author-username">@{reel.username || reel.userId}</span>
              </Link>

              <p className="reel-caption">
                {reel.title}
                {reel.body && <span className="caption-body"> {reel.body.substring(0, 100)}</span>}
              </p>

              {reel.group && reel.group !== 'global' && (
                <Link to={`/g/${reel.group}`} className="reel-group">
                  <span className="group-icon">
                    {reel.groupIcon ? (
                      <img src={reel.groupIcon} alt={reel.group} />
                    ) : (
                      reel.group[0].toUpperCase()
                    )}
                  </span>
                  <span>{reel.groupDisplayName || reel.group}</span>
                </Link>
              )}

              {/* Audio/Sound */}
              <div className="reel-sound">
                <Music size={14} />
                <div className="sound-name-container">
                  <span className="sound-name-scroll">
                    Original Audio - {reel.username || 'Creator'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Reels;
