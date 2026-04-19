import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { userService } from '../services/userService';
import './Auth.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await userService.forgotPassword(email.toLowerCase());
      setEmailSent(true);
      toast.success('Password reset code sent! Please check your email.');
    } catch (error) {
      const errorMessage = error.message || error.response?.data?.message || 'Failed to send reset code';
      
      if (errorMessage.includes('user not found') || errorMessage.includes('404')) {
        toast.error('No account found with this email address.');
      } else if (errorMessage.includes('no email')) {
        toast.error('This account was registered without an email. Please contact support.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
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
                <Mail size={32} />
              </div>
              <h1>Check Your Email</h1>
              <p>
                We've sent a password reset code to <strong>{email}</strong>.
                <br />
                Please check your inbox and follow the instructions.
              </p>
            </div>

            <div className="auth-footer">
              <Button
                fullWidth
                onClick={() => navigate('/reset-password', { state: { email } })}
              >
                Enter Reset Code
              </Button>
              
              <p style={{ marginTop: '1rem' }}>
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
  }

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
              <Mail size={32} />
            </div>
            <h1>Forgot Password?</h1>
            <p>Enter your email address and we'll send you a code to reset your password.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              icon={<Mail size={18} />}
              required
            />

            <Button type="submit" fullWidth loading={loading} disabled={loading}>
              Send Reset Code
            </Button>
          </form>

          <div className="auth-footer">
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

export default ForgotPassword;
