import React, { useState, useEffect } from 'react';
import { X, Search, User, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userService } from '../../services/userService';
import './NewMessageModal.css';

const NewMessageModal = ({ isOpen, onClose, onSelectUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchType, setSearchType] = useState('both');

  useEffect(() => {
    if (isOpen && searchQuery.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchUsers();
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setUsers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchType, isOpen]);

  const searchUsers = async () => {
    try {
      setLoading(true);
      const response = await userService.searchUsers(searchQuery, { searchType });
      setUsers(response.users || []);
    } catch (error) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
  };

  const handleStartConversation = () => {
    if (selectedUser) {
      onSelectUser(selectedUser);
      // Reset state
      setSelectedUser(null);
      setSearchQuery('');
      setUsers([]);
    }
  };

  const handleClose = () => {
    setSelectedUser(null);
    setSearchQuery('');
    setUsers([]);
    onClose();
  };

  // eslint-disable-next-line no-unused-vars
  const formatLastActive = (timestamp) => {
    const now = new Date();
    const lastActive = new Date(timestamp);
    const diffMs = now - lastActive;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        className="new-message-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div 
          className="new-message-modal"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="new-message-header">
            <h3>New Message</h3>
            <button className="new-message-close" onClick={handleClose}>
              <X size={20} />
            </button>
          </div>

          <div className="new-message-search">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by username or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {loading && <Loader size={16} className="search-loader spin" />}
          </div>

          <div className="search-type-tabs">
            <button 
              className={searchType === 'both' ? 'active' : ''}
              onClick={() => setSearchType('both')}
            >
              All
            </button>
            <button 
              className={searchType === 'username' ? 'active' : ''}
              onClick={() => setSearchType('username')}
            >
              Username
            </button>
            <button 
              className={searchType === 'displayName' ? 'active' : ''}
              onClick={() => setSearchType('displayName')}
            >
              Display Name
            </button>
          </div>

          <div className="new-message-results">
            {searchQuery.length < 2 ? (
              <div className="empty-prompt">
                <User size={64} className="empty-icon" />
                <h4>Search for users</h4>
                <p>Type at least 2 characters to find people</p>
              </div>
            ) : users.length === 0 && !loading ? (
              <div className="empty-prompt">
                <User size={64} className="empty-icon" />
                <h4>No users found</h4>
                <p>Try a different search term</p>
              </div>
            ) : (
              <div className="users-grid">
                {users.map((user) => (
                  <motion.div
                    key={user.userId}
                    className={`user-card ${selectedUser?.userId === user.userId ? 'selected' : ''}`}
                    onClick={() => handleSelectUser(user)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="user-card-avatar">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.username} />
                      ) : (
                        <div className="avatar-fallback">
                          {user.username?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                      )}
                      {selectedUser?.userId === user.userId && (
                        <div className="selected-check">✓</div>
                      )}
                    </div>
                    <div className="user-card-info">
                      <h4>{user.displayName || user.username}</h4>
                      <p>@{user.username}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {selectedUser && (
            <motion.div 
              className="new-message-footer"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <button className="cancel-btn" onClick={handleClose}>
                Cancel
              </button>
              <button className="start-btn" onClick={handleStartConversation}>
                Message @{selectedUser.username}
              </button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NewMessageModal;