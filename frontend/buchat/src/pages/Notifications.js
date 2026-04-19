import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
// eslint-disable-next-line no-unused-vars
import { Bell, MessageCircle, Heart, UserPlus, Award, TrendingUp, Shield, CheckCheck, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useAuth } from '../contexts/AuthContext';
import { groupService } from '../services/groupService';
import './Notifications.css';

const Notifications = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Notifications - BuChat';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, navigate]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/notifications?userId=${user.userId}`);
      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (error) {
      
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  const markAsRead = async (notificationId) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId })
      });
      setNotifications(prev => prev.map(n => 
        n.notificationId === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
      
    }
  };

  const handleClearAll = () => {
    toast(
      ({ closeToast }) => (
        <div>
          <p style={{ marginBottom: '12px', fontWeight: 500 }}>Clear all notifications?</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={closeToast}
              style={{
                padding: '8px 16px',
                border: '1px solid #e2e8f0',
                background: 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setNotifications([]);
                closeToast();
                toast.success('All notifications cleared');
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: '#dc2626',
                color: 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ),
      { position: 'top-center', autoClose: false, closeButton: false }
    );
  };

  const handleModInvite = async (groupName, inviteId, accept) => {
    try {
      await groupService.respondModInvite(groupName, inviteId, user.userId, accept);
      toast.success(accept ? 'Moderator invite accepted!' : 'Invite declined');
      fetchNotifications();
    } catch (error) {
      toast.error('Failed to respond to invite');
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'upvote':
        return <TrendingUp size={20} className="notif-icon upvote" />;
      case 'comment':
        return <MessageCircle size={20} className="notif-icon comment" />;
      case 'follow':
        return <UserPlus size={20} className="notif-icon follow" />;
      case 'award':
        return <Award size={20} className="notif-icon award" />;
      case 'mod_invite':
        return <Shield size={20} className="notif-icon mod-invite" />;
      case 'message':
        return <MessageCircle size={20} className="notif-icon message" />;
      default:
        return <Bell size={20} className="notif-icon" />;
    }
  };

  const getTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => !n.read);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="notifications-container">
        <div className="page-header">
          <h1>Notifications</h1>
          <div className="header-actions">
            <div className="filter-buttons">
              <button
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={filter === 'unread' ? 'active' : ''}
                onClick={() => setFilter('unread')}
              >
                Unread
              </button>
            </div>
            {notifications.length > 0 && (
              <div className="action-buttons">
                <Button
                  size="small"
                  variant="ghost"
                  onClick={handleMarkAllRead}
                  disabled={notifications.every(n => n.read)}
                >
                  <CheckCheck size={16} /> Mark all read
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={handleClearAll}
                >
                  <Trash2 size={16} /> Clear all
                </Button>
              </div>
            )}
          </div>
        </div>

        <Card className="notifications-card">
          {filteredNotifications.length > 0 ? (
            <div className="notifications-list">
              {filteredNotifications.map((notif, index) => (
                <motion.div
                  key={notif.id}
                  className={`notification-item ${!notif.read ? 'unread' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="notif-icon-wrapper">
                    {getIcon(notif.type)}
                  </div>
                  <div className="notif-content">
                    <p>
                      {notif.type === 'mod_invite' ? (
                        <>
                          Invited to be moderator of{' '}
                          <Link to={`/g/${notif.groupName}`} className="notif-user">
                            c/{notif.groupName}
                          </Link>
                        </>
                      ) : notif.type === 'message' ? (
                        <>
                          <span className="notif-title">{notif.title}</span>
                          <br />
                          <span className="notif-message">{notif.message}</span>
                        </>
                      ) : (
                        <>
                          <Link to={`/u/${notif.user}`} className="notif-user">
                            u/{notif.user}
                          </Link>{' '}
                          {notif.content}
                          {notif.postTitle && (
                            <>
                              {' '}
                              <span className="notif-post">"{notif.postTitle}"</span>
                            </>
                          )}
                        </>
                      )}
                    </p>
                    {notif.type === 'mod_invite' && notif.permissions && (
                      <div className="mod-perms">
                        {notif.permissions.removePosts && <span>Remove Posts</span>}
                        {notif.permissions.removeMembers && <span>Remove Members</span>}
                        {notif.permissions.banMembers && <span>Ban Members</span>}
                        {notif.permissions.changeVisibility && <span>Change Visibility</span>}
                      </div>
                    )}
                    <span className="notif-time">{getTimeAgo(new Date(notif.createdAt))}</span>
                    {notif.type === 'message' && (
                      <Link 
                        to={`/messages?user=${notif.fromUserId}`} 
                        className="notif-action-link"
                        onClick={() => markAsRead(notif.notificationId)}
                      >
                        Reply
                      </Link>
                    )}
                    {notif.type === 'mod_invite' && (
                      <div className="notif-actions">
                        <Button size="small" onClick={() => handleModInvite(notif.groupName, notif.inviteId, true)}>
                          Accept
                        </Button>
                        <Button size="small" variant="ghost" onClick={() => handleModInvite(notif.groupName, notif.inviteId, false)}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                  {!notif.read && <div className="unread-dot"></div>}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Bell size={48} />
              <p>No notifications</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Notifications;
