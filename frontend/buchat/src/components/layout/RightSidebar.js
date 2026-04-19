import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, Users, UserPlus, Info, ArrowRight, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/userService';
import { socialService } from '../../services/socialService';
import Button from '../common/Button';
import './RightSidebar.css';

const RightSidebar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [followingUsers, setFollowingUsers] = useState(new Set());
  const [expandedWidget, setExpandedWidget] = useState(null);
  
  const trendingGroups = [
    { name: 'Technology', members: '2.5M', icon: '💻', id: 'tech' },
    { name: 'Gaming', members: '1.8M', icon: '🎮', id: 'gaming' },
    { name: 'Movies', members: '1.2M', icon: '🎬', id: 'movies' },
  ];

  useEffect(() => {
    if (user?.userId) {
      loadUserSuggestions();
    }
  }, [user?.userId]);

  const loadUserSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      // Get user's following list first
      const followingResponse = await socialService.getFollowing(user.username);
      const followingIds = (followingResponse.following || []).map(f => f.userId || f.followingId);
      
      const data = await userService.getUserSuggestions(user.userId, 20);
      // Filter out users already being followed (extra safety)
      const filtered = (data.suggestions || []).filter(u => 
        !followingIds.includes(u.userId) && !followingIds.includes(u.username)
      );
      setSuggestions(filtered);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleFollow = async (targetUsername, targetUserId) => {
    try {
      await socialService.followUser(targetUsername, user.userId);
      setSuggestions(prev => prev.filter(s => s.userId !== targetUserId));
    } catch (error) {
      console.error('Failed to follow user:', error);
    }
  };

  return (
    <aside className="right-sidebar">
      
      {/* --- User Suggestions Widget --- */}
      {user && (
        <div 
          className="glass-card sidebar-widget"
          onMouseEnter={() => setExpandedWidget('suggestions')}
          onMouseLeave={() => setExpandedWidget(null)}
        >
          <div className="widget-header">
            <h3>Vibe Check <Zap size={16} fill="#F59E0B" stroke="#F59E0B" /></h3>
            <span className="see-all" onClick={() => navigate('/friends')}>
              View All
            </span>
          </div>
          
          <div 
            className={`widget-list ${expandedWidget === 'suggestions' ? 'expanded' : ''}`}
          >
            {loadingSuggestions ? (
              <div className="widget-loading">
                <div className="spinner-ring"></div>
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.map((suggestion) => (
                <div key={suggestion.userId} className="compact-user-row" style={{ gap: '0.25rem' }}>
                  <img 
                    src={suggestion.avatar || `https://ui-avatars.com/api/?name=${suggestion.username}`}
                    alt={suggestion.username} 
                    className="row-avatar"
                    onClick={() => navigate(`/u/${suggestion.username}`)}
                  />
                  
                  <div className="row-info" onClick={() => navigate(`/u/${suggestion.username}`)}>
                    <span className="row-name">
                      {suggestion.displayName || suggestion.username}
                    </span>
                    <span className="row-sub">@{suggestion.username}</span>
                  </div>
                  
                  <button 
                    className="icon-btn-add" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFollow(suggestion.username, suggestion.userId);
                    }}
                  >
                    <UserPlus size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="widget-empty">
                <p>No new suggestions.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- About / Footer Widget --- */}
      <div className="glass-panel sidebar-widget mini-footer-card">
        <div className="widget-header">
          <div className="icon-badge purple">
            <Info size={18} />
          </div>
          <h3>BuChat Premium</h3>
        </div>
        <div className="widget-content">
          <p className="about-text">
            Unlock exclusive badges, custom themes, and support the community.
          </p>
          <Button variant="primary" fullWidth size="small" className="premium-btn">
            Try Premium
          </Button>
          
          <div className="footer-links-row">
            <Link to="/terms">Terms</Link> • <Link to="/privacy">Privacy</Link> • <Link to="/help">Help</Link>
          </div>
          <div className="copyright">© 2025 BuChat Inc.</div>
        </div>
      </div>
    </aside>
  );
};

export default RightSidebar;