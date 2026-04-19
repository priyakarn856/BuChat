import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  UsersRound, 
  MessageSquare, 
  AlertTriangle, 
  Activity, 
  Settings, 
  BarChart3,
  LogOut 
} from 'lucide-react';

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/login');
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/users', icon: Users, label: 'Users' },
    { path: '/posts', icon: FileText, label: 'Posts' },
    { path: '/communities', icon: UsersRound, label: 'Communities' },
    { path: '/comments', icon: MessageSquare, label: 'Comments' },
    { path: '/reports', icon: AlertTriangle, label: 'Reports' },
    { path: '/logs', icon: Activity, label: 'Activity Logs' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="admin-layout">
      <div className="sidebar">
        <h2>BuChat Admin</h2>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link 
                key={item.path}
                to={item.path} 
                className={location.pathname === item.path ? 'active' : ''}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
          <a 
            href="#" 
            onClick={handleLogout} 
            style={{ marginTop: '24px', color: '#dc3545' }}
          >
            <LogOut size={20} />
            Logout
          </a>
        </nav>
      </div>
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}

export default Layout;
