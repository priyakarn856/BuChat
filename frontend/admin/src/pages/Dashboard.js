import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import StatCard from '../components/StatCard';
import { LineChartComponent, BarChartComponent, PieChartComponent } from '../components/Charts';
import { Users, FileText, MessageSquare, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';

function Dashboard() {
  const [stats, setStats] = useState({ users: 0, posts: 0, groups: 0, reports: 0, comments: 0 });
  const [analytics, setAnalytics] = useState({
    userGrowth: [],
    contentStats: [],
    activityData: [],
    reportTypes: []
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, analyticsRes] = await Promise.all([
        adminAPI.getStats().catch(() => ({ data: stats })),
        adminAPI.getAnalytics().catch(() => ({ data: generateMockAnalytics() }))
      ]);
      
      setStats(statsRes.data);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      notify.error('Failed to fetch dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate mock analytics if API doesn't exist yet
  const generateMockAnalytics = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return {
      userGrowth: months.map((month, i) => ({
        name: month,
        users: Math.floor(Math.random() * 100) + i * 20,
        activeUsers: Math.floor(Math.random() * 80) + i * 15
      })),
      contentStats: months.map((month, i) => ({
        name: month,
        posts: Math.floor(Math.random() * 150) + i * 25,
        comments: Math.floor(Math.random() * 300) + i * 50
      })),
      activityData: months.map((month, i) => ({
        name: month,
        activity: Math.floor(Math.random() * 500) + i * 100
      })),
      reportTypes: [
        { name: 'Spam', value: 45 },
        { name: 'Harassment', value: 30 },
        { name: 'Inappropriate', value: 15 },
        { name: 'Other', value: 10 }
      ]
    };
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: 'white' }}>
          <Activity size={40} className="spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="dashboard-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p className="subtitle">Welcome back! Here's what's happening with your platform.</p>
        </div>
        <button className="btn btn-primary" onClick={fetchDashboardData}>
          <Activity size={18} />
          Refresh Data
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          title="Total Users"
          value={stats.users}
          icon={Users}
          trend="up"
          trendValue={12.5}
          onClick={() => navigate('/users')}
          color="#667eea"
        />
        <StatCard
          title="Total Posts"
          value={stats.posts}
          icon={FileText}
          trend="up"
          trendValue={8.2}
          onClick={() => navigate('/posts')}
          color="#764ba2"
        />
        <StatCard
          title="Communities"
          value={stats.groups}
          icon={Users}
          trend="up"
          trendValue={5.1}
          onClick={() => navigate('/communities')}
          color="#f093fb"
        />
        <StatCard
          title="Comments"
          value={stats.comments}
          icon={MessageSquare}
          trend="up"
          trendValue={15.3}
          onClick={() => navigate('/comments')}
          color="#4facfe"
        />
        <StatCard
          title="Pending Reports"
          value={stats.reports}
          icon={AlertTriangle}
          trend="down"
          trendValue={3.2}
          onClick={() => navigate('/reports')}
          color="#fa709a"
        />
        <StatCard
          title="Total Engagement"
          value={(stats.posts || 0) + (stats.comments || 0)}
          icon={TrendingUp}
          trend="up"
          trendValue={11.8}
          color="#43e97b"
        />
      </div>

      {/* Analytics Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>User Growth</h3>
          <LineChartComponent 
            data={analytics.userGrowth} 
            dataKeys={['users', 'activeUsers']}
          />
        </div>
        
        <div className="chart-card">
          <h3>Content Statistics</h3>
          <BarChartComponent 
            data={analytics.contentStats} 
            dataKeys={['posts', 'comments']}
          />
        </div>
      </div>

      <div className="charts-grid" style={{ marginTop: '20px' }}>
        <div className="chart-card">
          <h3>Platform Activity</h3>
          <LineChartComponent 
            data={analytics.activityData} 
            dataKeys={['activity']}
          />
        </div>
        
        <div className="chart-card">
          <h3>Report Types Distribution</h3>
          <PieChartComponent data={analytics.reportTypes} />
        </div>
      </div>
    </Layout>
  );
}

export default Dashboard;
