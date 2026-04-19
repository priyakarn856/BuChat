import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { UserCheck, UserX, Trash2, Shield, Eye, Download } from 'lucide-react';
import { format } from 'date-fns';

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [userDetails, setUserDetails] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers();
      setUsers(response.data);
    } catch (err) {
      notify.error('Failed to fetch users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async () => {
    try {
      await notify.promise(
        adminAPI.banUser(selectedUser, {
          reason: formData.reason,
          duration: formData.duration ? parseInt(formData.duration) : null
        }),
        {
          loading: 'Banning user...',
          success: 'User banned successfully',
          error: 'Failed to ban user'
        }
      );
      setShowModal(false);
      setFormData({});
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSuspendUser = async () => {
    try {
      await notify.promise(
        adminAPI.suspendUser(selectedUser, {
          duration: parseInt(formData.duration),
          reason: formData.reason
        }),
        {
          loading: 'Suspending user...',
          success: 'User suspended successfully',
          error: 'Failed to suspend user'
        }
      );
      setShowModal(false);
      setFormData({});
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async () => {
    if (formData.confirmation !== 'DELETE') {
      notify.error('Please type DELETE to confirm');
      return;
    }
    
    try {
      await notify.promise(
        adminAPI.deleteUser(selectedUser),
        {
          loading: 'Deleting user...',
          success: 'User deleted permanently',
          error: 'Failed to delete user'
        }
      );
      setShowModal(false);
      setFormData({});
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const viewUserDetails = async (user) => {
    try {
      const response = await adminAPI.getUserDetails(user.userId);
      setUserDetails(response.data);
      setShowDetailsModal(true);
    } catch (err) {
      notify.error('Failed to fetch user details');
    }
  };

  const openModal = (type, userId) => {
    setModalType(type);
    setSelectedUser(userId);
    setShowModal(true);
    setFormData({});
  };

  const exportUsers = () => {
    const csv = [
      ['Username', 'Email', 'Karma', 'Status', 'Created At'].join(','),
      ...users.map(u => [
        u.username,
        u.email,
        u.karma || 0,
        u.isBanned ? 'Banned' : 'Active',
        u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    notify.success('Users exported successfully');
  };

  const columns = [
    {
      header: 'Username',
      accessor: 'username',
      render: (user) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="user-avatar">
            {user.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <strong>{user.username || 'Unknown'}</strong>
        </div>
      )
    },
    {
      header: 'Email',
      accessor: 'email',
      render: (user) => user.email || 'N/A'
    },
    {
      header: 'Karma',
      accessor: 'karma',
      render: (user) => (
        <span style={{ fontWeight: 'bold', color: '#667eea' }}>
          {user.karma || 0}
        </span>
      )
    },
    {
      header: 'Status',
      accessor: 'isBanned',
      render: (user) => (
        <Badge variant={user.isBanned ? 'danger' : 'success'}>
          {user.isBanned ? 'Banned' : 'Active'}
        </Badge>
      )
    },
    {
      header: 'Joined',
      accessor: 'createdAt',
      render: (user) => user.createdAt 
        ? format(new Date(user.createdAt), 'MMM dd, yyyy')
        : 'N/A'
    },
    {
      header: 'Actions',
      render: (user) => (
        <div className="action-buttons">
          <button 
            className="btn-icon" 
            onClick={() => viewUserDetails(user)}
            title="View Details"
          >
            <Eye size={16} />
          </button>
          <button 
            className={`btn-icon ${user.isBanned ? 'btn-success' : 'btn-warning'}`}
            onClick={() => openModal('ban', user.userId)}
            title={user.isBanned ? 'Unban' : 'Ban'}
          >
            {user.isBanned ? <UserCheck size={16} /> : <UserX size={16} />}
          </button>
          <button 
            className="btn-icon btn-warning"
            onClick={() => openModal('suspend', user.userId)}
            title="Suspend"
          >
            <Shield size={16} />
          </button>
          <button 
            className="btn-icon btn-danger"
            onClick={() => openModal('delete', user.userId)}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  const renderModalContent = () => {
    switch (modalType) {
      case 'ban':
        return (
          <>
            <div className="form-group">
              <label>Reason for ban</label>
              <textarea
                placeholder="Enter reason for ban"
                value={formData.reason || ''}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows="3"
              />
            </div>
            <div className="form-group">
              <label>Duration (days) - leave empty for permanent</label>
              <input
                type="number"
                placeholder="Optional - duration in days"
                value={formData.duration || ''}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              />
            </div>
          </>
        );
      
      case 'suspend':
        return (
          <>
            <div className="form-group">
              <label>Suspend duration (hours)</label>
              <input
                type="number"
                placeholder="Enter hours"
                value={formData.duration || ''}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Reason for suspension</label>
              <textarea
                placeholder="Enter reason"
                value={formData.reason || ''}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows="3"
                required
              />
            </div>
          </>
        );
      
      case 'delete':
        return (
          <div className="form-group">
            <p style={{ marginBottom: '15px', color: '#dc3545' }}>
              ⚠️ This action is permanent and will delete ALL user data including posts, comments, and messages.
            </p>
            <label>Type "DELETE" to confirm</label>
            <input
              type="text"
              placeholder="DELETE"
              value={formData.confirmation || ''}
              onChange={(e) => setFormData({ ...formData, confirmation: e.target.value })}
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  const getModalAction = () => {
    switch (modalType) {
      case 'ban': return handleBanUser;
      case 'suspend': return handleSuspendUser;
      case 'delete': return handleDeleteUser;
      default: return () => {};
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Users Management</h1>
          <p className="subtitle">Manage all users, permissions, and access</p>
        </div>
        <button className="btn btn-primary" onClick={exportUsers}>
          <Download size={18} />
          Export CSV
        </button>
      </div>

      <div className="card">
        <DataTable
          data={users}
          columns={columns}
          searchPlaceholder="Search by username or email..."
          itemsPerPage={15}
        />
      </div>

      {/* Action Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`${modalType.charAt(0).toUpperCase() + modalType.slice(1)} User`}
        footer={
          <>
            <button className="btn" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button 
              className={`btn ${modalType === 'delete' ? 'btn-danger' : 'btn-primary'}`}
              onClick={getModalAction()}
            >
              Confirm
            </button>
          </>
        }
      >
        {renderModalContent()}
      </Modal>

      {/* User Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="User Details"
        size="lg"
      >
        {userDetails && (
          <div className="user-details">
            <div className="detail-grid">
              <div className="detail-item">
                <strong>Username:</strong>
                <span>{userDetails.username}</span>
              </div>
              <div className="detail-item">
                <strong>Email:</strong>
                <span>{userDetails.email}</span>
              </div>
              <div className="detail-item">
                <strong>Karma:</strong>
                <span>{userDetails.karma || 0}</span>
              </div>
              <div className="detail-item">
                <strong>Posts:</strong>
                <span>{userDetails.postCount || 0}</span>
              </div>
              <div className="detail-item">
                <strong>Comments:</strong>
                <span>{userDetails.commentCount || 0}</span>
              </div>
              <div className="detail-item">
                <strong>Joined:</strong>
                <span>
                  {userDetails.createdAt 
                    ? format(new Date(userDetails.createdAt), 'MMMM dd, yyyy')
                    : 'N/A'
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

export default Users;
