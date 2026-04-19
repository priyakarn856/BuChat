/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, Users, MessageCircle, Bell, Settings,
  User, Search, Compass, Bookmark, Menu,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { groupService } from '../../services/groupService';
import { userService } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = ({ collapsed, onToggleCollapse, onPinChange }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [userGroups, setUserGroups] = useState([]);
  const [isSuggested, setIsSuggested] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const mainItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Users, label: 'Friends', path: '/friends' },
    { icon: Compass, label: 'Groups', path: '/groups' },
    { icon: MessageCircle, label: 'Messages', path: '/messages' },
    { icon: User, label: 'Profile', path: user?.username ? `/profile/${user.username}` : '/login' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  useEffect(() => {
    if (user) {
      fetchUserGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchUserGroups = async () => {
    try {
      const currentUser = user || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null);
      if (!currentUser) return;
      
      const profileResponse = await userService.getUserGroups(currentUser.username);
      const ownedGroups = profileResponse.owned || [];
      const joinedGroups = profileResponse.joined || [];
      
      // Remove duplicates by groupId
      const groupMap = new Map();
      [...ownedGroups, ...joinedGroups].forEach(group => {
        if (!groupMap.has(group.groupId)) {
          groupMap.set(group.groupId, group);
        }
      });
      const allUserGroups = Array.from(groupMap.values());
      
      if (allUserGroups.length === 0) {
        const suggested = await groupService.discoverGROUPS(currentUser.userId);
        setUserGroups((suggested.groups || []).slice(0, 3));
        setIsSuggested(true);
      } else {
        setUserGroups(allUserGroups);
        setIsSuggested(false);
      }
    } catch (error) {
      setUserGroups([]);
      setIsSuggested(false);
    }
  };

  const isActive = (path) => location.pathname === path;

  // Notify parent when pin state changes
  useEffect(() => {
    if (onPinChange) {
      onPinChange(isPinned);
    }
  }, [isPinned, onPinChange]);

  // Prevent scroll propagation to main content
  useEffect(() => {
    const sidebarElement = document.querySelector('.app-left-rail');
    if (!sidebarElement) return;

    const handleWheel = (e) => {
      const scrollContainer = sidebarElement.querySelector('#flex-left-nav-contents');
      if (!scrollContainer) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isAtTop = scrollTop === 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight;

      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        e.preventDefault();
      }
    };

    sidebarElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => sidebarElement.removeEventListener('wheel', handleWheel);
  }, []);

  // Hide sidebar if user is not logged in
  if (!user) {
    return null;
  }

  const shouldExpand = isPinned || isHovered;
  const isCollapsed = !shouldExpand;

  return (
    <aside 
      className="app-left-rail" 
      aria-label="Site navigation"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        id="flex-left-nav-container" 
        className={isCollapsed ? 'collapsed' : 'expanded'}
        data-state={isCollapsed ? 'collapsed' : 'expanded'} 
        aria-expanded={!isCollapsed}
      >
        
        {/* Toggle Button */}
        <div id="flex-nav-buttons">
          <button 
            type="button" 
            className="sidebar-toggle-btn" 
            aria-label={isPinned ? "Unpin sidebar" : "Pin sidebar"}
            onClick={() => setIsPinned(!isPinned)}
            title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
          >
            <Menu size={20} />
          </button>
        </div>

        <div id="flex-left-nav-contents">
          <div className="contents" id="left-nav-persistent-container">
            <nav className="sidebar-nav" aria-label="Primary navigation">
              
              {/* Main Navigation List */}
              <ul className="nav-list nav-list-primary">
                {mainItems.map((item) => {
                  const Icon = item.icon;
                  const isProfileWithoutAuth = item.label === 'Profile' && !user?.username;
                  return (
                    <li key={item.path}>
                      <Link 
                        to={item.path} 
                        className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                        title={isProfileWithoutAuth ? 'Login to view your profile' : item.label}
                      >
                        <span className="nav-icon">
                          <Icon size={20} strokeWidth={isActive(item.path) ? 2.5 : 2} />
                        </span>
                        <span className="nav-label-container">
                          <span className="nav-label">{item.label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <hr className="nav-divider" />

              {/* Groups Section */}
              <section className="nav-section" aria-label="Your Groups">
                <button 
                  type="button" 
                  className="nav-section-header" 
                  aria-expanded={groupsOpen}
                  onClick={() => setGroupsOpen(!groupsOpen)}
                >
                  <span className="section-title">{isSuggested ? 'SUGGESTED GROUPS' : 'YOUR GROUPS'}</span>
                  <span className="section-icon">
                    {groupsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </button>

                {groupsOpen && (
                  <div className="nav-section-content" role="group">
                    <ul className="nav-list">
                      {userGroups.map((group, index) => (
                        <li key={group.groupId || `group-${index}`}>
                          <Link to={`/g/${group.name}`} className={`nav-item ${isActive(`/g/${group.name}`) ? 'active' : ''}`}>
                            <span className="nav-icon group-avatar-icon">
                              {group.icon ? (
                                <img src={group.icon} alt={group.displayName || group.name} />
                              ) : (
                                <span className="group-initial">{(group.displayName || group.name)[0].toUpperCase()}</span>
                              )}
                            </span>
                            <span className="nav-label-container">
                              <span className="nav-label">{group.displayName || group.name}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

            </nav>

            {/* Footer */}
            <div className="sidebar-footer" role="contentinfo">
              <div className="footer-links">
                <Link to="/help" className="footer-link">Help</Link>
                <Link to="/privacy" className="footer-link">Privacy</Link>
                <Link to="/terms" className="footer-link">Terms</Link>
              </div>
              <p className="footer-text">BuChat © 2025</p>
            </div>
            
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;