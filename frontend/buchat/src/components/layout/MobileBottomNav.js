import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, PlusCircle, Bell, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import './MobileBottomNav.css';

const MobileBottomNav = () => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Hide on auth pages and messages page (has its own nav)
  const hiddenPages = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/messages'];
  if (hiddenPages.some(page => location.pathname.startsWith(page))) {
    return null;
  }

  if (!isAuthenticated) return null;

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/explore', icon: Search, label: 'Explore' },
    { path: '/create-post', icon: PlusCircle, label: 'Create', isCreate: true },
    { path: '/notifications', icon: Bell, label: 'Alerts', badge: 2 },
    { path: `/profile/${user?.username}`, icon: User, label: 'Profile' },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => 
            `mobile-nav-item ${isActive ? 'active' : ''} ${item.isCreate ? 'create-btn' : ''}`
          }
        >
          {({ isActive }) => (
            <motion.div
              className="nav-item-content"
              whileTap={{ scale: 0.9 }}
            >
              {item.isCreate ? (
                <div className="create-button-wrapper">
                  <item.icon size={28} strokeWidth={2} />
                </div>
              ) : (
                <>
                  <div className="icon-wrapper">
                    <item.icon 
                      size={24} 
                      strokeWidth={isActive ? 2.5 : 1.8}
                    />
                    {item.badge && item.badge > 0 && (
                      <span className="nav-badge">{item.badge}</span>
                    )}
                  </div>
                  <span className="nav-label">{item.label}</span>
                  {isActive && (
                    <motion.div 
                      className="active-indicator"
                      layoutId="activeTab"
                      transition={{ type: "spring", duration: 0.5 }}
                    />
                  )}
                </>
              )}
            </motion.div>
          )}
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileBottomNav;
