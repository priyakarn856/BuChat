import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

function StatCard({ title, value, icon: Icon, trend, trendValue, onClick, color = '#667eea' }) {
  return (
    <div className="stat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="stat-card-header">
        <div className="stat-card-title">{title}</div>
        <div className="stat-card-icon" style={{ background: `${color}20`, color }}>
          {Icon && <Icon size={24} />}
        </div>
      </div>
      <div className="stat-card-value">{value?.toLocaleString() || 0}</div>
      {trend && (
        <div className={`stat-card-trend ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
          {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>{trendValue}% from last month</span>
        </div>
      )}
    </div>
  );
}

export default StatCard;
