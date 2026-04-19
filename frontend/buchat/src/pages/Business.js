import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Business.css';

const Business = () => {
  useEffect(() => {
    document.title = 'BuChat for Business - Grow Your Brand';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = 'Connect with millions of users and grow your brand on BuChat. Reach targeted communities, engage directly, and track analytics.';
  }, []);

  return (
    <div className="business-page">
      <section className="hero-section">
        <h1>BuChat for Business</h1>
        <p>Connect with millions of users and grow your brand on BuChat</p>
        <Link to="/register" className="btn-primary">Get Started</Link>
      </section>

      <section className="features-section">
        <h2>Why Businesses Choose BuChat</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>🎯 Targeted Communities</h3>
            <p>Reach your ideal audience through niche communities and interest groups</p>
          </div>
          <div className="feature-card">
            <h3>💬 Direct Engagement</h3>
            <p>Build relationships with end-to-end encrypted messaging and real-time interactions</p>
          </div>
          <div className="feature-card">
            <h3>📊 Analytics Dashboard</h3>
            <p>Track engagement, reach, and community growth with detailed insights</p>
          </div>
          <div className="feature-card">
            <h3>🔒 Secure Platform</h3>
            <p>Industry-standard encryption ensures your business communications stay private</p>
          </div>
        </div>
      </section>

      <section className="stats-section">
        <h2>Join Thousands of Businesses</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <h3>2M+</h3>
            <p>Active Users</p>
          </div>
          <div className="stat-card">
            <h3>50K+</h3>
            <p>Communities</p>
          </div>
          <div className="stat-card">
            <h3>10M+</h3>
            <p>Daily Interactions</p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Ready to Grow Your Business?</h2>
        <p>Create your business account today and start connecting</p>
        <Link to="/register" className="btn-primary">Create Business Account</Link>
      </section>
    </div>
  );
};

export default Business;
