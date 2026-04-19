import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { Trash2, Users as UsersIcon } from 'lucide-react';
import { format } from 'date-fns';

function Communities() {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [deleteData, setDeleteData] = useState({ confirmation: '', reason: '' });

  useEffect(() => {
    fetchCommunities();
  }, []);

  const fetchCommunities = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getCommunities();
      setCommunities(response.data);
    } catch (err) {
      notify.error('Failed to fetch communities');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteData.confirmation !== 'DELETE') {
      notify.error('Please type DELETE to confirm');
      return;
    }
    if (!deleteData.reason) {
      notify.error('Please provide a reason');
      return;
    }
    
    try {
      await notify.promise(
        adminAPI.deleteCommunity(selectedCommunity, { reason: deleteData.reason }),
        {
          loading: 'Deleting community...',
          success: 'Community deleted successfully',
          error: 'Failed to delete community'
        }
      );
      setShowDeleteModal(false);
      setDeleteData({ confirmation: '', reason: '' });
      fetchCommunities();
    } catch (err) {
      console.error(err);
    }
  };

  const openDeleteModal = (communityId) => {
    setSelectedCommunity(communityId);
    setShowDeleteModal(true);
    setDeleteData({ confirmation: '', reason: '' });
  };

  const columns = [
    {
      header: 'Name',
      accessor: 'name',
      render: (community) => (
        <div>
          <strong>{community.name}</strong>
          {community.description && (
            <p style={{ 
              fontSize: '12px', 
              color: '#666', 
              marginTop: '5px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '300px'
            }}>
              {community.description}
            </p>
          )}
        </div>
      )
    },
    {
      header: 'Members',
      accessor: 'memberCount',
      render: (community) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <UsersIcon size={16} />
          <strong>{community.memberCount || 0}</strong>
        </div>
      )
    },
    {
      header: 'Posts',
      accessor: 'postCount',
      render: (community) => community.postCount || 0
    },
    {
      header: 'Created',
      accessor: 'createdAt',
      render: (community) => community.createdAt 
        ? format(new Date(community.createdAt), 'MMM dd, yyyy')
        : 'N/A'
    },
    {
      header: 'Status',
      render: (community) => (
        <Badge variant={community.isActive ? 'success' : 'danger'}>
          {community.isActive ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    {
      header: 'Actions',
      render: (community) => (
        <div className="action-buttons">
          <button 
            className="btn-icon btn-danger"
            onClick={() => openDeleteModal(community.communityId)}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Communities Management</h1>
          <p className="subtitle">Manage all communities and groups</p>
        </div>
      </div>

      <div className="card">
        <DataTable
          data={communities}
          columns={columns}
          searchPlaceholder="Search communities..."
          itemsPerPage={15}
        />
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Community"
        footer={
          <>
            <button className="btn" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete Community
            </button>
          </>
        }
      >
        <div className="form-group">
          <p style={{ marginBottom: '15px', color: '#dc3545' }}>
            ⚠️ This will permanently delete the community and ALL its content.
          </p>
          <label>Reason for deletion</label>
          <textarea
            placeholder="Enter reason"
            value={deleteData.reason}
            onChange={(e) => setDeleteData({ ...deleteData, reason: e.target.value })}
            rows="3"
          />
        </div>
        <div className="form-group">
          <label>Type "DELETE" to confirm</label>
          <input
            type="text"
            placeholder="DELETE"
            value={deleteData.confirmation}
            onChange={(e) => setDeleteData({ ...deleteData, confirmation: e.target.value })}
          />
        </div>
      </Modal>
    </Layout>
  );
}

export default Communities;
