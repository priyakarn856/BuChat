import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { Trash2, Eye } from 'lucide-react';
import { format } from 'date-fns';

function Comments() {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedComment, setSelectedComment] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);

  useEffect(() => {
    fetchComments();
  }, []);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getComments();
      setComments(response.data);
    } catch (err) {
      notify.error('Failed to fetch comments');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (commentId, postId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      await notify.promise(
        adminAPI.deleteComment(commentId),
        {
          loading: 'Deleting comment...',
          success: 'Comment deleted successfully',
          error: 'Failed to delete comment'
        }
      );
      fetchComments();
    } catch (err) {
      console.error(err);
    }
  };

  const viewComment = (comment) => {
    setSelectedComment(comment);
    setShowViewModal(true);
  };

  const columns = [
    {
      header: 'Content',
      accessor: 'content',
      render: (comment) => (
        <div style={{ maxWidth: '400px' }}>
          {comment.content ? (
            comment.content.length > 100 
              ? comment.content.substring(0, 100) + '...'
              : comment.content
          ) : 'No content'}
        </div>
      )
    },
    {
      header: 'Author',
      accessor: 'username',
      render: (comment) => comment.username || 'Unknown'
    },
    {
      header: 'Post ID',
      accessor: 'postId',
      render: (comment) => (
        <Badge variant="info">{comment.postId?.substring(0, 8) || 'N/A'}</Badge>
      )
    },
    {
      header: 'Posted',
      accessor: 'createdAt',
      render: (comment) => comment.createdAt 
        ? format(new Date(comment.createdAt), 'MMM dd, yyyy HH:mm')
        : 'N/A'
    },
    {
      header: 'Actions',
      render: (comment) => (
        <div className="action-buttons">
          <button 
            className="btn-icon btn-primary"
            onClick={() => viewComment(comment)}
            title="View Details"
          >
            <Eye size={16} />
          </button>
          <button 
            className="btn-icon btn-danger"
            onClick={() => handleDelete(comment.commentId, comment.postId)}
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
          <h1>Comments Management</h1>
          <p className="subtitle">Manage all user comments</p>
        </div>
      </div>

      <div className="card">
        <DataTable
          data={comments}
          columns={columns}
          searchPlaceholder="Search comments..."
          itemsPerPage={20}
        />
      </div>

      {/* View Comment Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title="Comment Details"
        size="md"
      >
        {selectedComment && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <strong>Author:</strong> {selectedComment.username}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <strong>Posted:</strong> {selectedComment.createdAt ? format(new Date(selectedComment.createdAt), 'MMMM dd, yyyy HH:mm') : 'N/A'}
            </div>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '8px',
              whiteSpace: 'pre-wrap'
            }}>
              {selectedComment.content}
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

export default Comments;
