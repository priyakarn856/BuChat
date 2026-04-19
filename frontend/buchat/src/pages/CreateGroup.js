import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, ArrowLeft, ShieldCheck, Hash, LayoutGrid, Type } from 'lucide-react';
import { toast } from 'react-toastify';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { groupService } from '../services/groupService';
import { useAuth } from '../contexts/AuthContext';
import './CreateGroup.css';

const CreateGroup = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    category: '',
  });
  const [loading, setLoading] = useState(false);
  const [nameValidationStatus, setNameValidationStatus] = useState('idle');
  const [nameCheckTimeout, setNameCheckTimeout] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const checkGroupNameAvailability = async (name) => {
    if (!name || name.length < 3) {
      setNameValidationStatus('idle');
      return;
    }

    setNameValidationStatus('checking');
    
    try {
      await groupService.getgroup(name.toLowerCase());
      setNameValidationStatus('taken');
    } catch (error) {
      if (error.response?.status === 404) {
        setNameValidationStatus('available');
      } else {
        setNameValidationStatus('idle');
      }
    }
  };

  const handleNameChange = (e) => {
    let value = e.target.value;
    value = value.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    setFormData({ ...formData, name: value });

    if (nameCheckTimeout) clearTimeout(nameCheckTimeout);

    const timeout = setTimeout(() => {
      checkGroupNameAvailability(value);
    }, 500);

    setNameCheckTimeout(timeout);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.displayName) {
      return toast.error('Please fill in Group Name and Display Name');
    }

    if (nameValidationStatus === 'taken') {
      return toast.error('Group name is already taken.');
    }

    setLoading(true);
    try {
      const groupData = {
        name: formData.name.toLowerCase().trim(),
        displayName: formData.displayName.trim(),
        description: formData.description.trim(),
        category: formData.category.trim(),
        userId: user.userId,
        username: user.username,
      };

      await groupService.creategroup(groupData);
      toast.success(`Group "${formData.displayName}" created!`);
      
      setTimeout(() => {
        navigate(`/c/${formData.name}`);
      }, 500);
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Failed to create group';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-group-page">
      <div className="create-group-container">
        
        {/* Back Button */}
        <div className="page-nav">
          <Button 
            variant="ghost" 
            icon={<ArrowLeft size={18} />}
            onClick={() => navigate(-1)}
            className="back-btn"
          >
            Back
          </Button>
        </div>

        <motion.div 
          className="create-group-glass-card"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="form-header-section">
            <div className="icon-glow-ring">
              <Users size={40} />
            </div>
            <h1>Create a Tribe</h1>
            <p>Build your community, start conversations, and connect.</p>
          </div>

          <form onSubmit={handleSubmit} className="create-group-form">
            
            <div className="form-section">
              <Input
                label="Group Handle"
                value={formData.name}
                onChange={handleNameChange}
                placeholder="gaming_legends"
                icon={<Hash size={18} />}
                required
                validationStatus={nameValidationStatus}
                helperText="Unique identifier (lowercase, no spaces)"
                error={nameValidationStatus === 'taken' ? 'Name unavailable' : ''}
              />

              <Input
                label="Display Name"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="Gaming Legends"
                icon={<Type size={18} />}
                required
                helperText="The public name of your community"
              />

              <div className="glass-input-group">
                <label className="input-label">Description <span className="required-mark">*</span></label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What is this community about?"
                  rows={5}
                  className="glass-textarea"
                  required
                />
              </div>

              <Input
                label="Category (Optional)"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g. Technology, Art"
                icon={<LayoutGrid size={18} />}
              />
            </div>

            {/* Guidelines Panel */}
            <div className="guidelines-glass-panel">
              <div className="guidelines-header">
                <ShieldCheck size={20} className="shield-icon" />
                <h3>Community Standards</h3>
              </div>
              <ul className="guidelines-list">
                <li>Choose a clear, descriptive name.</li>
                <li>Write a description that sets the tone.</li>
                <li>Be respectful and inclusive to all members.</li>
                <li>Adhere to BuChat's content policies.</li>
              </ul>
            </div>

            <div className="form-footer-actions">
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="primary"
                loading={loading} 
                disabled={loading || nameValidationStatus === 'checking' || nameValidationStatus === 'taken'}
              >
                Create Tribe
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default CreateGroup;
