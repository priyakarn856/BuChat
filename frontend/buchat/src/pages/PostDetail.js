/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowUp, ArrowDown, MessageCircle, Share2, Bookmark, Eye, 
  MoreHorizontal, ArrowLeft, FileText, Download, ChevronLeft, 
  ChevronRight, X, Maximize2, Reply, User, ChevronDown, ChevronUp,
  Heart, ThumbsUp, Smile, Flag, MoreVertical
} from 'lucide-react';
import { toast } from 'react-toastify';
import Button from '../components/common/Button';
import HLSVideoPlayer from '../components/media/HLSVideoPlayer';
import { postService } from '../services/postService';
import { commentService } from '../services/commentService';
import { useAuth } from '../contexts/AuthContext';
import './PostDetail.css';

// Reaction emoji map
const REACTIONS = {
  like: { emoji: '👍', label: 'Like', color: '#3b82f6' },
  love: { emoji: '❤️', label: 'Love', color: '#ef4444' },
  laugh: { emoji: '😂', label: 'Haha', color: '#f59e0b' },
  wow: { emoji: '😮', label: 'Wow', color: '#f59e0b' },
  sad: { emoji: '😢', label: 'Sad', color: '#f59e0b' },
  angry: { emoji: '😠', label: 'Angry', color: '#ef4444' }
};

