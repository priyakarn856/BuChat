import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { userService } from '../services/userService';
import './Auth.css';

const ResetPassword = () => {
  const [formData, setFormData] = useState({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Pre-fill email if coming from forgot password page
    if (location.state?.email) {
      setFormData((prev) => ({ ...prev, email: location.state.email }));
    }
  }, [location.state]);

  useEffect(() => {
    if (formData.confirmPassword) {
      setPasswordsMatch(formData.newPassword === formData.confirmPassword);
    } else {
      setPasswordsMatch(true);
    }
  }, [formData.newPassword, formData.confirmPassword]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email.trim() || !formData.code.trim() || !formData.newPassword.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (formData.code.length !== 6) {
      toast.error('Reset code must be 6 characters');
      return;
    }

    if (formData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await userService.resetPassword(
        formData.email.toLowerCase(),
        formData.code,
        formData.newPassword
      );
      toast.success('Password reset successfully! Please login with your new password.');
      navigate('/login');
    } catch (error) {
      const errorMessage = error.message || error.response?.data?.message || 'Failed to reset password';
      
      if (errorMessage.includes('user not found') || errorMessage.includes('404')) {
        toast.error('No account found with this email address.');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('incorrect')) {
        toast.error('Invalid reset code. Please check and try again.');
      } else if (errorMessage.includes('expired')) {
        toast.error('Reset code has expired. Please request a new one.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="auth-card">
          <div className="auth-header">
            <div className="auth-icon">
              <Lock size={32} />
            </div>
            <h1>Reset Password</h1>
            <p>Enter the code we sent to your email and create a new password.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your.email@example.com"
              icon={<Mail size={18} />}
              required
            />

            <Input
              label="Reset Code"
              name="code"
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().trim() })}
              placeholder="Enter 6-digit code"
              maxLength={6}
              required
              className="text-center tracking-widest text-2xl"
            />

            <Input
              label="New Password"
              name="newPassword"
              type="password"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="At least 8 characters"
              icon={<Lock size={18} />}
              required
              error={formData.newPassword && formData.newPassword.length > 0 && formData.newPassword.length < 8 ? 'Password must be at least 8 characters' : ''}
            />

            <Input
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter your new password"
              icon={<Lock size={18} />}
              required
              error={!passwordsMatch && formData.confirmPassword ? 'Passwords do not match' : ''}
            />

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading || !passwordsMatch || formData.newPassword.length < 8}
            >
              Reset Password
            </Button>
          </form>

          <div className="auth-footer">
            <p>
              <Link to="/forgot-password" className="auth-link">
                Didn't receive a code? Request new code
              </Link>
            </p>
            <p>
              <Link to="/login" className="auth-link">
                <ArrowLeft size={16} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Back to Login
              </Link>
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
