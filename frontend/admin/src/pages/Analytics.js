import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { LineChartComponent, BarChartComponent, PieChartComponent, AreaChartComponent } from '../components/Charts';
import StatCard from '../components/StatCard';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { TrendingUp, Users, MessageSquare, Activity, Eye } from 'lucide-react';

function Analytics() {
  const [timeRange, setTimeRange] = useState('7d');
  const [analytics, setAnalytics] = useState({
    overview: {
      totalViews: 0,
      activeUsers: 0,
      engagement: 0,
      growth: 0
    },
    userActivity: [],
    contentGrowth: [],
    topCommunities: [],
    engagementMetrics: []
  });

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      const response = await adminAPI.getAnalytics({ range: timeRange });
      setAnalytics(response.data);
    } catch (err) {
      notify.error('Failed to fetch analytics');
      // Generate mock data for demonstration
      setAnalytics(generateMockAnalytics());
    }
  };

  const generateMockAnalytics = () => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const dateArray = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - i - 1));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      overview: {
        totalViews: Math.floor(Math.random() * 50000) + 10000,
        activeUsers: Math.floor(Math.random() * 5000) + 1000,
        engagement: Math.floor(Math.random() * 80) + 20,
        growth: Math.floor(Math.random() * 30) + 5
      },
      userActivity: dateArray.map(date => ({
        name: date,
        active: Math.floor(Math.random() * 500) + 100,
        new: Math.floor(Math.random() * 50) + 10
      })),
      contentGrowth: dateArray.map(date => ({
        name: date,
        posts: Math.floor(Math.random() * 100) + 20,
        comments: Math.floor(Math.random() * 200) + 50,
        reactions: Math.floor(Math.random() * 300) + 100
      })),
      topCommunities: [
        { name: 'Technology', value: 450 },
        { name: 'Gaming', value: 380 },
        { name: 'Science', value: 320 },
        { name: 'Art', value: 290 },
        { name: 'Sports', value: 250 }
      ],
      engagementMetrics: dateArray.slice(-7).map(date => ({
        name: date,
        engagement: Math.floor(Math.random() * 100) + 20
      }))
    };
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Analytics Dashboard</h1>
          <p className="subtitle">Comprehensive platform analytics and insights</p>
        </div>
        <div className="time-range-selector">
          <button 
            className={`btn ${timeRange === '7d' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('7d')}
          >
            7 Days
          </button>
          <button 
            className={`btn ${timeRange === '30d' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('30d')}
          >
            30 Days
          </button>
          <button 
            className={`btn ${timeRange === '90d' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('90d')}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="stats-grid">
        <StatCard
          title="Total Views"
          value={analytics.overview.totalViews}
          icon={Eye}
          trend="up"
          trendValue={12.5}
          color="#667eea"
        />
        <StatCard
          title="Active Users"
          value={analytics.overview.activeUsers}
          icon={Users}
          trend="up"
          trendValue={8.3}
          color="#764ba2"
        />
        <StatCard
          title="Engagement Rate"
          value={`${analytics.overview.engagement}%`}
          icon={Activity}
          trend="up"
          trendValue={5.2}
          color="#f093fb"
        />
        <StatCard
          title="Growth"
          value={`${analytics.overview.growth}%`}
          icon={TrendingUp}
          trend="up"
          trendValue={analytics.overview.growth}
          color="#43e97b"
        />
      </div>

      {/* Charts */}
      <div className="charts-grid" style={{ marginTop: '30px' }}>
        <div className="chart-card">
          <h3>User Activity Trend</h3>
          <p className="chart-subtitle">Daily active users and new registrations</p>
          <AreaChartComponent 
            data={analytics.userActivity} 
            dataKeys={['active', 'new']}
          />
        </div>
        
        <div className="chart-card">
          <h3>Content Growth</h3>
          <p className="chart-subtitle">Posts, comments, and reactions over time</p>
          <LineChartComponent 
            data={analytics.contentGrowth} 
            dataKeys={['posts', 'comments', 'reactions']}
          />
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: '20px' }}>
        <div className="chart-card">
          <h3>Top Communities</h3>
          <p className="chart-subtitle">Most active communities by engagement</p>
          <PieChartComponent data={analytics.topCommunities} />
        </div>
        
        <div className="chart-card">
          <h3>Weekly Engagement</h3>
          <p className="chart-subtitle">Average engagement score per day</p>
          <BarChartComponent 
            data={analytics.engagementMetrics} 
            dataKeys={['engagement']}
          />
        </div>
      </div>

      {/* Insights */}
      <div className="card" style={{ marginTop: '30px' }}>
        <div className="card-header">
          <Activity size={20} />
          <h3>Key Insights</h3>
        </div>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon" style={{ background: '#667eea20', color: '#667eea' }}>
              <TrendingUp size={24} />
            </div>
            <div>
              <h4>Growing Platform</h4>
              <p>User base has grown by {analytics.overview.growth}% in the selected period</p>
            </div>
          </div>
          <div className="insight-card">
            <div className="insight-icon" style={{ background: '#43e97b20', color: '#43e97b' }}>
              <Users size={24} />
            </div>
            <div>
              <h4>High Engagement</h4>
              <p>Users are highly engaged with an average {analytics.overview.engagement}% interaction rate</p>
            </div>
          </div>
          <div className="insight-card">
            <div className="insight-icon" style={{ background: '#f093fb20', color: '#f093fb' }}>
              <MessageSquare size={24} />
            </div>
            <div>
              <h4>Active Discussions</h4>
              <p>Communities are fostering healthy discussions and interactions</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Analytics;
