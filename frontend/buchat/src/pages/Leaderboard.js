import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Award, TrendingUp, Medal } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import { gamificationService } from '../services/gamificationService';
import './Leaderboard.css';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('all');

  useEffect(() => {
    fetchLeaderboard();
  }, [timeframe]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const data = await gamificationService.getGlobalLeaderboard({ timeframe, limit: 50 });
      setLeaderboard(data.leaderboard || []);
    } catch (error) {
      
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy size={24} className="rank-icon gold" />;
    if (rank === 2) return <Medal size={24} className="rank-icon silver" />;
    if (rank === 3) return <Medal size={24} className="rank-icon bronze" />;
    return <span className="rank-number">#{rank}</span>;
  };

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-container">
        <div className="page-header">
          <div>
            <h1>🏆 Leaderboard</h1>
            <p>Top contributors in the community</p>
          </div>
        </div>

        <Card className="timeframe-selector">
          <button
            className={timeframe === 'all' ? 'active' : ''}
            onClick={() => setTimeframe('all')}
          >
            All Time
          </button>
          <button
            className={timeframe === 'month' ? 'active' : ''}
            onClick={() => setTimeframe('month')}
          >
            This Month
          </button>
          <button
            className={timeframe === 'week' ? 'active' : ''}
            onClick={() => setTimeframe('week')}
          >
            This Week
          </button>
        </Card>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="leaderboard-card">
              <div className="leaderboard-list">
                {leaderboard.map((user, index) => (
                  <motion.div
                    key={user.username}
                    className="leaderboard-item"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="rank">{getRankIcon(index + 1)}</div>
                    <Link to={`/u/${user.username}`} className="user-info">
                      <div className="username">u/{user.username}</div>
                      <div className="user-stats">
                        <span>Level {user.level || 1}</span>
                        <span>•</span>
                        <span>{user.karma || 0} karma</span>
                      </div>
                    </Link>
                    <div className="user-score">
                      <TrendingUp size={16} />
                      <span>{user.score || 0}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
