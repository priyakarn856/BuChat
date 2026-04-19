import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { Trash2, Eye, EyeOff, MessageSquare, ThumbsUp } from 'lucide-react';
import { format } from 'date-fns';

function Posts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getPosts();
      setPosts(response.data);
    } catch (err) {
      notify.error('Failed to fetch posts');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    
    try {
      await notify.promise(
        adminAPI.deletePost(postId),
        {
          loading: 'Deleting post...',
          success: 'Post deleted successfully',
          error: 'Failed to delete post'
        }
      );
      fetchPosts();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleVisibility = async (postId) => {
    try {
      await notify.promise(
        adminAPI.togglePostVisibility(postId),
        {
          loading: 'Updating visibility...',
          success: 'Post visibility updated',
          error: 'Failed to update visibility'
        }
      );
      fetchPosts();
    } catch (err) {
      console.error(err);
    }
  };

  const viewPost = (post) => {
    setSelectedPost(post);
    setShowViewModal(true);
  };

  const columns = [
    {
      header: 'Title',
      accessor: 'title',
      render: (post) => (
        <div style={{ maxWidth: '300px' }}>
          <strong>{post.title || 'Untitled'}</strong>
          {post.content && (
            <p style={{ 
              fontSize: '12px', 
              color: '#666', 
              marginTop: '5px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {post.content}
            </p>
          )}
        </div>
      )
    },
    {
      header: 'Author',
      accessor: 'username',
      render: (post) => post.username || 'Unknown'
    },
    {
      header: 'Community',
      accessor: 'communityName',
      render: (post) => (
        <Badge variant="info">{post.communityName || 'N/A'}</Badge>
      )
    },
    {
      header: 'Engagement',
      render: (post) => (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <ThumbsUp size={14} /> {post.voteCount || 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <MessageSquare size={14} /> {post.commentCount || 0}
          </span>
        </div>
      )
    },
    {
      header: 'Posted',
      accessor: 'createdAt',
      render: (post) => post.createdAt 
        ? format(new Date(post.createdAt), 'MMM dd, yyyy')
        : 'N/A'
    },
    {
      header: 'Status',
      accessor: 'isHidden',
      render: (post) => (
        <Badge variant={post.isHidden ? 'warning' : 'success'}>
          {post.isHidden ? 'Hidden' : 'Visible'}
        </Badge>
      )
    },
    {
      header: 'Actions',
      render: (post) => (
        <div className="action-buttons">
          <button 
            className="btn-icon btn-primary"
            onClick={() => viewPost(post)}
            title="View Details"
          >
            <Eye size={16} />
          </button>
          <button 
            className="btn-icon btn-warning"
            onClick={() => toggleVisibility(post.postId)}
            title={post.isHidden ? 'Show' : 'Hide'}
          >
            {post.isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button 
            className="btn-icon btn-danger"
            onClick={() => handleDelete(post.postId)}
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
          <h1>Posts Management</h1>
          <p className="subtitle">Manage all posts and content</p>
        </div>
      </div>

      <div className="card">
        <DataTable
          data={posts}
          columns={columns}
          searchPlaceholder="Search posts by title..."
          itemsPerPage={15}
        />
      </div>

      {/* View Post Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title="Post Details"
        size="lg"
      >
        {selectedPost && (
          <div className="post-details">
            <h2>{selectedPost.title}</h2>
            <div className="post-meta" style={{ marginTop: '10px', marginBottom: '20px', color: '#666' }}>
              <span>By {selectedPost.username}</span> • 
              <span> in {selectedPost.communityName}</span> • 
              <span> {selectedPost.createdAt ? format(new Date(selectedPost.createdAt), 'MMMM dd, yyyy HH:mm') : 'N/A'}</span>
            </div>
            {selectedPost.content && (
              <div className="post-content" style={{ 
                background: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '8px',
                marginTop: '15px'
              }}>
                {selectedPost.content}
              </div>
            )}
            <div style={{ marginTop: '20px', display: 'flex', gap: '20px' }}>
              <div>
                <strong>Votes:</strong> {selectedPost.voteCount || 0}
              </div>
              <div>
                <strong>Comments:</strong> {selectedPost.commentCount || 0}
              </div>
              <div>
                <strong>Status:</strong> {selectedPost.isHidden ? 'Hidden' : 'Visible'}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

export default Posts;
