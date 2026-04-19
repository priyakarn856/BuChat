import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MailCheck, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

const VerifyEmail = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  
  // Get email from location state or prompt user if it's missing
  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      toast.warn('Email not found. Please start registration again.');
      navigate('/register');
    }
  }, [email, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!code.trim()) {
      toast.error('Please enter the verification code');
      return;
    }

    if (code.length !== 6) {
      toast.error('Verification code must be 6 characters');
      return;
    }

    setLoading(true);
    try {
      // Normalize email to lowercase before sending
      const normalizedEmail = email.trim().toLowerCase();
      
      const result = await userService.verifyEmail(normalizedEmail, code);
      
      // On success, backend returns user and token
      if (result.user && result.token) {
        const userData = result.user;
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', result.token);
        
        // Update auth context
        setUser(userData);
        
        toast.success('Email verified successfully! Welcome to BuChat!');
        setTimeout(() => navigate('/'), 100);
      } else {
        toast.success('Email verified successfully!');
        navigate('/login');
      }
    } catch (error) {
      const errorMessage = error.message || error.response?.data?.message || 'Invalid verification code';
      
      if (errorMessage.includes('user not found') || errorMessage.includes('404')) {
        toast.error('This email is not registered or the verification has expired. Please register again.');
        setTimeout(() => navigate('/register'), 2000);
      } else if (errorMessage.includes('expired')) {
        toast.error('Verification code has expired. Please request a new one.');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('incorrect')) {
        toast.error('Invalid verification code. Please check and try again.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      // Normalize email to lowercase before sending
      await userService.resendVerification(email.toLowerCase());
      toast.success('A new verification code has been sent!');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to resend code';
      
      if (errorMessage.includes('user not found') || errorMessage.includes('404')) {
        toast.error('This email is not registered. Please register again.');
        setTimeout(() => navigate('/register'), 2000);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <div className="auth-page">
        <Card className="auth-card">
          <div className="auth-header">
            <AlertCircle size={48} className="text-danger" />
            <h1 className="mt-4">Missing Information</h1>
            <p>We can't verify your email without knowing it. Please return to the registration page.</p>
            <Link to="/register">
              <Button>Go to Register</Button>
            </Link>
          </div>
        </Card>
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
              <MailCheck size={32} />
            </div>
            <h1>Verify Your Email</h1>
            <p>We sent a 6-digit code to <strong>{email}</strong>. Please enter it below.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="Verification Code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="Enter 6-digit code"
              maxLength={6}
              required
              className="text-center tracking-widest text-2xl"
            />

            <Button type="submit" fullWidth loading={loading} disabled={loading}>
              Verify & Create Account
            </Button>
          </form>

          <div className="auth-footer">
            <p>Didn't receive the code?</p>
            <Button
              type="button"
              variant="link"
              loading={resending}
              disabled={resending}
              onClick={handleResend}
            >
              Resend Code
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
