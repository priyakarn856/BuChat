import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
  Users, TrendingUp, Plus, Search, MessageSquare, 
  Clock, UserPlus, UserMinus, Settings, Activity 
} from 'lucide-react';
import { groupService } from '../services/groupService';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import './Groups.css';

// --- CSS STYLES ---
// eslint-disable-next-line no-unused-vars
const styles = `
  :root {
    --bg-color: #f8fafc;
    --surface: #ffffff;
    --surface-hover: #f1f5f9;
    --border: #e2e8f0;
    --text-primary: #0f172a;
    --text-secondary: #64748b;
    --text-tertiary: #94a3b8;
    --primary: #6366f1;
    --primary-hover: #4f46e5;
    
    --glass-bg: rgba(255, 255, 255, 0.85);
    --glass-border: 1px solid rgba(255, 255, 255, 0.5);
    --glass-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    
    --primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    --card-hover-transform: translateY(-4px);
    --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  [data-theme="dark"] {
    --bg-color: #0f172a;
    --surface: #1e293b;
    --surface-hover: #334155;
    --border: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-tertiary: #94a3b8;
    
    --glass-bg: rgba(30, 41, 59, 0.85);
    --glass-border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .groups-page {
    min-height: 100vh;
    background: var(--bg-color);
    padding-bottom: 4rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  }

  /* --- Hero Section --- */
  .groups-hero {
    background: var(--surface);
    padding: 3rem 1rem 5rem;
    text-align: center;
    position: relative;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
  }

  .groups-hero::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.1) 0%, transparent 40%),
                radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.1) 0%, transparent 40%);
    pointer-events: none;
  }

  .hero-content {
    max-width: 800px;
    margin: 0 auto;
    position: relative;
    z-index: 2;
  }

  .hero-title {
    font-size: 2.5rem;
    font-weight: 800;
    background: var(--primary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.75rem;
    letter-spacing: -0.025em;
  }

  .hero-subtitle {
    color: var(--text-secondary);
    font-size: 1.1rem;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  /* --- Main Container --- */
  .groups-container {
    max-width: 1200px;
    margin: -3rem auto 0;
    padding: 0 1.5rem;
    position: relative;
    z-index: 10;
  }

  /* --- Toolbar --- */
  .groups-toolbar {
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .toolbar-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .tabs-pill-container {
    display: flex;
    background: var(--bg-color);
    padding: 0.3rem;
    border-radius: 12px;
    border: 1px solid var(--border);
  }

  .tab-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: var(--transition-smooth);
  }

  .tab-pill:hover {
    color: var(--text-primary);
  }

  .tab-pill.active {
    background: var(--surface);
    color: var(--primary);
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  .create-btn {
    background: var(--primary-gradient);
    color: white;
    border: none;
    padding: 0.7rem 1.4rem;
    border-radius: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: var(--transition-smooth);
    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
  }

  .create-btn:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: 0 6px 8px -1px rgba(99, 102, 241, 0.3);
  }

  .toolbar-bottom {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-wrapper {
    flex: 1;
    min-width: 250px;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
  }

  .search-input {
    width: 100%;
    padding: 0.8rem 1rem 0.8rem 2.8rem;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-primary);
    font-size: 0.95rem;
    transition: var(--transition-smooth);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .sort-dropdown {
    display: flex;
    gap: 0.5rem;
  }

  .sort-chip {
    padding: 0.6rem 1rem;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: var(--transition-smooth);
  }

  .sort-chip:hover {
    background: var(--surface-hover);
    border-color: var(--text-tertiary);
  }

  .sort-chip.active {
    background: rgba(99, 102, 241, 0.1);
    color: var(--primary);
    border-color: var(--primary);
  }

  /* --- Grid --- */
  .groups-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.5rem;
  }

  .group-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.5rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: var(--transition-smooth);
    position: relative;
    overflow: hidden;
  }

  .group-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: var(--primary-gradient);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .group-card:hover {
    transform: var(--card-hover-transform);
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 12px 24px -8px rgba(99, 102, 241, 0.15);
  }

  .group-card:hover::before {
    opacity: 1;
  }

  .card-header {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .card-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }
  
  .card-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-header-text {
    flex: 1;
    min-width: 0;
  }

  .card-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.25rem 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-handle {
    font-size: 0.85rem;
    color: var(--text-primary);
    opacity: 0.6;
    font-family: monospace;
  }

  .card-description {
    color: var(--text-secondary);
    font-size: 0.925rem;
    line-height: 1.6;
    margin-bottom: 1.5rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex-grow: 1;
  }

  .card-stats {
    display: flex;
    gap: 1.25rem;
    padding-top: 1rem;
    border-top: 1px dashed var(--border);
    margin-bottom: 1.25rem;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
  
  .stat-item svg {
    color: var(--text-tertiary);
  }

  .card-action .btn-block {
    width: 100%;
    justify-content: center;
    padding: 0.75rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: var(--transition-smooth);
    border: none;
  }

  .btn-join {
    background: var(--text-primary);
    color: var(--surface);
  }
  .btn-join:hover {
    background: var(--primary);
  }

  .btn-manage {
    background: var(--surface-hover);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }
  .btn-manage:hover {
    background: var(--border);
  }

  .btn-leave {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  .btn-leave:hover {
    border-color: #ef4444;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.05);
  }

  /* --- Skeleton --- */
  .skeleton-card {
    height: 260px;
    background: var(--surface);
    border-radius: 16px;
    border: 1px solid var(--border);
    padding: 1.5rem;
  }
  .skeleton-pulse {
    background: linear-gradient(90deg, var(--border) 25%, var(--surface-hover) 50%, var(--border) 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: 8px;
  }
  @keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* --- Empty State --- */
  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 4rem 2rem;
    background: var(--surface);
    border: 2px dashed var(--border);
    border-radius: 16px;
  }

  @media (max-width: 768px) {
    .groups-container {
      margin-top: -1.5rem;
      padding: 0 1rem;
    }
    .hero-title {
      font-size: 1.75rem;
    }
    .toolbar-top {
      flex-direction: column;
      align-items: stretch;
    }
    .search-wrapper {
      min-width: 100%;
    }
    .sort-dropdown {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .sort-chip {
      white-space: nowrap;
    }
  }
`;