const PostDetail = () => {
  const { postId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [userVote, setUserVote] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [commentSort, setCommentSort] = useState('best');
  const [collapsedComments, setCollapsedComments] = useState(new Set());
  const [userCommentVotes, setUserCommentVotes] = useState({});
  const [userReactions, setUserReactions] = useState({});
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  
  const imageRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    fetchPost();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    if (post) {
      const schema = {
        "@context": "https://schema.org",
        "@type": "DiscussionForumPosting",
        "headline": post.title,
        "text": post.body || post.title,
        "datePublished": post.createdAt,
        "author": {
          "@type": "Person",
          "name": post.username,
          "url": `https://buchat.me/u/${post.username}`
        },
        "url": `https://buchat.me/post/${postId}`,
        "interactionStatistic": [
          {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/LikeAction",
            "userInteractionCount": post.score || 0
          },
          {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/CommentAction",
            "userInteractionCount": comments.length
          }
        ]
      };
      
      if (post.group) {
        schema.about = {
          "@type": "Thing",
          "name": post.group,
          "url": `https://buchat.me/c/${post.group}`
        };
      }

      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(schema);
      script.id = 'post-schema';
      document.head.appendChild(script);
      
      document.title = `${post.title} - BuChat`;
      
      return () => {
        const existing = document.getElementById('post-schema');
        if (existing) document.head.removeChild(existing);
      };
    }
  }, [post, comments, postId]);

  useEffect(() => {
    if (showFullscreen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [showFullscreen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const fetchPost = async () => {
    try {
      const data = await postService.getPost(postId);
      setPost(data.post);
      if (user && data.post) {
        setUserVote(data.post.userVoteStatus || 0);
        setIsSaved(data.post.userSaved || false);
      }
    } catch (error) {
      toast.error('Post not found');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const data = await commentService.getPostComments(postId, { sort: commentSort });
      const fetchedComments = data.comments || [];
      setComments(fetchedComments);
      
      // Fetch user's reactions for all comments
      if (user && fetchedComments.length > 0) {
        const commentIds = fetchedComments.map(c => c.commentId);
        try {
          const reactionsData = await commentService.batchGetUserReactions(user.userId, commentIds);
          setUserReactions(reactionsData.userReactions || {});
        } catch (e) {
          // Silently fail - reactions are optional
        }
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  // Refetch comments when sort changes
  useEffect(() => {
    if (postId) {
      fetchComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentSort, postId]);

  const handleCommentVote = async (commentId, voteType) => {
    if (!user) return navigate('/login');
    try {
      const currentVote = userCommentVotes[commentId];
      const vote = currentVote === voteType ? 'remove' : voteType;
      
      await commentService.voteComment(commentId, user.userId, vote);
      
      // Update local state
      setUserCommentVotes(prev => ({
        ...prev,
        [commentId]: vote === 'remove' ? null : voteType
      }));
      
      // Update comment score in state
      setComments(prev => prev.map(c => {
        if (c.commentId === commentId) {
          let scoreDelta = 0;
          if (currentVote === 'up') scoreDelta -= 1;
          if (currentVote === 'down') scoreDelta += 1;
          if (vote === 'up') scoreDelta += 1;
          if (vote === 'down') scoreDelta -= 1;
          return { ...c, score: (c.score || 0) + scoreDelta };
        }
        return c;
      }));
    } catch (error) {
      toast.error('Failed to vote');
    }
  };

  const handleReaction = async (commentId, reactionType) => {
    if (!user) return navigate('/login');
    try {
      const result = await commentService.reactToComment(commentId, user.userId, reactionType);
      
      // Update local reactions state
      setUserReactions(prev => ({
        ...prev,
        [commentId]: result.reactionType
      }));
      
      // Update comment reaction counts
      setComments(prev => prev.map(c => {
        if (c.commentId === commentId) {
          const newReactions = { ...c };
          // Decrement old reaction if exists
          if (result.previousReaction) {
            const oldField = `reactions_${result.previousReaction}`;
            newReactions[oldField] = Math.max(0, (newReactions[oldField] || 0) - 1);
          }
          // Increment new reaction if added
          if (result.reactionType) {
            const newField = `reactions_${result.reactionType}`;
            newReactions[newField] = (newReactions[newField] || 0) + 1;
          }
          // Update total
          const totalChange = (result.reactionType ? 1 : 0) - (result.previousReaction && !result.reactionType ? 1 : 0);
          newReactions.totalReactions = Math.max(0, (newReactions.totalReactions || 0) + totalChange);
          return newReactions;
        }
        return c;
      }));
      
      setShowReactionPicker(null);
    } catch (error) {
      toast.error('Failed to react');
    }
  };

  const toggleCollapse = (commentId) => {
    setCollapsedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const handleVote = async (voteValue) => {
    if (!user) return navigate('/login');
    try {
      const newVote = userVote === voteValue ? 0 : voteValue;
      const response = await postService.votePost(postId, user.userId, newVote);
      setUserVote(newVote);
      setPost(prev => ({ ...prev, score: Math.max(0, response.score || 0) }));
    } catch (error) {
      toast.error('Failed to vote');
    }
  };

  const handleSave = async () => {
    if (!user) return navigate('/login');
    try {
      if (isSaved) {
        await postService.unsavePost(postId, user.userId);
        toast.success('Post unsaved');
      } else {
        await postService.savePost(postId, user.userId);
        toast.success('Post saved');
      }
      setIsSaved(!isSaved);
    } catch (error) {
      toast.error('Failed to save post');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    if (!commentText.trim()) return;

    try {
      await commentService.createComment(postId, {
        body: commentText,
        userId: user.userId,
        username: user.username,
        parentCommentId: replyingTo ? replyingTo.commentId : null
      });
      setCommentText('');
      setReplyingTo(null);
      fetchComments();
      toast.success('Comment posted!');
    } catch (error) {
      toast.error('Failed to post comment');
    }
  };

  const getMediaType = (media) => {
    return media.type || (
      media.url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ? 'image' :
      media.url.match(/\.(mp4|webm|ogg|mov|avi)$/i) ? 'video' :
      media.url.match(/\.(mp3|wav|ogg|m4a|flac)$/i) ? 'audio' :
      'document'
    );
  };

  const handleWheel = (e) => {
    if (post.media && getMediaType(post.media[currentMediaIndex]) !== 'image') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel(prev => Math.max(1, Math.min(3, prev + delta)));
  };

  const handleMouseDown = (e) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const renderMedia = () => {
    if (!post.media || post.media.length === 0) return null;

    // Inline lightbox view (expanded within page)
    if (showLightbox) {
      const media = post.media[currentMediaIndex];
      const mediaType = getMediaType(media);

      return (
        <div className="media-expanded">
          <div className="expanded-content">
            {mediaType === 'image' && (
              <img src={media.url} alt="" className="lightbox-media" />
            )}
            {mediaType === 'video' && (
              media.metadata?.hlsManifest ? (
                <HLSVideoPlayer
                  src={media.metadata.hlsManifest}
                  poster={media.thumbnail}
                  autoPlay
                  className="lightbox-media"
                />
              ) : (
                <HLSVideoPlayer
                  src={media.url}
                  poster={media.thumbnail}
                  autoPlay
                  className="lightbox-media"
                />
              )
            )}
            {mediaType === 'audio' && (
              <div className="lightbox-audio">
                <audio src={media.url} controls autoPlay style={{width: '100%'}} />
              </div>
            )}
            {mediaType === 'document' && (
              <div className="lightbox-document">
                <FileText size={64} />
                <a href={media.url} download className="document-download-btn">
                  <Download size={20} /> Download
                </a>
              </div>
            )}
            
            {post.media.length > 1 && (
              <>
                <button 
                  className="expanded-btn prev" 
                  onClick={() => setCurrentMediaIndex(i => Math.max(0, i - 1))}
                  disabled={currentMediaIndex === 0}
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  className="expanded-btn next" 
                  onClick={() => setCurrentMediaIndex(i => Math.min(post.media.length - 1, i + 1))}
                  disabled={currentMediaIndex === post.media.length - 1}
                >
                  <ChevronRight size={24} />
                </button>
                <div className="expanded-indicator">
                  {currentMediaIndex + 1} / {post.media.length}
                </div>
              </>
            )}
            
            <button className="expanded-fullscreen" onClick={() => setShowFullscreen(true)}>
              <Maximize2 size={20} />
            </button>
            <button className="expanded-close" onClick={() => setShowLightbox(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      );
    }

    // Multi-image grid gallery
    if (post.media.length > 1) {
      return (
        <div className={`media-grid-gallery count-${Math.min(post.media.length, 4)}`}>
          {post.media.slice(0, 4).map((media, index) => {
            const mediaType = getMediaType(media);
            return (
              <div 
                key={index} 
                className="media-grid-item"
                onClick={() => { setCurrentMediaIndex(index); setShowLightbox(true); }}
              >
                {mediaType === 'image' || mediaType === 'gif' ? (
                  <img src={media.url} alt="" />
                ) : mediaType === 'video' ? (
                  <>
                    <img src={media.thumbnail || media.url} alt="" />
                    <div className="play-overlay-center">▶</div>
                  </>
                ) : (
                  <div className="doc-preview-center">
                    <FileText size={32} />
                  </div>
                )}
                {index === 3 && post.media.length > 4 && (
                  <div className="media-more-overlay">+{post.media.length - 4}</div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Single media display
    const media = post.media[0];
    const mediaType = getMediaType(media);

    return (
      <div className="post-media-wrapper" onClick={() => setShowLightbox(true)} style={{cursor: 'pointer'}}>
        <div className="post-media-container">
          {mediaType === 'image' && <img src={media.url} alt="" className="post-image" />}
          {mediaType === 'video' && (
            <div onClick={(e) => e.stopPropagation()}>
              <HLSVideoPlayer
                src={media.metadata?.hlsManifest || media.url}
                poster={media.thumbnail}
                className="post-video"
              />
            </div>
          )}
          {mediaType === 'audio' && <audio src={media.url} controls className="post-audio" onClick={(e) => e.stopPropagation()} />}
          {mediaType === 'document' && (
            <a href={media.url} className="post-document" onClick={(e) => e.stopPropagation()}>
              <div className="document-icon">
                <FileText size={24} className="doc-icon" />
              </div>
              <div className="document-info">
                <h4 className="document-name">{media.name || 'Document'}</h4>
                <p className="document-size">Click to download</p>
              </div>
              <div className="document-actions">
                <span className="doc-action-btn download-btn">
                  <Download size={16} /> Download
                </span>
              </div>
            </a>
          )}
        </div>
      </div>
    );
  };

  const CommentNode = ({ comment, depth = 0 }) => {
    const replies = comments.filter(c => c.parentCommentId === comment.commentId);
    const isCollapsed = collapsedComments.has(comment.commentId);
    const userReaction = userReactions[comment.commentId];
    const userVoteOnComment = userCommentVotes[comment.commentId];
    const MAX_DEPTH = 10;
    const shouldNest = depth < MAX_DEPTH;

    // Calculate total reactions for display
    const totalReactions = comment.totalReactions || 0;
    const getTopReactions = () => {
      const reactionTypes = ['like', 'love', 'laugh', 'wow', 'sad', 'angry'];
      const counts = reactionTypes
        .map(type => ({ type, count: comment[`reactions_${type}`] || 0 }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count);
      return counts.slice(0, 3);
    };

    const formatTimeAgo = (date) => {
      const now = new Date();
      const created = new Date(date);
      const diffMs = now - created;
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) return `${diffDays}d ago`;
      if (diffHours > 0) return `${diffHours}h ago`;
      if (diffMins > 0) return `${diffMins}m ago`;
      return 'just now';
    };

    return (
      <div className={`comment-thread ${depth > 0 ? 'nested' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="comment-card">
          {/* Collapse toggle for Reddit-style threading */}
          <button 
            className="comment-collapse-btn"
            onClick={() => toggleCollapse(comment.commentId)}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <div className="collapse-line" />
          </button>

          <div className="comment-left-col">
            <Link to={`/u/${comment.username}`} className="comment-avatar-link">
              {comment.userAvatar ? (
                <img src={comment.userAvatar} alt="" className="comment-avatar" />
              ) : (
                <div className="comment-avatar-placeholder">
                  <User size={16} color="#64748b" />
                </div>
              )}
            </Link>
            {replies.length > 0 && !isCollapsed && <div className="comment-thread-line" />}
          </div>
          
          <div className="comment-right-col">
            <div className="comment-header">
              <Link to={`/u/${comment.username}`} className="comment-author-link">
                <span className="comment-author-name">{comment.username}</span>
              </Link>
              {comment.distinguished && (
                <span className={`comment-flair ${comment.distinguished}`}>
                  {comment.distinguished === 'mod' ? 'MOD' : comment.distinguished === 'admin' ? 'ADMIN' : 'OP'}
                </span>
              )}
              <span className="comment-separator">•</span>
              <span className="comment-time" title={new Date(comment.createdAt).toLocaleString()}>
                {formatTimeAgo(comment.createdAt)}
              </span>
              {comment.edited && <span className="comment-edited">(edited)</span>}
              {isCollapsed && (
                <span className="collapsed-info">
                  ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
                </span>
              )}
            </div>
            
            {!isCollapsed && (
              <>
                <div className="comment-body">{comment.body}</div>
                
                <div className="comment-actions">
                  {/* Upvote/Downvote */}
                  <div className="vote-group">
                    <button 
                      className={`comment-action-btn upvote-btn ${userVoteOnComment === 'up' ? 'active' : ''}`}
                      onClick={() => handleCommentVote(comment.commentId, 'up')}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <span className={`comment-score ${(comment.score || 0) > 0 ? 'positive' : (comment.score || 0) < 0 ? 'negative' : ''}`}>
                      {comment.score || 0}
                    </span>
                    <button 
                      className={`comment-action-btn downvote-btn ${userVoteOnComment === 'down' ? 'active' : ''}`}
                      onClick={() => handleCommentVote(comment.commentId, 'down')}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Reaction Button with Picker */}
                  <div className="reaction-container">
                    <button 
                      className={`comment-action-btn reaction-btn ${userReaction ? 'has-reaction' : ''}`}
                      onClick={() => setShowReactionPicker(showReactionPicker === comment.commentId ? null : comment.commentId)}
                      onMouseEnter={() => setShowReactionPicker(comment.commentId)}
                      style={userReaction ? { color: REACTIONS[userReaction]?.color } : {}}
                    >
                      {userReaction ? (
                        <span className="user-reaction-emoji">{REACTIONS[userReaction]?.emoji}</span>
                      ) : (
                        <ThumbsUp size={14} />
                      )}
                      {totalReactions > 0 && <span className="reaction-count">{totalReactions}</span>}
                    </button>

                    {/* Reaction Picker */}
                    <AnimatePresence>
                      {showReactionPicker === comment.commentId && (
                        <motion.div 
                          className="reaction-picker"
                          initial={{ opacity: 0, scale: 0.8, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.8, y: 10 }}
                          onMouseLeave={() => setShowReactionPicker(null)}
                        >
                          {Object.entries(REACTIONS).map(([type, { emoji, label }]) => (
                            <button
                              key={type}
                              className={`reaction-option ${userReaction === type ? 'selected' : ''}`}
                              onClick={() => handleReaction(comment.commentId, type)}
                              title={label}
                            >
                              <span className="reaction-emoji">{emoji}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Show top reactions */}
                    {getTopReactions().length > 0 && (
                      <div className="top-reactions">
                        {getTopReactions().map(({ type, count }) => (
                          <span key={type} className="top-reaction" title={`${count} ${REACTIONS[type]?.label}`}>
                            {REACTIONS[type]?.emoji}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button className="comment-action-btn reply-btn" onClick={() => setReplyingTo(comment)}>
                    <Reply size={14} /> Reply
                  </button>

                  <button className="comment-action-btn share-btn" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.href}#comment-${comment.commentId}`);
                    toast.success('Link copied');
                  }}>
                    <Share2 size={14} /> Share
                  </button>

                  <button className="comment-action-btn more-btn">
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                {/* Reply input */}
                {replyingTo?.commentId === comment.commentId && (
                  <motion.div 
                    className="reply-input-container"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <textarea
                      className="reply-input"
                      placeholder={`Reply to ${comment.username}...`}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      autoFocus
                    />
                    <div className="reply-actions">
                      <button className="reply-cancel" onClick={() => { setReplyingTo(null); setCommentText(''); }}>
                        Cancel
                      </button>
                      <button className="reply-submit" onClick={handleComment} disabled={!commentText.trim()}>
                        Reply
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Nested replies */}
                {replies.length > 0 && shouldNest && (
                  <div className="comment-replies">
                    {replies.map(reply => (
                      <CommentNode key={reply.commentId} comment={reply} depth={depth + 1} />
                    ))}
                  </div>
                )}

                {/* Continue thread link for deep nesting */}
                {replies.length > 0 && !shouldNest && (
                  <Link 
                    to={`/post/${postId}?comment=${comment.commentId}`} 
                    className="continue-thread-link"
                  >
                    Continue this thread →
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const rootComments = comments.filter(c => !c.parentCommentId);

  if (loading) return (
    <div className="loading-container">
      <div className="spinner"></div>
    </div>
  );
  
  if (!post) return null;

  return (
    <div className="post-detail-page">
      <div className="post-detail-container">
        
        <motion.article 
          className="post-detail-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="post-main-content">
            <div className="post-credit-bar">
              <button className="back-button" onClick={() => navigate(-1)}>
                <ArrowLeft size={20} />
              </button>
              
              <div className="credit-left">
                <div className="avatars-group">
                  {post.group && (
                    <div className="community-avatar">
                      <div className="community-icon">
                        {post.group[0].toUpperCase()}
                      </div>
                    </div>
                  )}
                  <div className="user-avatar">
                    <div className="user-avatar-icon">
                      {post.userAvatar ? (
                        <img src={post.userAvatar} alt="" />
                      ) : (
                        <div className="avatar-initial">{post.username[0].toUpperCase()}</div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="credit-info">
                  {post.group && (
                    <>
                      <Link to={`/g/${post.group}`} className="community-name">
                        c/{post.group}
                      </Link>
                      <span className="credit-separator">•</span>
                    </>
                  )}
                  <Link to={`/u/${post.username}`} className="author-name">
                    u/{post.username}
                  </Link>
                  <span className="credit-separator">•</span>
                  <span className="post-time">{new Date(post.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div ref={menuRef} style={{position: 'relative'}}>
                <button className="post-menu-btn" onClick={() => setShowMenu(!showMenu)}>
                  <MoreHorizontal size={20} />
                </button>
                <AnimatePresence>
                  {showMenu && (
                    <motion.div 
                      className="glass-dropdown"
                      initial={{opacity:0, y:10}} 
                      animate={{opacity:1, y:0}} 
                      exit={{opacity:0}}
                    >
                      <button className="menu-item" onClick={handleSave}>
                        {isSaved ? 'Unsave' : 'Save'}
                      </button>
                      <button className="menu-item danger">Report</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="post-content">
              <h1 className="post-title">{post.title}</h1>
              {post.body && <div className="post-body">{post.body}</div>}
            </div>

            {renderMedia()}

            <div className="post-action-row">
              <div className="vote-buttons-inline">
                <button 
                  className={`vote-btn upvote ${userVote === 1 ? 'active' : ''}`}
                  onClick={() => handleVote(1)}
                  title="Like"
                >
                  <ArrowUp size={16} />
                </button>
                <span className="vote-count">{Math.max(0, post.score || 0)}</span>
              </div>
              
              <button className="action-btn comment-btn">
                <MessageCircle size={16} />
                <span className="action-text">{comments.length}</span>
                <span className="action-label">Comment{comments.length !== 1 ? 's' : ''}</span>
              </button>
              
              <button className="action-btn share-btn" onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success('Link copied');
              }}>
                <Share2 size={16} />
                <span>Share</span>
              </button>
              
              <button 
                className={`action-btn save-btn ${isSaved ? 'saved' : ''}`}
                onClick={handleSave}
              >
                <Bookmark size={16} />
                <span>{isSaved ? 'Saved' : 'Save'}</span>
              </button>

              <div className="view-count">
                <Eye size={16} />
                <span>{post.views || 0}</span>
              </div>
            </div>
          </div>
        </motion.article>

        {user ? (
          <div className="comment-input-card">
            <div className="comment-as">
              <div className="comment-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt="" />
                ) : (
                  <div className="avatar-initial">{user.username[0].toUpperCase()}</div>
                )}
              </div>
              Comment as <strong>{user.username}</strong>
              {replyingTo && (
                <span style={{marginLeft: 'auto', fontSize: 12, color: '#64748b'}}>
                  Replying to @{replyingTo.username}
                  <button 
                    onClick={() => setReplyingTo(null)}
                    style={{marginLeft: 8, background: 'transparent', border: 'none', cursor: 'pointer'}}
                  >
                    <X size={14} />
                  </button>
                </span>
              )}
            </div>
            <form onSubmit={handleComment} className="comment-form">
              <textarea
                className="comment-textarea"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="What are your thoughts?"
                rows={4}
              />
              <div className="comment-form-actions">
                <Button type="submit" disabled={!commentText.trim()} size="small">
                  Comment
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="login-prompt-card">
            <p>Log in or sign up to leave a comment</p>
            <Button onClick={() => navigate('/login')}>Log In</Button>
          </div>
        )}

        <div className="comments-section">
          <div className="comments-header">
            <h2>{comments.length} Comment{comments.length !== 1 ? 's' : ''}</h2>
            <div className="comment-sort-controls">
              <span className="sort-label">Sort by:</span>
              <select 
                value={commentSort} 
                onChange={(e) => setCommentSort(e.target.value)}
                className="sort-select"
              >
                <option value="best">Best</option>
                <option value="top">Top</option>
                <option value="new">New</option>
                <option value="controversial">Controversial</option>
              </select>
            </div>
          </div>
          
          {rootComments.length > 0 ? (
            <div className="comments-list">
              {rootComments.map(comment => (
                <CommentNode key={comment.commentId} comment={comment} />
              ))}
            </div>
          ) : (
            <div className="no-comments">
              <MessageCircle size={48} />
              <p>No comments yet</p>
              <span>Be the first to share what you think!</span>
            </div>
          )}
        </div>
      </div>

      {showFullscreen && ReactDOM.createPortal(
        <div 
          className="fullscreen-modal" 
          onClick={() => setShowFullscreen(false)}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="fullscreen-content" onClick={e => e.stopPropagation()}>
            {post.media && post.media[currentMediaIndex] && (
              <figure className="fullscreen-figure">
                {getMediaType(post.media[currentMediaIndex]) === 'image' && (
                  <img 
                    ref={imageRef}
                    src={post.media[currentMediaIndex].url} 
                    alt=""
                    style={{
                      maxWidth: '95vw',
                      maxHeight: '95vh',
                      transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
                      cursor: zoomLevel > 1 ? 'grab' : 'default',
                      transition: isDragging ? 'none' : 'transform 0.2s'
                    }}
                    onMouseDown={handleMouseDown}
                  />
                )}
                {getMediaType(post.media[currentMediaIndex]) === 'video' && (
                  <HLSVideoPlayer
                    src={post.media[currentMediaIndex].metadata?.hlsManifest || post.media[currentMediaIndex].url}
                    poster={post.media[currentMediaIndex].thumbnail}
                    autoPlay
                    style={{maxWidth: '95vw', maxHeight: '95vh'}}
                  />
                )}
              </figure>
            )}
            
            {post.media && post.media.length > 1 && (
              <>
                <button 
                  className="fullscreen-btn prev"
                  onClick={() => setCurrentMediaIndex(i => Math.max(0, i - 1))}
                >
                  <ChevronLeft size={32} />
                </button>
                <button 
                  className="fullscreen-btn next"
                  onClick={() => setCurrentMediaIndex(i => Math.min(post.media.length - 1, i + 1))}
                >
                  <ChevronRight size={32} />
                </button>
                <div className="fullscreen-indicator">
                  {currentMediaIndex + 1} / {post.media.length}
                </div>
              </>
            )}
            
            {post.media && getMediaType(post.media[currentMediaIndex]) === 'image' && (
              <div className="fullscreen-zoom-controls">
                <button className="fullscreen-zoom-btn" onClick={() => setZoomLevel(z => Math.min(3, z + 0.5))}>+</button>
                <button className="fullscreen-zoom-btn" onClick={() => setZoomLevel(z => Math.max(1, z - 0.5))}>-</button>
                <button className="fullscreen-zoom-btn" onClick={() => { setZoomLevel(1); setPosition({x:0, y:0}); }}>
                  Reset
                </button>
              </div>
            )}
            
            <button className="fullscreen-close" onClick={() => setShowFullscreen(false)}>
              <X size={24} />
            </button>
          </div>
        </div>, 
        document.body
      )}
    </div>
  );
};

export default PostDetail;
