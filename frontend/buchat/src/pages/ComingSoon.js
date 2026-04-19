import React from 'react';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import './ComingSoon.css';

const ComingSoon = ({ feature = 'This feature' }) => {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-container">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="coming-soon-card">
            <div className="coming-soon-content">
              <div className="coming-soon-icon">
                <Construction size={64} />
              </div>
              <h1 className="text-gradient">Coming Soon</h1>
              <p>{feature} is under construction and will be available soon!</p>
              <div className="feature-list">
                <div className="feature-badge">🚀 In Development</div>
                <div className="feature-badge">✨ Exciting Updates</div>
                <div className="feature-badge">🎯 Stay Tuned</div>
              </div>
              <Button onClick={() => window.history.back()}>
                Go Back
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default ComingSoon;
