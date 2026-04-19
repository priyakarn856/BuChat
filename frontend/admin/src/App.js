import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Posts from './pages/Posts';
import Communities from './pages/Communities';
import Reports from './pages/Reports';
import Comments from './pages/Comments';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    setIsAuthenticated(!!token);
  }, []);

  return (
    <>
      <Toaster position="top-right" />
      <Router>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <Login setAuth={setIsAuthenticated} /> : <Navigate to="/" />} />
          <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/users" element={isAuthenticated ? <Users /> : <Navigate to="/login" />} />
          <Route path="/posts" element={isAuthenticated ? <Posts /> : <Navigate to="/login" />} />
          <Route path="/communities" element={isAuthenticated ? <Communities /> : <Navigate to="/login" />} />
          <Route path="/reports" element={isAuthenticated ? <Reports /> : <Navigate to="/login" />} />
          <Route path="/comments" element={isAuthenticated ? <Comments /> : <Navigate to="/login" />} />
          <Route path="/logs" element={isAuthenticated ? <Logs /> : <Navigate to="/login" />} />
          <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" />} />
          <Route path="/analytics" element={isAuthenticated ? <Analytics /> : <Navigate to="/login" />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;
