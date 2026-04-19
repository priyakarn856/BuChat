import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CallProvider, useCall } from './contexts/CallContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { SignalProvider } from './contexts/SignalContext';
import CallInterface from './components/calls/CallInterface';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import MobileBottomNav from './components/layout/MobileBottomNav';
import FloatingChat from './components/chat/FloatingChat';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Groups from './pages/Groups';
import CreateGroup from './pages/CreateGroup';
import CreatePost from './pages/CreatePost';
import PostDetail from './pages/PostDetail';
import UserProfile from './pages/UserProfile';
import Friends from './pages/Friends';
import Search from './pages/Search';
import GroupDetail from './pages/GroupDetail';
import GroupSettings from './pages/GroupSettings';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import About from './pages/About';
import ComingSoon from './pages/ComingSoon';
import Help from './pages/Help';
import Explore from './pages/Explore';
import Business from './pages/Business';
import Reels from './pages/Reels';
import './App.css';

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [floatingChatConversation, setFloatingChatConversation] = useState(null);
  const location = useLocation();
  const { activeCall, endCall } = useCall();
  const { user } = useAuth();

  // Hide sidebars on auth pages
  const authPages = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];
  const isAuthPage = authPages.includes(location.pathname);
  const isMessagesPage = location.pathname === '/messages';

  // Handle opening floating chat from notifications or message clicks
  // eslint-disable-next-line no-unused-vars
  const handleOpenFloatingChat = (conversation) => {
    setFloatingChatConversation(conversation);
    setFloatingChatOpen(true);
  };

  return (
    <div className="App">
      {/* Fixed Header */}
      <Navbar />
      
      {/* Grid shell layout */}
      <div
        className={`app-grid-container ${isAuthPage ? 'auth-layout' : ''} ${sidebarPinned ? 'sidebar-expanded' : 'sidebar-collapsed'}`}
      >
        {/* Left rail keeps nav fixed while reserving grid space */}
        {!isAuthPage && (
          <aside className="app-left-rail" aria-label="Site navigation">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              onPinChange={setSidebarPinned}
            />
          </aside>
        )}

        {/* Subgrid centers main feed and right rail */}
        <div className="app-subgrid">
          <div className="app-content">
            <main className="app-main" id="main-content" role="main">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/groups" element={<Groups />} />
                <Route path="/create-group" element={<CreateGroup />} />
                <Route path="/trending" element={<Home />} />
                <Route path="/create-post" element={<CreatePost />} />
                <Route path="/post/:postId" element={<PostDetail />} />
                <Route path="/profile/:username" element={<UserProfile />} />
                <Route path="/u/:username" element={<UserProfile />} />
                <Route path="/friends" element={<Friends />} />
                <Route path="/search" element={<Search />} />
                <Route path="/g/:groupName" element={<GroupDetail />} />
                <Route path="/c/:groupName" element={<GroupDetail />} />
                <Route path="/g/:groupName/settings" element={<GroupSettings />} />
                <Route path="/c/:groupName/settings" element={<GroupSettings />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/about" element={<About />} />
                <Route path="/help" element={<Help />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/business" element={<Business />} />
                <Route path="/reels" element={<Reels />} />
                <Route path="/discover" element={<ComingSoon feature="Discover" />} />
                <Route path="/polls" element={<ComingSoon feature="Polls" />} />
                <Route path="/capsules" element={<ComingSoon feature="Time Capsules" />} />
                <Route path="/events" element={<ComingSoon feature="Events" />} />
                <Route path="/settings" element={<ComingSoon feature="Settings" />} />
              </Routes>
            </main>
          </div>
        </div>
      </div>

      {/* Global Call Interface */}
      {activeCall && (
        <CallInterface
          callId={activeCall.callId}
          recipientId={activeCall.recipientId}
          recipientName={activeCall.recipientName}
          callType={activeCall.callType}
          isIncoming={activeCall.isIncoming}
          offer={activeCall.offer}
          onEnd={endCall}
        />
      )}

      {/* Floating Chat - Available on all pages except Messages */}
      {user && !isMessagesPage && !isAuthPage && (
        <FloatingChat
          isOpen={floatingChatOpen}
          onClose={() => setFloatingChatOpen(false)}
          onOpen={() => setFloatingChatOpen(true)}
          conversation={floatingChatConversation}
          onConversationChange={setFloatingChatConversation}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Toast Notifications */}
      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <AuthProvider>
          <SignalProvider>
            <WebSocketProvider>
              <CallProvider>
                <Router>
                  <AppContent />
                </Router>
              </CallProvider>
            </WebSocketProvider>
          </SignalProvider>
        </AuthProvider>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
