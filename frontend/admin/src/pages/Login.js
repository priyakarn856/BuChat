import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function Login({ setAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/admin/login`, { email, password });
      localStorage.setItem('adminToken', response.data.token);
      setAuth(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: '400px' }}>
        <h2 style={{ marginBottom: '20px', color: '#667eea' }}>BuChat Admin</h2>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '2px solid #e9ecef', borderRadius: '8px' }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '2px solid #e9ecef', borderRadius: '8px' }}
            required
          />
          {error && <p style={{ color: '#dc3545', marginBottom: '15px' }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Login</button>
        </form>
      </div>
    </div>
  );
}

export default Login;
