import React, { useState } from 'react';
import { User, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import Input from '../common/Input';
import Button from '../common/Button';
import Card from '../common/Card';
import { userService } from '../../services/userService';
import './ProfileSetupModal.css';

const ProfileSetupModal = ({ tempUser, onComplete }) => {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const checkUsername = async (value) => {
    if (value.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    
    setCheckingUsername(true);
    try {
      const result = await userService.checkUsername(value);
      setUsernameAvailable(result.available);
    } catch (error) {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(value);
    if (value.length >= 3) {
      checkUsername(value);
    } else {
      setUsernameAvailable(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    if (!usernameAvailable) {
      toast.error('Please choose an available username');
      return;
    }

    setLoading(true);
    try {
      const result = await userService.completeGoogleProfile({
        tempUsername: tempUser.username,
        username,
        bio
      });
      
      onComplete(result);
      toast.success('Profile setup complete!');
    } catch (error) {
      toast.error(error.message || 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-setup-overlay">
      <Card className="profile-setup-modal">
        <h2>Complete Your Profile</h2>
        <p className="setup-subtitle">Choose your username and tell us about yourself</p>
        
        <form onSubmit={handleSubmit} className="setup-form">
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder="Choose a unique username"
            icon={<User size={18} />}
            required
            helperText={
              checkingUsername ? 'Checking...' :
              usernameAvailable === true ? '✓ Available' :
              usernameAvailable === false ? '✗ Taken' :
              'Lowercase letters, numbers, and underscores only'
            }
            error={usernameAvailable === false}
          />

          <Input
            label="Bio (Optional)"
            type="textarea"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            icon={<FileText size={18} />}
            maxLength={200}
          />

          <Button
            type="submit"
            fullWidth
            loading={loading}
            disabled={loading || !usernameAvailable}
          >
            Complete Setup
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ProfileSetupModal;
