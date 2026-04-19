import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, UserPlus, Users, Sparkles, Zap, Plus, Film } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PostCard from '../components/posts/PostCard';
import Button from '../components/common/Button';
import StatusViewer from '../components/status/StatusViewer';
import CreateStatusModal from '../components/status/CreateStatusModal';
import { postService } from '../services/postService';
import { groupService } from '../services/groupService';
import { userService } from '../services/userService';
import { socialService } from '../services/socialService';
import { useAuth } from '../contexts/AuthContext';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  
  // State
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState('new');
  const [trendingGroups, setTrendingGroups] = useState([]);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [statuses, setStatuses] = useState([]);
  const [viewingStatus, setViewingStatus] = useState(null);
  const [showCreateStatus, setShowCreateStatus] = useState(false);
  const [expandedWidget, setExpandedWidget] = useState(null);

  // --- Logic remains same ---
  const fetchPosts = useCallback(async (resetPage = false) => {
    try {
      if (resetPage) {
        setLoading(true);
        setPage(1);
      }
      const params = {
        limit: 15,
        userId: user?.userId
      };
      const response = await postService.getFeed(feedType, params);
      const newPosts = response.posts || [];
      
      if (resetPage) setPosts(newPosts);
      else setPosts(prev => [...prev, ...newPosts]);
      
      setHasMore(newPosts.length === 15);
      if (!resetPage) setPage(prev => prev + 1);
    } catch (error) {
      
      setPosts([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, feedType, user]);

  const fetchGroups = useCallback(async () => {
    try {
      const response = await groupService.getAllGROUPS({ limit: 20, sort: 'popular', userId: user?.userId });
      setTrendingGroups(response.groups || []);
    } catch (error) {  }
  }, [user]);

  const fetchUserSuggestions = useCallback(async () => {
    if (!isAuthenticated || !user?.userId) return;
    try {
      // Get user's following list first
      const followingResponse = await socialService.getFollowing(user.username);
      const followingIds = (followingResponse.following || []).map(f => f.userId || f.followingId);
      
      const response = await userService.getUserSuggestions(user.userId, 20);
      // Filter out users already being followed (extra safety)
      const filtered = (response.suggestions || []).filter(u => 
        !followingIds.includes(u.userId) && !followingIds.includes(u.username)
      );
      setSuggestedUsers(filtered);
    } catch (error) { 
      console.error('Error fetching suggestions:', error);
    }
  }, [isAuthenticated, user]);

  const fetchStatuses = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await socialService.getStatuses(true);
      setStatuses(response.statuses || []);
    } catch (error) { }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchPosts(true);
    fetchGroups();
    if (isAuthenticated) {
      fetchUserSuggestions();
      fetchStatuses();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPosts(true); }, [feedType]);

  // Removed handlePostUpdate - PostCard handles optimistic updates

  // --- Visual Components ---

  const groupedStatuses = statuses.reduce((acc, status) => {
    if (!acc[status.userId]) acc[status.userId] = [];
    acc[status.userId].push(status);
    return acc;
  }, {});

  const StoriesRail = () => (
    <div className="stories-rail">
       <motion.div className="story-item create-story" whileTap={{ scale: 0.95 }} onClick={() => setShowCreateStatus(true)}>
          <div className="story-ring add-ring">
             <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.username || 'User'}&background=6366f1&color=fff`} alt="Me" />
             <div className="plus-badge"><Plus size={14} /></div>
          </div>
          <span>You</span>
       </motion.div>
       {Object.entries(groupedStatuses).map(([userId, userStatuses]) => {
         const firstStatus = userStatuses[0];
         const isOwnStatus = firstStatus.isOwn;
         const hasUnviewed = userStatuses.some(s => !s.hasViewed && !s.isOwn);
         return (
           <motion.div key={userId} className="story-item" whileHover={{ y: -5 }} whileTap={{ scale: 0.95 }} onClick={() => setViewingStatus(userStatuses)}>
              <div className={`story-ring ${isOwnStatus || hasUnviewed ? 'gradient-ring' : 'viewed-ring'}`}>
                <img src={firstStatus.user?.avatar || `https://ui-avatars.com/api/?name=${firstStatus.user?.username || 'User'}&background=6366f1&color=fff`} alt={firstStatus.user?.username} />
              </div>
              <span>{firstStatus.user?.displayName || firstStatus.user?.username}</span>
           </motion.div>
         );
       })}
    </div>
  );

  return (
    <div className="home-page">
      <AnimatePresence>
        {viewingStatus && <StatusViewer statuses={viewingStatus} onClose={() => { setViewingStatus(null); fetchStatuses(); }} />}
        {showCreateStatus && <CreateStatusModal onClose={() => setShowCreateStatus(false)} onCreated={fetchStatuses} />}
      </AnimatePresence>

      {/* Ambient Background Blobs */}
      <div className="ambient-blob blob-1"></div>
      <div className="ambient-blob blob-2"></div>
      
      <div className="home-container">
        
        {/* Main Feed Area */}
        <main className="home-main">
          
          {/* Stories Rail */}
          {isAuthenticated && <StoriesRail />}

          {/* Create Post Trigger */}
          {isAuthenticated && (
            <motion.div 
              className="glass-card create-post-trigger"
              whileHover={{ scale: 1.01, boxShadow: "0 8px 32px rgba(31, 38, 135, 0.15)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/create-post')}
            >
              <div className="user-avatar">
                {user?.avatar ? <img src={user.avatar} alt="me" /> : <div className="avatar-placeholder">{user?.username?.[0]}</div>}
              </div>
              <div className="fake-input">Share your spark... ✨</div>
              <Button size="small" variant="primary" className="post-btn">Post</Button>
            </motion.div>
          )}

          {/* Floating Feed Toggle */}
          <div className="feed-toggle-container">
            <div className="glass-pill-nav">
              {[
                { id: 'new', icon: Sparkles, label: 'Fresh' },
                { id: 'trending', icon: TrendingUp, label: 'Trending' },
                { id: 'following', icon: UserPlus, label: 'Following', authOnly: true },
                { id: 'reels', icon: Film, label: 'Reels', isLink: true }
              ].map((tab) => {
                if (tab.authOnly && !isAuthenticated) return null;
                const Icon = tab.icon;
                
                // Handle Reels as a link to separate page
                if (tab.isLink) {
                  return (
                    <button
                      key={tab.id}
                      onClick={() => navigate('/reels')}
                      className="nav-pill reels-pill"
                    >
                      <Icon size={16} />
                      <span>{tab.label}</span>
                    </button>
                  );
                }
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFeedType(tab.id)}
                    className={`nav-pill ${feedType === tab.id ? 'active' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{tab.label}</span>
                    {feedType === tab.id && <motion.div layoutId="pill-bg" className="active-pill-bg" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Posts Feed */}
          <div className="posts-feed">
            <AnimatePresence mode="popLayout">
              {loading && page === 1 ? (
                 <div className="loading-skeleton">
                    <div className="skeleton-card glass-card"></div>
                    <div className="skeleton-card glass-card"></div>
                 </div>
              ) : posts.length > 0 ? (
                posts.map((post, index) => (
                  <motion.div
                    key={post.postId || index}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <PostCard post={post} className="glass-post-card" />
                  </motion.div>
                ))
              ) : (
                <div className="glass-card empty-state">
                  <div className="empty-graphic">🛸</div>
                  <h3>It's quiet here...</h3>
                  <p>Be the first to break the silence!</p>
                </div>
              )}
            </AnimatePresence>
            
            {hasMore && !loading && posts.length > 0 && (
               <Button onClick={() => fetchPosts(false)} variant="ghost" className="load-more-btn">
                 Discover More
               </Button>
            )}
          </div>
        </main>

        {/* Right Sidebar - Glassmorphic */}
        <aside className="home-sidebar">
          
          {/* Suggested People */}
          {isAuthenticated && suggestedUsers.length > 0 && (
            <motion.div 
              className="glass-card sidebar-widget"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              onMouseEnter={() => setExpandedWidget('suggestions')}
              onMouseLeave={() => setExpandedWidget(null)}
            >
              <div className="widget-header">
                <h3>Vibe Check <Zap size={16} fill="#F59E0B" color="#F59E0B" /></h3>
                <span className="see-all" onClick={() => navigate('/friends?tab=suggestions')}>View All</span>
              </div>
              <div 
                className={`widget-list ${expandedWidget === 'suggestions' ? 'expanded' : ''}`}
              >
                {suggestedUsers.map(u => (
                  <div key={u.userId} className="compact-user-row" style={{ gap: '0.25rem' }}>
                    <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.username}`} alt={u.username} className="row-avatar" onClick={() => navigate(`/profile/${u.username}`)} />
                    <div className="row-info" onClick={() => navigate(`/profile/${u.username}`)}>
                      <span className="row-name">{u.displayName || u.username}</span>
                      <span className="row-sub">@{u.username}</span>
                    </div>
                    <button className="icon-btn-add" onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await socialService.followUser(u.username, user.userId);
                        setSuggestedUsers(prev => prev.filter(user => user.userId !== u.userId));
                      } catch (error) {
                        console.error('Follow failed:', error);
                      }
                    }}><UserPlus size={16} /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Suggested Groups */}
          <motion.div 
            className="glass-card sidebar-widget"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            onMouseEnter={() => setExpandedWidget('groups')}
            onMouseLeave={() => setExpandedWidget(null)}
          >
            <div className="widget-header">
              <h3>Tribes</h3>
              <span className="see-all" onClick={() => navigate('/groups?tab=foryou')}>View All</span>
            </div>
            <div 
              className={`widget-list ${expandedWidget === 'groups' ? 'expanded' : ''}`}
            >
              {trendingGroups.map(g => (
                <div key={g.groupId} className="compact-group-row" onClick={() => navigate(`/g/${g.name}`)}>
                   <div className="group-row-icon">
                     {g.icon ? <img src={g.icon} alt="" /> : <Users size={18} />}
                   </div>
                   <div className="row-info">
                     <span className="row-name">{g.displayName}</span>
                     <span className="row-sub">{g.memberCount} members</span>
                   </div>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="mini-footer">
            <p>© 2025 BuChat</p>
            <div className="footer-links">
               {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
               <a href="#">Privacy</a> • <a href="#">Terms</a> • <a href="#">More</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Home;
