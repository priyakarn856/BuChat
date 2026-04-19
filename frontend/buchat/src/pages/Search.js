/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search as SearchIcon, Users, MessageSquare, Hash, 
  ArrowRight, Sparkles, Frown 
} from 'lucide-react';
import Card from '../components/common/Card';
import PostCard from '../components/posts/PostCard';
import { postService } from '../services/postService';
import { userService } from '../services/userService';
import { groupService } from '../services/groupService';
import './Search.css';

const Search = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  
  const [activeTab, setActiveTab] = useState('posts');
  const [results, setResults] = useState({ posts: [], users: [], communities: [] });
  const [loading, setLoading] = useState(false);

  // Fetch data whenever URL query changes
  useEffect(() => {
    if (query) {
      performSearch(query);
    } else {
      // If no query, maybe clear results or show empty state
      setResults({ posts: [], users: [], communities: [] });
    }
  }, [query]);

  const performSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const [postsData, usersData, groupsData] = await Promise.all([
        postService.searchPosts(searchQuery).catch(() => ({ posts: [] })),
        userService.searchUsers(searchQuery).catch(() => ({ users: [] })),
        groupService.searchGROUPS(searchQuery).catch(() => ({ groups: [] })),
      ]);
      
      setResults({
        posts: postsData.posts || [],
        users: usersData.users || [],
        communities: groupsData.groups || [],
      });
    } catch (error) {
      
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'posts', label: 'Posts', icon: MessageSquare, count: results.posts.length },
    { id: 'communities', label: 'Tribes', icon: Hash, count: results.communities.length },
    { id: 'users', label: 'People', icon: Users, count: results.users.length },
  ];

  return (
    <div className="search-page">
      <div className="search-container">
        
        {/* === Header Section === */}
        <motion.div 
          className="search-results-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="query-display">
            <div className="query-icon-box">
              <SearchIcon size={24} />
            </div>
            <div className="query-text">
              <span>Search Results for</span>
              <h1>"{query}"</h1>
            </div>
          </div>
        </motion.div>

        {/* === Navigation Tabs === */}
        <div className="glass-tabs-container">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`search-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className="tab-content">
                <tab.icon size={18} />
                <span>{tab.label}</span>
                <span className="tab-badge">{tab.count}</span>
              </div>
              {activeTab === tab.id && (
                <motion.div 
                  className="active-tab-glow" 
                  layoutId="searchTab"
                />
              )}
            </button>
          ))}
        </div>

        {/* === Results Area === */}
        <div className="search-results-content">
          {loading ? (
            <div className="loading-state">
              <div className="cyber-spinner" />
              <p>Scanning network...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                
                {/* --- POSTS TAB --- */}
                {activeTab === 'posts' && (
                  <div className="results-feed">
                    {results.posts.length > 0 ? (
                      results.posts.map((post) => (
                        <PostCard key={post.postId} post={post} />
                      ))
                    ) : (
                      <EmptyState type="posts" />
                    )}
                  </div>
                )}

                {/* --- COMMUNITIES TAB --- */}
                {activeTab === 'communities' && (
                  <div className="results-grid">
                    {results.communities.length > 0 ? (
                      results.communities.map((group) => (
                        <motion.div 
                          key={group.groupId} 
                          className="glass-result-card group"
                          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(99, 102, 241, 0.2)' }}
                          onClick={() => navigate(`/g/${group.name}`)}
                        >
                          <div className="card-glow-bg" />
                          <div className="result-icon-circle">
                            <Hash size={24} />
                          </div>
                          <div className="result-info">
                            <h3>c/{group.name}</h3>
                            <p>{group.description || 'No description provided.'}</p>
                            <div className="result-meta">
                              <Users size={14} />
                              <span>{group.memberCount || 0} members</span>
                            </div>
                          </div>
                          <div className="result-arrow">
                            <ArrowRight size={20} />
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <EmptyState type="communities" />
                    )}
                  </div>
                )}

                {/* --- USERS TAB --- */}
                {activeTab === 'users' && (
                  <div className="results-grid">
                    {results.users.length > 0 ? (
                      results.users.map((user) => (
                        <motion.div 
                          key={user.userId} 
                          className="glass-result-card user"
                          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(168, 85, 247, 0.2)' }}
                          onClick={() => navigate(`/u/${user.username}`)}
                        >
                          <div className="card-glow-bg" />
                          <div className="result-avatar">
                            {user.avatar ? <img src={user.avatar} alt="" /> : <Users size={24} />}
                          </div>
                          <div className="result-info">
                            <h3>{user.displayName || user.username}</h3>
                            <span className="handle">@{user.username}</span>
                            {user.bio && <p className="user-bio">{user.bio}</p>}
                          </div>
                          <button className="view-profile-btn">
                            View
                          </button>
                        </motion.div>
                      ))
                    ) : (
                      <EmptyState type="users" />
                    )}
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Subcomponent: Empty State ---
const EmptyState = ({ type }) => (
  <div className="empty-search-state">
    <div className="empty-icon-wrapper">
      <Frown size={48} />
    </div>
    <h3>No {type} found</h3>
    <p>We couldn't find any {type} matching your search. Try different keywords.</p>
  </div>
);

export default Search;
