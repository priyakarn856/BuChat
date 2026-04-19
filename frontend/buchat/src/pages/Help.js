import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Help.css';

const Help = () => {
  useEffect(() => {
    document.title = 'Help Center - BuChat Support & FAQs';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = 'Get help with BuChat. Find answers to common questions about account setup, messaging, communities, privacy, and security features.';
  }, []);

  return (
    <div className="help-page">
      <h1>Help Center</h1>
      
      <section className="help-section">
        <h2>Getting Started</h2>
        <div className="faq-item">
          <h3>How do I create an account?</h3>
          <p>Click "Sign Up" and enter your email, username, and password. You'll receive a verification code via email.</p>
        </div>
        <div className="faq-item">
          <h3>How do I join a community?</h3>
          <p>Search for communities, click on one you like, and press the "Join" button.</p>
        </div>
      </section>

      <section className="help-section">
        <h2>Privacy & Security</h2>
        <div className="faq-item">
          <h3>Are my messages encrypted?</h3>
          <p>Yes! All messages use end-to-end encryption. Only you and the recipient can read them.</p>
        </div>
        <div className="faq-item">
          <h3>How do I report inappropriate content?</h3>
          <p>Click the three dots menu on any post or comment and select "Report".</p>
        </div>
      </section>

      <section className="help-section">
        <h2>Account Management</h2>
        <div className="faq-item">
          <h3>How do I reset my password?</h3>
          <p>Click "Forgot Password" on the login page and follow the email instructions.</p>
        </div>
        <div className="faq-item">
          <h3>How do I delete my account?</h3>
          <p>Go to Settings → Account → Delete Account. This action is permanent.</p>
        </div>
      </section>

      <section className="contact-section">
        <h2>Still Need Help?</h2>
        <p>Contact us at <a href="mailto:support@buchat.com">support@buchat.com</a></p>
        <Link to="/register" className="btn-primary">Get Started</Link>
      </section>
    </div>
  );
};

export default Help;
