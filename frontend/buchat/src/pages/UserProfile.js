/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Calendar, Users, UserPlus, UserMinus, Settings, 
  Edit2, Check, X, Image as ImageIcon, MapPin, Link as LinkIcon,
  MessageCircle, Grid, List, Bookmark, Loader2
} from 'lucide-react';
import { toast } from 'react-toastify';
import PostCard from '../components/posts/PostCard';
import Button from '../components/common/Button';
import ImageUploadModal from '../components/common/ImageUploadModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { userService } from '../services/userService';
import { socialService } from '../services/socialService';
import { postService } from '../services/postService';
import { useAuth } from '../contexts/AuthContext';
import './UserProfile.css';

const ProfileSkeleton = () => (
  <div className="profile-page skeleton-mode">
    <div className="profile-glass-card">
      <div className="profile-banner skeleton-animate" />
      <div className="profile-info-row">
        <div className="avatar-container">
          <div className="profile-avatar-xl skeleton-animate" />
        </div>
        <div className="profile-text-content">
          <div className="skeleton-line w-50 skeleton-animate mb-2" />
          <div className="skeleton-line w-25 skeleton-animate mb-4" />
          <div className="skeleton-line w-75 skeleton-animate" />
        </div>
      </div>
    </div>
  </div>
);

const UserProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, refreshUser } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [mediaPosts, setMediaPosts] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [isEditing, setIsEditing] = useState(false);
  const [savedPosts, setSavedPosts] = useState([]);
  
  const [editForm, setEditForm] = useState({
    username: '',
    displayName: '',
    bio: '',
    location: '',
    website: '',
    avatar: '',
    banner: ''
  });

  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  
  const [ownedGroups, setOwnedGroups] = useState([]);
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, variant: 'danger' });

  const isOwnProfile = currentUser && currentUser.username === username;

  useEffect(() => {
    if (username) fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (currentUser && currentUser.username === username && savedPosts.length === 0) {
      postService.getSavedPosts(username)
        .then(data => setSavedPosts(data.saved || []))
        .catch(err => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, username]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const profileData = await userService.getUserProfile(username);
      setProfile(profileData.user);
      
      setEditForm({
        username: profileData.user.username || '',
        displayName: profileData.user.displayName || '',
        bio: profileData.user.bio || '',
        location: profileData.user.location || '',
        website: profileData.user.website || '',
        avatar: profileData.user.avatar || '',
        banner: profileData.user.banner || ''
      });

      

      const [postsData, followersData, followingData, groupsData, savedPostsData] = await Promise.allSettled([
        userService.getUserPosts(username),
        socialService.getFollowers(username),
        socialService.getFollowing(username),
        userService.getUserGroups(username).catch(() => ({ owned: [], joined: [] })),
        currentUser && currentUser.username === username ? postService.getSavedPosts(username) : Promise.resolve({ saved: [] })
      ]);

      

      const allPosts = postsData.status === 'fulfilled' ? (postsData.value.posts || []) : [];
      setPosts(allPosts);
      setMediaPosts(allPosts.filter(p => 
        (p.media && Array.isArray(p.media) && p.media.length > 0) || 
        p.postType === 'image' || 
        p.postType === 'video'
      ));

      setFollowers(followersData.status === 'fulfilled' ? (followersData.value.followers || []) : []);
      setFollowing(followingData.status === 'fulfilled' ? (followingData.value.following || []) : []);
      
      if (groupsData.status === 'fulfilled' && groupsData.value) {
        setOwnedGroups(groupsData.value.owned || []);
        setJoinedGroups(groupsData.value.joined || []);
      } else {
        setOwnedGroups([]);
        setJoinedGroups([]);
      }

      if (savedPostsData.status === 'fulfilled' && savedPostsData.value) {
        
        setSavedPosts(savedPostsData.value.saved || []);
      }

      if (currentUser && currentUser.username !== username) {
        const myFollowing = await socialService.getFollowing(currentUser.username);
        setIsFollowing(myFollowing.following?.some(f => f.username === username));
      }
    } catch (error) {
      
      toast.error('Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUser) return navigate('/login');
    try {
      if (isFollowing) {
        await socialService.unfollowUser(username, currentUser.userId);
        setFollowers(prev => prev.filter(u => u.username !== currentUser.username));
      } else {
        await socialService.followUser(username, currentUser.userId);
        setFollowers(prev => [...prev, { ...currentUser }]); 
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      toast.error('Action failed');
    }
  };

  const handleAvatarModalSave = async (file, preview) => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(preview);
    setAvatarFile(file);
    setShowAvatarModal(false);
  };

  const handleBannerModalSave = async (file, preview) => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(preview);
    setBannerFile(file);
    setShowBannerModal(false);
  };

  const handleEditToggle = () => {
    if (isEditing) {
      setAvatarPreview(null);
      setBannerPreview(null);
      setAvatarFile(null);
      setBannerFile(null);
    }
    setIsEditing(!isEditing);
  };

  const checkUsername = async (value) => {
    if (value === profile.username) {
      setUsernameAvailable(true);
      return;
    }
    if (value.length < 3) {
      setUsernameAvailable(false);
      return;
    }
    
    setCheckingUsername(true);
    try {
      const result = await userService.checkUsername(value);
      setUsernameAvailable(result.available);
    } catch (error) {
      setUsernameAvailable(false);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setEditForm(prev => ({ ...prev, username: value }));
    
    if (value.length >= 3 && value !== profile.username) {
      const timeoutId = setTimeout(() => checkUsername(value), 500);
      return () => clearTimeout(timeoutId);
    } else if (value === profile.username) {
      setUsernameAvailable(true);
    } else {
      setUsernameAvailable(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!usernameAvailable) {
      toast.error('Username is unavailable or invalid');
      return;
    }

    try {
      let updatedForm = { ...editForm };
      const usernameChanged = editForm.username !== profile.username;
      
      if (avatarFile) {
        toast.info('Uploading avatar...');
        const uploadResult = await userService.uploadImage(avatarFile);
        updatedForm.avatar = uploadResult.url;
      }
      
      if (bannerFile) {
        toast.info('Uploading banner...');
        const uploadResult = await userService.uploadImage(bannerFile);
        updatedForm.banner = uploadResult.url;
      }

      const response = await userService.updateUserProfile(username, updatedForm);
      
      if (usernameChanged) {
        const newUsername = editForm.username;
        
        if (isOwnProfile) {
          const updatedUserData = response.user || { ...currentUser, ...updatedForm };
          localStorage.setItem('user', JSON.stringify(updatedUserData));
          await refreshUser();
        }
        
        toast.success('Profile updated!');
        navigate(`/u/${newUsername}`, { replace: true });
        window.location.reload();
      } else {
        setProfile({ ...profile, ...updatedForm });
        setIsEditing(false);
        setAvatarFile(null);
        setBannerFile(null);
        setAvatarPreview(null);
        setBannerPreview(null);
        
        if (isOwnProfile) await refreshUser();
        toast.success('Profile updated successfully!');
      }
    } catch (error) {
      
      toast.error('Failed to update profile');
    }
  };

  const handleMessage = () => {
    if (!currentUser) return navigate('/login');
    navigate(`/messages?user=${profile.userId}`);
  };

  const handleDeletePost = (postId) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Post',
      message: 'Are you sure you want to delete this post? This action cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await postService.deletePost(postId, currentUser.userId);
          setPosts(prev => prev.filter(p => p.postId !== postId));
          setMediaPosts(prev => prev.filter(p => p.postId !== postId));
          toast.success('Post deleted');
          setConfirmDialog({ isOpen: false });
        } catch (error) {
          toast.error('Failed to delete post');
        }
      }
    });
  };

  const handleUnsavePost = async (postId) => {
    try {
      await postService.unsavePost(postId, currentUser.userId);
      setSavedPosts(prev => prev.filter(p => p.postId !== postId));
      toast.success('Post removed from saved');
    } catch (error) {
      toast.error('Failed to unsave post');
    }
  };

  const handleUnfollowUser = async (user) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Unfollow User',
      message: `Are you sure you want to unfollow @${user.username}?`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          await socialService.unfollowUser(user.username, currentUser.userId);
          setFollowing(prev => prev.filter(u => u.username !== user.username));
          toast.success(`Unfollowed @${user.username}`);
          setConfirmDialog({ isOpen: false });
        } catch (error) {
          toast.error('Failed to unfollow user');
        }
      }
    });
  };

  const handleRemoveFollower = async (user) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Follower',
      message: `Remove @${user.username} from your followers?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await socialService.removeFollower(currentUser.username, user.username);
          setFollowers(prev => prev.filter(u => u.username !== user.username));
          toast.success(`Removed @${user.username}`);
          setConfirmDialog({ isOpen: false });
        } catch (error) {
          toast.error('Failed to remove follower');
        }
      }
    });
  };

  const handleLeaveGroup = async (group) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Leave Group',
      message: `Are you sure you want to leave ${group.displayName || group.name}?`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          const { groupService: gs } = await import('../services/groupService');
          await gs.leavegroup(group.name, currentUser.userId);
          setJoinedGroups(prev => prev.filter(g => g.groupId !== group.groupId));
          toast.success(`Left ${group.displayName || group.name}`);
          setConfirmDialog({ isOpen: false });
        } catch (error) {
          
          toast.error('Failed to leave group');
        }
      }
    });
  };

  if (loading) return <ProfileSkeleton />;
  if (!profile) return null;

  const displayAvatar = avatarPreview || profile.avatar;
  const displayBanner = bannerPreview || profile.banner;

  return (
    <>
      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false })}
        variant={confirmDialog.variant}
      />

      <div className="profile-page">
        <div className="profile-container">
          
          <motion.div 
            className="profile-glass-card hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div 
              className={`profile-banner ${isOwnProfile ? 'editable' : ''}`}
              style={{ 
                backgroundImage: displayBanner 
                  ? `url(${displayBanner})` 
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              }}
            >
              <div className="banner-overlay" />
              {isOwnProfile && (
                <div 
                  className="banner-edit-overlay" 
                  onClick={() => setShowBannerModal(true)}
                >
                  <ImageIcon size={32} />
                  <span>Change Cover</span>
                </div>
              )}
            </div>

            <div className="profile-info-row">
              <div className="avatar-container">
                <div className={`profile-avatar-xl ${isOwnProfile ? 'editable' : ''}`}>
                  {displayAvatar ? (
                    <img src={displayAvatar} alt={username} />
                  ) : (
                    <div className="avatar-initial">{username[0].toUpperCase()}</div>
                  )}
                  {isOwnProfile && (
                    <div 
                      className="avatar-edit-overlay" 
                      onClick={() => setShowAvatarModal(true)}
                    >
                      <Edit2 size={24} />
                    </div>
                  )}
                </div>
              </div>

              <div className="profile-text-content">
                <div className="name-row">
                  {isEditing ? (
                    <input 
                      className="glass-edit-input name"
                      value={editForm.displayName}
                      onChange={e => setEditForm({...editForm, displayName: e.target.value})}
                      placeholder="Display Name"
                    />
                  ) : (
                    <h1>{profile.displayName || username}</h1>
                  )}
                  
                  {isOwnProfile && !isEditing && (
                    <button className="icon-btn-glass" onClick={handleEditToggle}>
                      <Settings size={18} />
                    </button>
                  )}
                </div>
                
                {isEditing ? (
                  <div className="edit-username-wrapper">
                    <span className="at-symbol">@</span>
                    <input 
                      className={`glass-edit-input username ${!usernameAvailable ? 'error' : ''}`}
                      value={editForm.username}
                      onChange={handleUsernameChange}
                      placeholder="username"
                    />
                    <div className="validation-icon">
                      {checkingUsername ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : usernameAvailable ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <X size={16} className="text-danger" />
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="username-handle">@{username}</span>
                )}

                <div className="bio-section">
                  {isEditing ? (
                    <textarea 
                      className="glass-edit-textarea"
                      value={editForm.bio}
                      onChange={e => setEditForm({...editForm, bio: e.target.value})}
                      placeholder="Tell us about yourself..."
                      rows={3}
                    />
                  ) : (
                    profile.bio && <p className="user-bio">{profile.bio}</p>
                  )}
                  
                  <div className="meta-badges">
                    <span className="badge">
                      <Calendar size={14} /> 
                      Joined {new Date(profile.createdAt).toLocaleDateString()}
                    </span>
                    {(profile.location || isEditing) && (
                      <span className="badge">
                        <MapPin size={14} />
                        {isEditing ? (
                          <input 
                            className="glass-edit-input-mini" 
                            value={editForm.location}
                            onChange={e => setEditForm({...editForm, location: e.target.value})} 
                            placeholder="City, Country"
                          />
                        ) : profile.location}
                      </span>
                    )}
                    {(profile.website || isEditing) && (
                      <span className="badge link">
                        <LinkIcon size={14} />
                        {isEditing ? (
                          <input 
                            className="glass-edit-input-mini" 
                            value={editForm.website}
                            onChange={e => setEditForm({...editForm, website: e.target.value})} 
                            placeholder="website.com"
                          />
                        ) : (
                          <a href={profile.website} target="_blank" rel="noreferrer">
                            {profile.website}
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="action-bar">
                  {isEditing ? (
                    <>
                      <Button size="small" variant="primary" onClick={handleEditSubmit}>
                        <Check size={16}/> Save Changes
                      </Button>
                      <Button size="small" variant="ghost" onClick={handleEditToggle}>
                        <X size={16}/> Cancel
                      </Button>
                    </>
                  ) : (
                    !isOwnProfile && (
                      <>
                        <Button 
                          size="small" 
                          variant={isFollowing ? 'outline' : 'primary'} 
                          onClick={handleFollow}
                        >
                          {isFollowing ? <><UserMinus size={16}/> Following</> : <><UserPlus size={16}/> Follow</>}
                        </Button>
                        <Button 
                          size="small" 
                          variant="ghost" 
                          onClick={handleMessage}
                        >
                          <MessageCircle size={18} /> Message
                        </Button>
                      </>
                    )
                  )}
                </div>
              </div>

              <div className="stats-glass-card">
                <div className="stat-item">
                  <strong>{posts.length}</strong>
                  <span>Posts</span>
                </div>
                <div className="stat-item clickable" onClick={() => setActiveTab('followers')}>
                  <strong>{followers.length}</strong>
                  <span>Followers</span>
                </div>
                <div className="stat-item clickable" onClick={() => setActiveTab('following')}>
                  <strong>{following.length}</strong>
                  <span>Following</span>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="profile-content-layout">
            
            <div className="sticky-nav-wrapper">
              <div className="glass-tabs-panel">
                {[
                  { id: 'posts', label: 'Posts', icon: List },
                  { id: 'media', label: 'Media', icon: Grid },
                  { id: 'groups', label: 'Groups', icon: Users },
                  { id: 'followers', label: 'Followers', icon: UserPlus },
                  { id: 'following', label: 'Following', icon: UserMinus },
                  ...(isOwnProfile ? [{ id: 'saved', label: 'Saved', icon: Bookmark }] : [])
                ].map(tab => (
                  <button 
                    key={tab.id}
                    className={`profile-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <tab.icon size={18} />
                    <span>{tab.label}</span>
                    {activeTab === tab.id && (
                      <motion.div 
                        layoutId="activeTab" 
                        className="active-highlight" 
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="tab-content-area"
              >
                {activeTab === 'posts' && (
                  <div className="feed-column">
                    {posts.length > 0 ? (
                      posts.map(post => (
                        <PostCard 
                          key={post.postId} 
                          post={post} 
                          onDelete={isOwnProfile ? () => handleDeletePost(post.postId) : null}
                          onSaveToggle={(postId, isSaved) => {
                            setPosts(prev => prev.map(p => 
                              p.postId === postId ? { ...p, userSaved: isSaved } : p
                            ));
                            if (isSaved) {
                              const savedPost = posts.find(p => p.postId === postId);
                              if (savedPost) {
                                setSavedPosts(prev => {
                                  const exists = prev.some(p => p.postId === postId);
                                  return exists ? prev : [{ ...savedPost, userSaved: true }, ...prev];
                                });
                              }
                            } else {
                              setSavedPosts(prev => prev.filter(p => p.postId !== postId));
                            }
                          }}
                        />
                      ))
                    ) : (
                      <EmptyState text="No posts yet" icon={<List size={40} />} />
                    )}
                  </div>
                )}

                {activeTab === 'media' && (
                  <div className="media-masonry">
                    {mediaPosts.length > 0 ? (
                      mediaPosts.map(post => (
                        <div 
                          key={post.postId} 
                          className="media-tile" 
                          onClick={() => navigate(`/post/${post.postId}`)}
                        >
                          <img 
                            src={post.media?.[0]?.thumbnail || post.media?.[0]?.url || post.imageUrl} 
                            alt="" 
                          />
                        </div>
                      ))
                    ) : (
                      <EmptyState text="No media shared" icon={<ImageIcon size={40}/>} />
                    )}
                  </div>
                )}

                {activeTab === 'groups' && (
                  <div className="groups-grid">
                    {ownedGroups.map(g => (
                      <div key={g.groupId} className="glass-group-card-enhanced">
                        <div className="group-card-header" onClick={() => navigate(`/g/${g.name}`)}>
                          <div className="group-avatar">
                            {g.icon || g.avatar ? (
                              <img src={g.icon || g.avatar} alt={g.displayName || g.name} />
                            ) : (
                              (g.displayName || g.name)[0].toUpperCase()
                            )}
                          </div>
                          <div className="group-info">
                            <h4>{g.displayName || g.name}</h4>
                            <span>👥 {g.memberCount || 0} members</span>
                          </div>
                        </div>
                        <div className="group-card-actions">
                          <Button 
                            size="small" 
                            variant="primary" 
                            onClick={() => navigate(`/g/${g.name}/settings`)}
                          >
                            <Settings size={14} /> Manage
                          </Button>
                        </div>
                      </div>
                    ))}
                    {joinedGroups.map(g => (
                      <div key={g.groupId} className="glass-group-card-enhanced">
                        <div className="group-card-header" onClick={() => navigate(`/g/${g.name}`)}>
                          <div className="group-avatar">
                            {g.icon || g.avatar ? (
                              <img src={g.icon || g.avatar} alt={g.displayName || g.name} />
                            ) : (
                              (g.displayName || g.name)[0].toUpperCase()
                            )}
                          </div>
                          <div className="group-info">
                            <h4>{g.displayName || g.name}</h4>
                            <span>👥 {g.memberCount || 0} members</span>
                          </div>
                        </div>
                        <div className="group-card-actions">
                          <Button 
                            size="small" 
                            variant="outline" 
                            onClick={() => handleLeaveGroup(g)}
                          >
                            <UserMinus size={14} /> Leave
                          </Button>
                        </div>
                      </div>
                    ))}
                    {[...ownedGroups, ...joinedGroups].length === 0 && (
                      <EmptyState text="No groups joined" icon={<Users size={40}/>} />
                    )}
                  </div>
                )}
                
                {activeTab === 'followers' && (
                  <div className="users-list-grid">
                    {followers.map(u => (
                      <UserCard 
                        key={u.userId} 
                        user={u} 
                        showRemove={isOwnProfile}
                        onRemove={handleRemoveFollower}
                      />
                    ))}
                    {followers.length === 0 && (
                      <EmptyState text="No followers yet" icon={<Users size={40}/>} />
                    )}
                  </div>
                )}

                {activeTab === 'following' && (
                  <div className="users-list-grid">
                    {following.map(u => (
                      <UserCard 
                        key={u.userId} 
                        user={u} 
                        showUnfollow={isOwnProfile}
                        onUnfollow={handleUnfollowUser}
                      />
                    ))}
                    {following.length === 0 && (
                      <EmptyState text="Not following anyone" icon={<UserPlus size={40}/>} />
                    )}
                  </div>
                )}

                {activeTab === 'saved' && isOwnProfile && (
                  <div className="feed-column">
                    {savedPosts.length > 0 ? (
                      savedPosts.map(post => (
                        <PostCard 
                          key={post.postId} 
                          post={post}
                          onSaveToggle={(postId, isSaved) => {
                            if (!isSaved) {
                              setSavedPosts(prev => prev.filter(p => p.postId !== postId));
                            }
                          }}
                        />
                      ))
                    ) : (
                      <EmptyState text="No saved items" icon={<Bookmark size={40}/>} />
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

          </div>
        </div>

        <ImageUploadModal 
          isOpen={showAvatarModal} 
          onClose={() => setShowAvatarModal(false)} 
          onSave={handleAvatarModalSave}
          type="avatar"
          currentImage={profile.avatar}
        />
        <ImageUploadModal 
          isOpen={showBannerModal} 
          onClose={() => setShowBannerModal(false)} 
          onSave={handleBannerModalSave}
          type="banner"
          currentImage={profile.banner}
        />
      </div>
    </>
  );
};

const EmptyState = ({ text, icon }) => (
  <div className="empty-state-glass">
    <div className="empty-icon">{icon || <List size={40} />}</div>
    <p>{text}</p>
  </div>
);

const UserCard = ({ user, showUnfollow, showRemove, onUnfollow, onRemove }) => {
  const navigate = useNavigate();
  
  return (
    <div className="glass-user-card-mini">
      <div className="user-mini-avatar" onClick={() => navigate(`/u/${user.username}`)} style={{ cursor: 'pointer' }}>
        {user.avatar ? (
          <img src={user.avatar} alt="" />
        ) : (
          user.username?.[0]?.toUpperCase() || 'U'
        )}
      </div>
      <div className="user-mini-info" onClick={() => navigate(`/u/${user.username}`)} style={{ cursor: 'pointer' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.displayName || user.username || 'Unknown'}
        </h4>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          @{user.username || 'unknown'}
        </span>
      </div>
      <div className="user-card-actions">
        {showUnfollow && (
          <Button 
            size="small" 
            variant="outline" 
            onClick={() => onUnfollow(user)}
          >
            <UserMinus size={14} /> Unfollow
          </Button>
        )}
        {showRemove && (
          <Button 
            size="small" 
            variant="outline" 
            onClick={() => onRemove(user)}
          >
            <X size={14} /> Remove
          </Button>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