// --- MAIN COMPONENT ---
const Groups = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'foryou' ? 'suggestions' : (location.state?.activeTab || 'all'));
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('members');
  const [membershipStatus, setMembershipStatus] = useState({});

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'foryou') {
      setActiveTab('suggestions');
    }
  }, [searchParams]);

  useEffect(() => {
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user]);

  useEffect(() => {
    if (isAuthenticated && user?.userId && groups.length > 0) {
      checkMemberships();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, isAuthenticated, user]);

  const checkMemberships = async () => {
    const statuses = {};
    await Promise.all(groups.map(async (group) => {
      try {
        const result = await groupService.checkMembership(group.name, user.userId);
        statuses[group.name] = result.isMember || result.isOwner || false;
      } catch {
        statuses[group.name] = group.creatorId === user.userId;
      }
    }));
    setMembershipStatus(statuses);
  };

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const params = { limit: 50 };
      if (activeTab === 'suggestions' && user?.userId) {
        params.userId = user.userId;
      }
      const response = await groupService.getAllGROUPS(params);
      setGroups(response.groups || []);
    } catch (error) {
      
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (e, groupName) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      await groupService.joingroup(groupName, user.userId);
      toast.success(`Welcome to ${groupName}!`);
      setMembershipStatus(prev => ({ ...prev, [groupName]: true }));
      fetchGroups();
    } catch (error) {
      toast.error('Failed to join group');
    }
  };

  const handleLeaveGroup = async (e, groupName) => {
    e.preventDefault();
    if (!isAuthenticated) return;
    try {
      await groupService.leavegroup(groupName, user.userId);
      toast.info(`Left ${groupName}`);
      setMembershipStatus(prev => ({ ...prev, [groupName]: false }));
      fetchGroups();
    } catch (error) {
      toast.error('Failed to leave group');
    }
  };

  const filteredGroups = groups
    .filter(group => {
      const matchesSearch = group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.description?.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeTab === 'suggestions') {
        return matchesSearch && group.creatorId !== user?.userId && !group.isMember;
      }
      return matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'members') return (b.memberCount || 0) - (a.memberCount || 0);
      if (sortBy === 'posts') return (b.postCount || 0) - (a.postCount || 0);
      if (sortBy === 'recent') return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      return 0;
    });

  const getInitials = (displayName) => (displayName || '').substring(0, 2).toUpperCase();

  return (
    <div className="groups-page">
        {/* Hero */}
        <div className="groups-hero">
          <div className="hero-content">
            <motion.h1 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="hero-title"
            >
              Discover Communities
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="hero-subtitle"
            >
              Find your tribe, join the conversation, and share your passions with people who care.
            </motion.p>
          </div>
        </div>

        {/* Main Content */}
        <div className="groups-container">
          
          {/* Toolbar */}
          <div className="groups-toolbar">
            <div className="toolbar-top">
              <div className="tabs-pill-container">
                <button 
                  className={`tab-pill ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  <Users size={18} /> All Groups
                </button>
                <button 
                  className={`tab-pill ${activeTab === 'suggestions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('suggestions')}
                >
                  <TrendingUp size={18} /> For You
                </button>
              </div>

              {isAuthenticated && (
                <button className="create-btn" onClick={() => navigate('/create-group')}>
                  <Plus size={18} /> Create Group
                </button>
              )}
            </div>

            <div className="toolbar-bottom">
              <div className="search-wrapper">
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search for topics, interests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="sort-dropdown">
                <button 
                  className={`sort-chip ${sortBy === 'members' ? 'active' : ''}`}
                  onClick={() => setSortBy('members')}
                >
                  <Users size={14} /> Popular
                </button>
                <button 
                  className={`sort-chip ${sortBy === 'posts' ? 'active' : ''}`}
                  onClick={() => setSortBy('posts')}
                >
                  <Activity size={14} /> Active
                </button>
                <button 
                  className={`sort-chip ${sortBy === 'recent' ? 'active' : ''}`}
                  onClick={() => setSortBy('recent')}
                >
                  <Clock size={14} /> Newest
                </button>
              </div>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="groups-grid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="skeleton-card">
                  <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem'}}>
                    <div className="skeleton-pulse" style={{width: 56, height: 56, borderRadius: 14}} />
                    <div style={{flex: 1}}>
                      <div className="skeleton-pulse" style={{width: '60%', height: 20, marginBottom: 8}} />
                      <div className="skeleton-pulse" style={{width: '30%', height: 14}} />
                    </div>
                  </div>
                  <div className="skeleton-pulse" style={{width: '100%', height: 60, marginBottom: '1.5rem'}} />
                  <div className="skeleton-pulse" style={{width: '100%', height: 40, borderRadius: 12}} />
                </div>
              ))}
            </div>
          ) : filteredGroups.length > 0 ? (
            <motion.div 
              className="groups-grid"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              <AnimatePresence>
                {filteredGroups.map((group) => (
                  <motion.div key={group.groupId} variants={itemVariants} layout>
                    <Link to={`/c/${group.name}`} style={{ textDecoration: 'none' }}>
                      <div className="group-card">
                        <div>
                          <div className="card-header">
                            <div className="card-icon">
                              {group.icon ? (
                                <img src={group.icon} alt={group.displayName || group.name} />
                              ) : (
                                <span>{getInitials(group.displayName || group.name)}</span>
                              )}
                            </div>
                            <div className="card-header-text">
                              <h3 className="card-title">{group.displayName || group.name}</h3>
                              <span className="card-handle">{group.name}</span>
                            </div>
                          </div>
                          
                          <p className="card-description">
                            {group.description || 'Join this community to discuss shared interests and meet new people.'}
                          </p>

                          <div className="card-stats">
                            <div className="stat-item">
                              <Users size={14} /> {group.memberCount || 0}
                            </div>
                            <div className="stat-item">
                              <MessageSquare size={14} /> {group.postCount || 0}
                            </div>
                            <div className="stat-item">
                              <Clock size={14} /> {new Date(group.createdAt).getFullYear()}
                            </div>
                          </div>
                        </div>

                        <div className="card-action">
                          {group.creatorId === user?.userId ? (
                            <button 
                              className="btn-block btn-manage"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/c/${group.name}`);
                              }}
                            >
                              <Settings size={16} /> Manage Group
                            </button>
                          ) : membershipStatus[group.name] ? (
                            <button 
                              className="btn-block btn-leave"
                              onClick={(e) => handleLeaveGroup(e, group.name)}
                            >
                              <UserMinus size={16} /> Leave Group
                            </button>
                          ) : (
                            <button 
                              className="btn-block btn-join"
                              onClick={(e) => handleJoinGroup(e, group.name)}
                            >
                              <UserPlus size={16} /> Join Community
                            </button>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="empty-state"
            >
              <Users size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>No groups found</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Try adjusting your search or create a new community.</p>
            </motion.div>
          )}
        </div>
      </div>
  );
};

export default Groups;
