import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, MapPin, Link as LinkIcon, Camera, Image as ImageIcon, Save, X } from 'lucide-react';
import { toast } from 'react-toastify';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

const Settings = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    displayName: '',
    bio: '',
    location: '',
    website: '',
    avatar: '',
    banner: ''
  });

  // File state
  const [avatarFile, setAvatarFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName || '',
        bio: user.bio || '',
        location: user.location || '',
        website: user.website || '',
        avatar: user.avatar || '',
        banner: user.banner || ''
      });
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Avatar must be less than 5MB');
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleBannerChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Banner must be less than 5MB');
        return;
      }
      setBannerFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setBannerPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUploading(true);

    try {
      let updatedData = { ...formData };

      // Upload avatar if changed
      if (avatarFile) {
        toast.info('Uploading avatar...');
        const { url } = await userService.uploadImage(avatarFile);
        updatedData.avatar = url;
      }

      // Upload banner if changed
      if (bannerFile) {
        toast.info('Uploading banner...');
        const { url } = await userService.uploadImage(bannerFile);
        updatedData.banner = url;
      }

      // Update profile
      await userService.updateUserProfile(user.username, updatedData);
      
      // Update local user data
      if (updateUser) {
        updateUser({ ...user, ...updatedData });
      }

      // Reset file states
      setAvatarFile(null);
      setBannerFile(null);
      setAvatarPreview(null);
      setBannerPreview(null);

      toast.success('Settings saved successfully!');
    } catch (error) {
      
      toast.error(error.message || 'Failed to update settings');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        displayName: user.displayName || '',
        bio: user.bio || '',
        location: user.location || '',
        website: user.website || '',
        avatar: user.avatar || '',
        banner: user.banner || ''
      });
    }
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview(null);
    setBannerPreview(null);
  };

  if (!user) {
    return (
      <div className="settings-page">
        <Card>
          <p>Please login to access settings</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="settings-card">
          <h1 className="settings-title">Account Settings</h1>
          <p className="settings-subtitle">Manage your profile and preferences</p>

          <form onSubmit={handleSubmit} className="settings-form">
            {/* Banner Upload */}
            <div className="form-section">
              <h2 className="section-title">Profile Banner</h2>
              <div className="banner-upload-container">
                <div 
                  className="banner-preview"
                  style={{
                    backgroundImage: bannerPreview 
                      ? `url(${bannerPreview})`
                      : formData.banner 
                      ? `url(${formData.banner})`
                      : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)'
                  }}
                >
                  <label className="upload-banner-btn">
                    <ImageIcon size={20} />
                    Upload Banner
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                {bannerPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      setBannerFile(null);
                      setBannerPreview(null);
                    }}
                  >
                    <X size={16} /> Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Avatar Upload */}
            <div className="form-section">
              <h2 className="section-title">Profile Picture</h2>
              <div className="avatar-upload-container">
                <div className="avatar-preview-large">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar preview" />
                  ) : formData.avatar ? (
                    <img src={formData.avatar} alt="Current avatar" />
                  ) : (
                    <div className="avatar-placeholder">
                      {user.username[0].toUpperCase()}
                    </div>
                  )}
                  <label className="upload-avatar-btn">
                    <Camera size={18} />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                {avatarPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarPreview(null);
                    }}
                  >
                    <X size={16} /> Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Profile Information */}
            <div className="form-section">
              <h2 className="section-title">Profile Information</h2>
              
              <div className="form-group">
                <label>
                  <User size={18} />
                  Display Name
                </label>
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  placeholder="Your display name"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>
                  <Mail size={18} />
                  Bio
                </label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  className="form-textarea"
                  maxLength={500}
                />
                <span className="char-count">{formData.bio.length}/500</span>
              </div>

              <div className="form-group">
                <label>
                  <MapPin size={18} />
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="City, Country"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>
                  <LinkIcon size={18} />
                  Website
                </label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://yourwebsite.com"
                  className="form-input"
                />
              </div>
            </div>

            {/* Account Details (Read-only) */}
            <div className="form-section">
              <h2 className="section-title">Account Details</h2>
              <div className="account-info">
                <div className="info-item">
                  <span className="info-label">Username</span>
                  <span className="info-value">@{user.username}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Email</span>
                  <span className="info-value">{user.email || 'Not set'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Member Since</span>
                  <span className="info-value">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
              >
                {uploading ? (
                  <>
                    <span className="spinner" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default Settings;
