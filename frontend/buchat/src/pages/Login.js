import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Lock, LogIn } from 'lucide-react';
import { toast } from 'react-toastify';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import ProfileSetupModal from '../components/auth/ProfileSetupModal';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import './Auth.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [tempUser, setTempUser] = useState(null);
  const { login, setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Log In - BuChat';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, []);

  const handleGoogleSignIn = async (response) => {
    setLoading(true);
    try {
      const result = await userService.googleAuth(response.credential);
      
      if (result.needsProfileSetup) {
        // Show profile setup modal
        setTempUser(result.user);
        setShowProfileSetup(true);
      } else {
        // Complete login - save user and token first
        const userData = result.user;
        if (result.token) localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        
        // Initialize encryption after user is saved
        const backupPassword = `${userData.userId}_${userData.email}_e2e_backup_v1`;
        setTimeout(async () => {
          try {
            const messagingService = (await import('../services/messagingService')).default;
            await messagingService.initializeEncryption();
            await messagingService.restoreEncryptionKeys(backupPassword);
            await messagingService.backupEncryptionKeys(backupPassword);
          } catch (err) {
            console.error('Encryption initialization error:', err);
          }
        }, 100);
        
        toast.success('Welcome back!');
        setTimeout(() => navigate('/'), 100);
      }
    } catch (error) {
      toast.error('Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileComplete = (result) => {
    const userData = result.user;
    if (result.token) localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setShowProfileSetup(false);
    
    // Initialize encryption after user is saved
    const backupPassword = `${userData.userId}_${userData.email}_e2e_backup_v1`;
    setTimeout(async () => {
      try {
        const messagingService = (await import('../services/messagingService')).default;
        await messagingService.initializeEncryption();
        await messagingService.restoreEncryptionKeys(backupPassword);
        await messagingService.backupEncryptionKeys(backupPassword);
      } catch (err) {
        console.error('Encryption initialization error:', err);
      }
    }, 100);
    
    toast.success('Welcome to BuChat!');
    setTimeout(() => navigate('/'), 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter your credentials');
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (error) {
      const errorMessage = error.message || 'Login failed';
      
      // Handle rate limiting errors
      if (errorMessage.includes('429') || errorMessage.includes('Too many')) {
        toast.error(errorMessage);
      } else if (errorMessage.includes('Invalid credentials') || errorMessage.includes('incorrect')) {
        toast.error('Invalid username/email or password. Please try again.');
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
              <LogIn size={48} />
            </div>
            <h2>Welcome Back!</h2>
            <p className="tagline">Where conversations spark connections</p>
          </div>
          
          <div className="auth-features">
            <div className="feature-item">
              <div className="feature-icon">💬</div>
              <div>
                <h4>Join the Conversation</h4>
                <p>Connect with millions sharing your interests</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🎯</div>
              <div>
                <h4>Discover Communities</h4>
                <p>Find your tribe in thousands of active communities</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🏆</div>
              <div>
                <h4>Earn Recognition</h4>
                <p>Build your reputation and unlock achievements</p>
              </div>
            </div>
          </div>

          <div className="auth-quote">
            <p>"The best conversations happen when great minds meet."</p>
          </div>
        </motion.div>

        {/* Login Form */}
        <motion.div
          className="auth-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="auth-card">
            <h1 className="auth-card-title">Log In</h1>
            
            <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="Username or Email"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username or email"
              icon={<User size={18} />}
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              icon={<Lock size={18} />}
              required
            />

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading}
            >
              Login
            </Button>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <GoogleSignInButton 
              onSuccess={handleGoogleSignIn}
              onError={(error) => toast.error(error)}
            />
          </form>

          <div className="auth-footer">
            <p>
              <Link to="/forgot-password" className="auth-link">
                Forgot password?
              </Link>
            </p>
            <p>
              Don't have an account?{' '}
              <Link to="/register" className="auth-link">
                Sign up
              </Link>
            </p>
          </div>
        </Card>
        </motion.div>
      </div>
      
      {showProfileSetup && tempUser && (
        <ProfileSetupModal
          tempUser={tempUser}
          onComplete={handleProfileComplete}
        />
      )}
    </div>
  );
};

export default Login;
