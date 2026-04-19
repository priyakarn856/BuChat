import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Users, TrendingUp, Plus, Settings, UserPlus, Shield, Calendar, Clock, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import PostCard from '../components/posts/PostCard';
import ImageUploadModal from '../components/common/ImageUploadModal';
import { groupService } from '../services/groupService';
import { postService } from '../services/postService';
import { useAuth } from '../contexts/AuthContext';
import './GroupDetail.css';

const GroupDetail = () => {
  const { groupName } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [activeTab, setActiveTab] = useState('posts'); // posts, about, rules
  const [showIconModal, setShowIconModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);

  useEffect(() => {
    fetchGroup();
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

  const fetchGroup = async () => {
    try {
      const data = await groupService.getgroup(groupName);
      // Backend returns group data directly, not wrapped in .group
      const groupData = data.group || data;
      setGroup(groupData);
      
      // Check if current user is the owner
      if (isAuthenticated && user) {
        const isGroupOwner = groupData.creatorId === user.userId || groupData.creator === user.username;
        setIsOwner(isGroupOwner);
        
        // Owner is automatically a member
        if (isGroupOwner) {
          setIsMember(true);
        } else {
          // Check membership from backend
          const membershipKey = `membership_${groupName}_${user.userId}`;
          try {
            const membershipData = await groupService.checkMembership(groupName, user.userId);
            const actualMembership = membershipData.isMember === true;
            setIsMember(actualMembership);
            localStorage.setItem(membershipKey, actualMembership.toString());
          } catch (error) {
            setIsMember(false);
            localStorage.setItem(membershipKey, 'false');
          }
        }
      }
    } catch (error) {
      
      toast.error('group not found');
      navigate('/Groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const data = await postService.getgroupPosts(groupName);
      setPosts(data.posts || []);
    } catch (error) {
      
    }
  };

  const handleJoin = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const wasJoining = !isMember;
    const membershipKey = `membership_${groupName}_${user.userId}`;
    
    try {
      if (isMember) {
        // Optimistically update UI
        setIsMember(false);
        localStorage.setItem(membershipKey, 'false');
        setGroup(prev => ({
          ...prev,
          memberCount: Math.max(0, (prev.memberCount || 0) - 1)
        }));
        
        await groupService.leavegroup(groupName, user.userId);
        toast.success('Left group');
      } else {
        // Optimistically update UI
        setIsMember(true);
        localStorage.setItem(membershipKey, 'true');
        setGroup(prev => ({
          ...prev,
          memberCount: (prev.memberCount || 0) + 1
        }));
        
        await groupService.joingroup(groupName, user.userId);
        toast.success('Joined group!');
      }
    } catch (error) {
      toast.error('Action failed');
      // Revert optimistic update on error
      setIsMember(!wasJoining);
      localStorage.setItem(membershipKey, (!wasJoining).toString());
      setGroup(prev => ({
        ...prev,
        memberCount: wasJoining 
          ? Math.max(0, (prev.memberCount || 0) - 1)
          : (prev.memberCount || 0) + 1
      }));
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!group) return null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="group-detail-page">
      <div className="group-detail-container">
        {/* group Header */}
        <Card className="group-header">
          <div className="group-banner" style={{ 
            backgroundImage: group.banner ? `url(${group.banner})` : (group.primaryColor || 'linear-gradient(135deg, #ff4500, #ff6b35)')
          }}>
            {isOwner && (
              <div className="banner-overlay" onClick={() => setShowBannerModal(true)}>
                <ImageIcon size={32} />
                <span>Change Banner</span>
              </div>
            )}
          </div>
          <div className="group-info">
            <div className="group-icon-large" onClick={isOwner ? () => setShowIconModal(true) : undefined}>
              {group.icon ? (
                <img src={group.icon} alt={group.displayName || group.name} />
              ) : (
                <Users size={48} />
              )}
              {isOwner && (
                <div className="avatar-overlay">
                  <ImageIcon size={24} />
                  <span>Change</span>
                </div>
              )}
            </div>
            <div className="group-details">
              <div className="group-title-row">
                <div>
                  <h1>{group.displayName || `c/${group.name}`}</h1>
                  <p className="group-name-subtitle">c/{group.name}</p>
                </div>
                <div className="group-actions">
                  {isAuthenticated && !isOwner && (
                    <Button onClick={handleJoin} variant={isMember ? 'ghost' : 'primary'}>
                      {isMember ? 'Leave' : 'Join'}
                    </Button>
                  )}
                  {isOwner && (
                    <Button 
                      variant="ghost" 
                      icon={<Settings size={18} />}
                      onClick={() => navigate(`/g/${groupName}/settings`)}
                    >
                      Mod Tools
                    </Button>
                  )}
                </div>
              </div>
              <p className="group-description">{group.description}</p>
              <div className="group-stats">
                <span><Users size={16} /> {group.memberCount || 0} members</span>
                <span><TrendingUp size={16} /> {posts.length} posts</span>
                <span><Calendar size={16} /> Created {formatDate(group.createdAt)}</span>
                {group.category && <span className="group-category-badge">{group.category}</span>}
              </div>
            </div>
          </div>
        </Card>

        {/* Navigation Tabs */}
        <div className="group-tabs">
          <button 
            className={`tab ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            Posts
          </button>
          <button 
            className={`tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            About
          </button>
          {group.rules && group.rules.length > 0 && (
            <button 
              className={`tab ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveTab('rules')}
            >
              Rules
            </button>
          )}
        </div>

        <div className="group-content">
          <main className="group-main">
            {/* Posts Tab */}
            {activeTab === 'posts' && (
              <>
                <div className="posts-header">
                  <h2>Posts</h2>
                  {isAuthenticated && (isMember || isOwner) && (
                    <Button
                      size="small"
                      icon={<Plus size={18} />}
                      onClick={() => navigate('/create-post', { state: { groupName } })}
                    >
                      Create Post
                    </Button>
                  )}
                </div>
                {posts.length > 0 ? (
                  <div className="posts-list">
                    {posts.map((post) => (
                      <PostCard key={post.postId} post={post} onVote={fetchPosts} hideGroupName={true} />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <div className="empty-state">
                      <TrendingUp size={48} />
                      <h3>No posts yet</h3>
                      <p>Be the first to post in this group!</p>
                      {isAuthenticated && (isMember || isOwner) && (
                        <Button 
                          icon={<Plus size={18} />}
                          onClick={() => navigate('/create-post', { state: { groupName } })}
                        >
                          Create Post
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* About Tab */}
            {activeTab === 'about' && (
              <Card>
                <h2>About c/{group.name}</h2>
                <div className="about-content">
                  <p>{group.description || 'No description available'}</p>
                  
                  <div className="about-stats-grid">
                    <div className="about-stat">
                      <Users size={24} />
                      <div>
                        <strong>{group.memberCount || 0}</strong>
                        <span>Members</span>
                      </div>
                    </div>
                    <div className="about-stat">
                      <TrendingUp size={24} />
                      <div>
                        <strong>{group.postCount || 0}</strong>
                        <span>Posts</span>
                      </div>
                    </div>
                    <div className="about-stat">
                      <Calendar size={24} />
                      <div>
                        <strong>{formatDate(group.createdAt)}</strong>
                        <span>Created</span>
                      </div>
                    </div>
                    <div className="about-stat">
                      <Clock size={24} />
                      <div>
                        <strong>{group.status || 'Active'}</strong>
                        <span>Status</span>
                      </div>
                    </div>
                  </div>

                  {group.category && (
                    <div className="about-section">
                      <h3>Category</h3>
                      <p className="group-category-badge">{group.category}</p>
                    </div>
                  )}

                  {isOwner && (
                    <div className="about-section owner-section">
                      <Shield size={20} />
                      <p>You are the owner of this group</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Rules Tab */}
            {activeTab === 'rules' && (
              <Card>
                <h2>group Rules</h2>
                <div className="rules-content">
                  {group.rules && group.rules.length > 0 ? (
                    <ol className="rules-list">
                      {group.rules.map((rule, index) => (
                        <li key={index} className="rule-item">
                          <strong>{index + 1}. {rule.title || rule}</strong>
                          {rule.description && <p>{rule.description}</p>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="empty-message">No rules have been set yet.</p>
                  )}
                  {isOwner && (
                    <Button 
                      variant="ghost" 
                      icon={<Settings size={18} />}
                      onClick={() => navigate(`/g/${groupName}/settings`)}
                    >
                      Manage Rules
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </main>

          {/* Sidebar */}
          <aside className="group-sidebar">
            {/* About Card */}
            <Card>
              <h3>About group</h3>
              <p className="sidebar-description">{group.description || 'No description available'}</p>
              
              <div className="sidebar-stats">
                <div className="sidebar-stat">
                  <Users size={20} />
                  <div>
                    <strong>{group.memberCount || 0}</strong>
                    <span>Members</span>
                  </div>
                </div>
                <div className="sidebar-stat">
                  <Calendar size={20} />
                  <div>
                    <strong>{formatDate(group.createdAt)}</strong>
                    <span>Created</span>
                  </div>
                </div>
              </div>

              {!isAuthenticated && (
                <Button fullWidth onClick={() => navigate('/login')}>
                  Join to Post
                </Button>
              )}
              
              {isAuthenticated && !isMember && !isOwner && (
                <Button fullWidth onClick={handleJoin}>
                  <UserPlus size={18} /> Join group
                </Button>
              )}

              {isAuthenticated && (isMember || isOwner) && (
                <Button 
                  fullWidth 
                  icon={<Plus size={18} />}
                  onClick={() => navigate('/create-post', { state: { groupName } })}
                >
                  Create Post
                </Button>
              )}
            </Card>

            {/* Rules Card */}
            {group.rules && group.rules.length > 0 && (
              <Card>
                <h3>group Rules</h3>
                <ol className="sidebar-rules-list">
                  {group.rules.slice(0, 3).map((rule, index) => (
                    <li key={index}>
                      <strong>{rule.title || rule}</strong>
                    </li>
                  ))}
                  {group.rules.length > 3 && (
                    <li className="see-more" onClick={() => setActiveTab('rules')}>
                      See {group.rules.length - 3} more rules
                    </li>
                  )}
                </ol>
              </Card>
            )}

            {/* Moderators Card - Only for owner */}
            {isOwner && (
              <Card>
                <h3>Moderator Tools</h3>
                <div className="mod-tools">
                  <Button 
                    variant="ghost" 
                    fullWidth 
                    icon={<Settings size={18} />}
                    onClick={() => navigate(`/g/${groupName}/settings`)}
                  >
                    group Settings
                  </Button>
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>

      {/* Image Upload Modals */}
      <ImageUploadModal
        isOpen={showIconModal}
        onClose={() => setShowIconModal(false)}
        onSave={async (file) => {
          if (!file) {
            setShowIconModal(false);
            return;
          }
          try {
            toast.info('Uploading icon...');
            const uploadResult = await postService.uploadMedia(file);
            await groupService.updateGroup(groupName, user.userId, { icon: uploadResult.url });
            setGroup(prev => ({ ...prev, icon: uploadResult.url }));
            setShowIconModal(false);
            toast.success('Group icon updated!');
          } catch (error) {
            toast.error('Failed to update icon');
          }
        }}
        type="avatar"
        currentImage={group?.icon}
      />
      <ImageUploadModal
        isOpen={showBannerModal}
        onClose={() => setShowBannerModal(false)}
        onSave={async (file) => {
          if (!file) {
            setShowBannerModal(false);
            return;
          }
          try {
            toast.info('Uploading banner...');
            const uploadResult = await postService.uploadMedia(file);
            await groupService.updateGroup(groupName, user.userId, { banner: uploadResult.url });
            setGroup(prev => ({ ...prev, banner: uploadResult.url }));
            setShowBannerModal(false);
            toast.success('Group banner updated!');
          } catch (error) {
            toast.error('Failed to update banner');
          }
        }}
        type="banner"
        currentImage={group?.banner}
      />
    </div>
  );
};

export default GroupDetail;
