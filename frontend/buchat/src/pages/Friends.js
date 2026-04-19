import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// eslint-disable-next-line no-unused-vars
import { Users, UserPlus, UserMinus, MessageCircle, Sparkles, Search, UserCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/common/Button';
import { socialService } from '../services/socialService';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import './Friends.css';

const Friends = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'followers');
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['followers', 'following', 'suggestions'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user?.userId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [followersRes, followingRes, suggestionsRes] = await Promise.all([
        socialService.getFollowers(user.username || user.userId),
        socialService.getFollowing(user.username || user.userId),
        userService.getUserSuggestions(user.userId, 50)
      ]);
      setFollowers(followersRes.followers || []);
      setFollowing(followingRes.following || []);
      setSuggestions(suggestionsRes.suggestions || []);
    } catch (error) {
      
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (username) => {
    try {
      await socialService.followUser(username, user.userId);
      fetchData(); // Refresh list to update UI state
    } catch (error) {
      
    }
  };

  const handleUnfollow = async (username) => {
    try {
      await socialService.unfollowUser(username, user.userId);
      fetchData();
    } catch (error) {
      
    }
  };

  // --- Filter Logic ---
  const getFilteredList = () => {
    let list = [];
    if (activeTab === 'followers') list = followers;
    if (activeTab === 'following') list = following;
    if (activeTab === 'suggestions') list = suggestions;

    if (!searchQuery) return list;
    
    return list.filter(u => 
      u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredUsers = getFilteredList();

  return (
    <div className="friends-page">
      <div className="friends-container">
        
        {/* --- Header & Search --- */}
        <div className="friends-header">
          <div className="header-title">
            <div className="icon-glow-box">
              <Users size={28} />
            </div>
            <h1>Connections</h1>
          </div>
          
          <div className="glass-search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* --- Neon Tabs --- */}
        <div className="glass-tabs-nav">
          {[
            { id: 'followers', icon: Users, label: `Followers`, count: followers.length },
            { id: 'following', icon: UserCheck, label: `Following`, count: following.length },
            { id: 'suggestions', icon: Sparkles, label: `Suggestions`, count: suggestions.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
              <span className="tab-count">{tab.count}</span>
              
              {activeTab === tab.id && (
                <motion.div 
                  className="active-tab-bg"
                  layoutId="activeTab"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* --- Content Grid --- */}
        <div className="users-grid-container">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="loading-grid">
                {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-card glass-panel" />)}
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((userData, index) => (
                <motion.div
                  key={userData.userId || userData.username}
                  className="glass-user-card"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -5 }}
                >
                  <div className="card-bg-glow" />
                  
                  <Link to={`/profile/${userData.username}`} className="user-card-header">
                    <div className="user-avatar-wrapper">
                      {userData.avatar ? (
                        <img src={userData.avatar} alt={userData.username} />
                      ) : (
                        <div className="avatar-placeholder">
                          {userData.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="user-card-info">
                      <h3>{userData.displayName || userData.username}</h3>
                      <span>@{userData.username}</span>
                    </div>
                  </Link>

                  <div className="user-card-stats">
                    <div className="stat">
                      <strong>{userData.followerCount || 0}</strong>
                      <span>Followers</span>
                    </div>
                    <div className="stat">
                      <strong>{userData.followingCount || 0}</strong>
                      <span>Following</span>
                    </div>
                  </div>

                  <div className="user-card-actions">
                    <Button 
                      size="small" 
                      variant="ghost" 
                      className="icon-only-btn"
                      onClick={() => navigate(`/messages?user=${userData.username}`)}
                      title="Message"
                    >
                      <MessageCircle size={18} />
                    </Button>

                    {/* Follow/Unfollow Logic */}
                    {activeTab === 'following' ? (
                      <Button 
                        size="small" 
                        variant="secondary" 
                        fullWidth
                        className="unfollow-btn"
                        onClick={() => handleUnfollow(userData.username)}
                      >
                        <UserCheck size={16} /> Following
                      </Button>
                    ) : activeTab === 'followers' ? (
                      <Button 
                        size="small" 
                        variant="primary" 
                        fullWidth
                        onClick={() => handleFollow(userData.username)}
                      >
                        <UserPlus size={16} /> Follow Back
                      </Button>
                    ) : (
                      <Button 
                        size="small" 
                        variant="primary" 
                        fullWidth
                        onClick={() => handleFollow(userData.username)}
                      >
                        <UserPlus size={16} /> Follow
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.div 
                className="empty-state-glass"
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
              >
                <div className="empty-icon">
                  {activeTab === 'suggestions' ? <Sparkles size={48} /> : <Users size={48} />}
                </div>
                <h3>It's quiet here...</h3>
                <p>
                  {activeTab === 'followers' 
                    ? "Start sharing to grow your tribe!" 
                    : activeTab === 'following' 
                    ? "Find amazing people in the Suggestions tab." 
                    : "No new suggestions right now."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Friends;
