import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Shield, Zap, MessageCircle, Award, TrendingUp } from 'lucide-react';
import './About.css';

const About = () => {
  useEffect(() => {
    document.title = 'About BuChat - Modern Social Platform';
    
    const schema = {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "mainEntity": {
        "@type": "Organization",
        "name": "BuChat",
        "url": "https://buchat.me",
        "logo": "https://buchat.me/logo192.png",
        "foundingDate": "2024",
        "description": "BuChat is a modern social platform where users create and share content within communities, engage through upvotes and nested comments, earn karma points, follow other users, and communicate via encrypted direct messaging.",
        "slogan": "Connect, Share, Engage Securely",
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "Customer Support",
          "email": "support@buchat.me"
        }
      }
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    script.id = 'about-schema';
    document.head.appendChild(script);

    return () => {
      const existing = document.getElementById('about-schema');
      if (existing) document.head.removeChild(existing);
    };
  }, []);

  return (
    <div className="about-page">
      <div className="about-container">
        <header className="about-header">
          <h1>About BuChat</h1>
          <p className="about-tagline">Connect, Share, Engage Securely</p>
        </header>

        <section className="about-section">
          <h2>What is BuChat?</h2>
          <p>
            BuChat is a modern social platform where users create and share content within communities, 
            engage through upvotes and nested comments, earn karma points, follow other users, and 
            communicate via encrypted direct messaging. Built on AWS serverless architecture with React, 
            BuChat combines the best of social networking with cutting-edge security features.
          </p>
        </section>

        <section className="about-section features-grid">
          <h2>Key Features</h2>
          <div className="feature-cards">
            <div className="feature-card">
              <div className="feature-icon">
                <Shield size={32} />
              </div>
              <h3>End-to-End Encryption</h3>
              <p>Industry-standard encryption for all messages and media, ensuring your privacy.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Users size={32} />
              </div>
              <h3>Community-Driven</h3>
              <p>Create and join communities around topics you care about.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Award size={32} />
              </div>
              <h3>Karma System</h3>
              <p>Earn karma points and level up through quality contributions.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <MessageCircle size={32} />
              </div>
              <h3>Nested Comments</h3>
              <p>Engage in threaded discussions with unlimited depth.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <TrendingUp size={32} />
              </div>
              <h3>Leaderboards</h3>
              <p>Compete with top users and track your ranking.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Zap size={32} />
              </div>
              <h3>Real-Time Updates</h3>
              <p>Get instant notifications and live message updates.</p>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h2>Our Mission</h2>
          <p>
            To create a safe, engaging, and modern platform where people can connect over shared 
            interests, express themselves freely, and build meaningful relationships—all while 
            maintaining the highest standards of privacy and security.
          </p>
        </section>

        <section className="about-section">
          <h2>Technology</h2>
          <p>
            BuChat is built with modern web technologies including React for the frontend and 
            AWS serverless architecture (Lambda, DynamoDB, API Gateway) for the backend. We use 
            industry-standard encryption protocols to ensure your data remains private and secure.
          </p>
        </section>

        <section className="about-section">
          <h2>Founded</h2>
          <p>2025</p>
        </section>

        <section className="about-section">
          <h2>Contact</h2>
          <p>
            For support or inquiries, reach us at{' '}
            <a href="mailto:support@buchat.me">support@buchat.me</a>
          </p>
        </section>

        <section className="about-cta">
          <h2>Join BuChat Today</h2>
          <p>Be part of a growing community of engaged users</p>
          <div className="cta-buttons">
            <Link to="/register" className="cta-button primary">Sign Up</Link>
            <Link to="/login" className="cta-button secondary">Log In</Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default About;
