import React from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

export function LineChartComponent({ data, dataKeys, xAxisKey = 'name' }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey={xAxisKey} stroke="#666" />
        <YAxis stroke="#666" />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }} />
        <Legend />
        {dataKeys.map((key, idx) => (
          <Line 
            key={key} 
            type="monotone" 
            dataKey={key} 
            stroke={COLORS[idx % COLORS.length]} 
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarChartComponent({ data, dataKeys, xAxisKey = 'name' }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey={xAxisKey} stroke="#666" />
        <YAxis stroke="#666" />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }} />
        <Legend />
        {dataKeys.map((key, idx) => (
          <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} radius={[8, 8, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieChartComponent({ data, dataKey = 'value', nameKey = 'name' }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={100}
          fill="#8884d8"
          dataKey={dataKey}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function AreaChartComponent({ data, dataKeys, xAxisKey = 'name' }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          {dataKeys.map((key, idx) => (
            <linearGradient key={key} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0}/>
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis dataKey={xAxisKey} stroke="#666" />
        <YAxis stroke="#666" />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }} />
        <Legend />
        {dataKeys.map((key, idx) => (
          <Area 
            key={key}
            type="monotone" 
            dataKey={key} 
            stroke={COLORS[idx % COLORS.length]} 
            fillOpacity={1} 
            fill={`url(#color${key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
