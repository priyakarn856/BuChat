import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, UserPlus, FileText, Lock } from 'lucide-react';
import { toast } from 'react-toastify';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import useDebounce from '../hooks/useDebounce';
import './Auth.css';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    bio: '',
  });
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle, checking, available, taken
  const [emailStatus, setEmailStatus] = useState('idle'); // idle, checking, available, taken
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const debouncedUsername = useDebounce(formData.username, 500);
  const debouncedEmail = useDebounce(formData.email, 500);

  useEffect(() => {
    document.title = 'Sign Up - BuChat';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, []);

  useEffect(() => {
    const checkUsername = async () => {
      if (debouncedUsername.length < 3) {
        setUsernameStatus('idle');
        return;
      }
      setUsernameStatus('checking');
      try {
        const { available } = await userService.checkUsername(debouncedUsername);
        setUsernameStatus(available ? 'available' : 'taken');
      } catch (error) {
        setUsernameStatus('idle'); // Or handle error state
      }
    };

    if (debouncedUsername) {
      checkUsername();
    } else {
      setUsernameStatus('idle');
    }
  }, [debouncedUsername]);

  useEffect(() => {
    const checkEmail = async () => {
      // If email is empty, it's optional - set as available
      if (!debouncedEmail || debouncedEmail.trim() === '') {
        setEmailStatus('available'); // Empty email is valid (optional)
        return;
      }
      
      // If email is provided but invalid format
      if (!/^\S+@\S+\.\S+$/.test(debouncedEmail)) {
        setEmailStatus('idle');
        return;
      }
      
      setEmailStatus('checking');
      try {
        const { available } = await userService.checkEmail(debouncedEmail);
        setEmailStatus(available ? 'available' : 'taken');
      } catch (error) {
        setEmailStatus('idle');
      }
    };

    checkEmail();
  }, [debouncedEmail]);

  useEffect(() => {
    if (formData.confirmPassword) {
      setPasswordsMatch(formData.password === formData.confirmPassword);
    } else {
      setPasswordsMatch(true);
    }
  }, [formData.password, formData.confirmPassword]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (e.target.name === 'username') {
      setUsernameStatus('checking');
    }
    if (e.target.name === 'email') {
      setEmailStatus('checking');
    }
  };

  const handleGoogleSignIn = async (response) => {
    setLoading(true);
    try {
      const result = await userService.googleAuth(response.credential);
      const userData = result.user;
      
      // Save to localStorage immediately
      localStorage.setItem('user', JSON.stringify(userData));
      if (result.token) localStorage.setItem('token', result.token);
      
      // Update context
      setUser(userData);
      
      toast.success('Account created successfully!');
      setTimeout(() => navigate('/'), 100);
    } catch (error) {
      toast.error('Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if all required fields are filled (email is now optional)
    if (!formData.username.trim() || !formData.password.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Check username length
    if (formData.username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    // Check username availability
    if (usernameStatus !== 'available') {
      toast.error('Please choose an available username');
      return;
    }

    // Only validate email if it's provided
    if (formData.email && formData.email.trim()) {
      // Check email format
      if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
        toast.error('Please enter a valid email address');
        return;
      }

      // Check email availability
      if (emailStatus !== 'available') {
        if (emailStatus === 'taken') {
          toast.error('This email is already registered. Please use a different email or login.');
        } else {
          toast.error('Please wait for email validation');
        }
        return;
      }
    }

    // Check password length
    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    // Check passwords match
    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const hasEmail = formData.email && formData.email.trim();
      const normalizedEmail = hasEmail ? formData.email.trim().toLowerCase() : null;
      
      await userService.register(formData);
      
      if (hasEmail) {
        toast.success('Verification email sent! Please check your inbox.');
        
        navigate('/verify-email', { state: { email: normalizedEmail } });
      } else {
        toast.success('Account created successfully! Please login.');
        navigate('/login');
      }
    } catch (error) {
      // Handle specific error messages
      const errorMessage = error.message || 'Registration failed';
      if (errorMessage.includes('email already exists')) {
        toast.error('This email is already registered. Please login instead.');
        setEmailStatus('taken');
      } else if (errorMessage.includes('username already exists')) {
        toast.error('This username is taken. Please choose another one.');
        setUsernameStatus('taken');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-wrapper">
        {/* Inspiring Side Content */}
        <motion.div
          className="auth-side-content"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="auth-brand">
            <div className="brand-logo-large">
              <UserPlus size={48} />
            </div>
            <h2>Start Your Journey</h2>
            <p className="tagline">Your voice matters. Make it heard.</p>
          </div>
          
          <div className="auth-features">
            <div className="feature-item">
              <div className="feature-icon">✨</div>
              <div>
                <h4>Express Yourself</h4>
                <p>Share ideas, stories, and perspectives freely</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🌍</div>
              <div>
                <h4>Global Community</h4>
                <p>Connect with people from around the world</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🚀</div>
              <div>
                <h4>Level Up</h4>
                <p>Gamified experience with badges and achievements</p>
              </div>
            </div>
          </div>

          <div className="auth-quote">
            <p>"Every expert was once a beginner. Start your story today."</p>
          </div>
        </motion.div>

        {/* Register Form */}
        <motion.div
          className="auth-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="auth-card">
            <h1 className="auth-card-title">Create Account</h1>
            
            <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-row">
            <Input
              label="Username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              placeholder="Unique username"
              icon={<User size={18} />}
              required
              validationStatus={usernameStatus}
              error={formData.username && formData.username.length > 0 && formData.username.length < 3 ? 'Min 3 chars' : ''}
            />

            <Input
              label="Email (Optional)"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="email@xyz.com"
              icon={<Mail size={18} />}
              validationStatus={emailStatus}
              error={formData.email && formData.email.length > 0 && !/^\S+@\S+\.\S+$/.test(formData.email) ? 'Invalid email' : ''}
            />

              <Input
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 8 chars"
                icon={<Lock size={18} />}
                required
                error={formData.password && formData.password.length > 0 && formData.password.length < 8 ? 'Min 8 chars' : ''}
              />

              <Input
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter password"
                icon={<Lock size={18} />}
                required
                error={!passwordsMatch && formData.confirmPassword ? 'No match' : ''}
              />
            </div>

            <div className="form-row">

              <Input
                label="Display Name"
                name="displayName"
                type="text"
                value={formData.displayName}
                onChange={handleChange}
                placeholder="Your display name"
                icon={<User size={18} />}
              />

              <Input
                label="Bio"
                name="bio"
                type="text"
                value={formData.bio}
                onChange={handleChange}
                placeholder="About yourself"
                icon={<FileText size={18} />}
              />
            </div>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={
                loading || 
                usernameStatus === 'checking' || 
                usernameStatus === 'taken' || 
                usernameStatus === 'idle' ||
                (formData.email.trim() && (emailStatus === 'checking' || emailStatus === 'taken' || emailStatus === 'idle')) ||
                !passwordsMatch ||
                formData.username.length < 3
              }
            >
              Create Account
            </Button>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <GoogleSignInButton 
              onSuccess={handleGoogleSignIn}
              onError={(error) => {}}
            />
          </form>

          <div className="auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="auth-link">
                Login
              </Link>
            </p>
          </div>
        </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;
