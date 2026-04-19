import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { Activity, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getLogs();
      setLogs(response.data);
    } catch (err) {
      notify.error('Failed to fetch logs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeVariant = (type) => {
    const typeMap = {
      'ban': 'danger',
      'suspend': 'warning',
      'delete': 'danger',
      'unban': 'success',
      'create': 'success',
      'update': 'info',
      'login': 'primary'
    };
    return typeMap[type?.toLowerCase()] || 'default';
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.type?.toLowerCase() === filter.toLowerCase());

  const columns = [
    {
      header: 'Type',
      accessor: 'type',
      render: (log) => (
        <Badge variant={getActionBadgeVariant(log.type)}>
          {log.type || 'Unknown'}
        </Badge>
      )
    },
    {
      header: 'Action',
      accessor: 'action',
      render: (log) => log.action || 'N/A'
    },
    {
      header: 'Admin',
      accessor: 'admin',
      render: (log) => log.deletedBy || log.admin || 'System'
    },
    {
      header: 'Target',
      accessor: 'targetId',
      render: (log) => (
        <span style={{ fontSize: '12px', color: '#666' }}>
          {log.targetId?.substring(0, 8) || '-'}
        </span>
      )
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      render: (log) => {
        const date = log.deletedAt || log.timestamp || log.createdAt;
        return date ? format(new Date(date), 'MMM dd, yyyy HH:mm:ss') : 'N/A';
      }
    },
    {
      header: 'Details',
      accessor: 'reason',
      render: (log) => (
        <div style={{ maxWidth: '300px' }}>
          {log.reason || log.notes || '-'}
        </div>
      )
    }
  ];

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Admin Activity Logs</h1>
          <p className="subtitle">Track all administrative actions and changes</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '2px solid white',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Types</option>
            <option value="ban">Ban</option>
            <option value="suspend">Suspend</option>
            <option value="delete">Delete</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
          </select>
          <button className="btn btn-primary" onClick={fetchLogs}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <DataTable
          data={filteredLogs}
          columns={columns}
          searchPlaceholder="Search logs by action, admin, or details..."
          itemsPerPage={25}
        />
      </div>
    </Layout>
  );
}

export default Logs;
