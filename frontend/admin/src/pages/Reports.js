import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [resolveAction, setResolveAction] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getReports();
      setReports(response.data);
    } catch (err) {
      notify.error('Failed to fetch reports');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openResolveModal = (report, action) => {
    setSelectedReport(report);
    setResolveAction(action);
    setShowResolveModal(true);
    setAdminNotes('');
  };

  const handleResolve = async () => {
    if (!adminNotes.trim()) {
      notify.error('Please provide admin notes');
      return;
    }
    
    try {
      await notify.promise(
        adminAPI.resolveReport(selectedReport.reportId, resolveAction, { notes: adminNotes }),
        {
          loading: 'Resolving report...',
          success: `Report ${resolveAction === 'delete' ? 'deleted' : 'dismissed'} successfully`,
          error: 'Failed to resolve report'
        }
      );
      setShowResolveModal(false);
      setAdminNotes('');
      fetchReports();
    } catch (err) {
      console.error(err);
    }
  };

  const getSeverityColor = (type) => {
    const severityMap = {
      'spam': 'warning',
      'harassment': 'danger',
      'inappropriate': 'danger',
      'violence': 'danger',
      'hate_speech': 'danger',
      'other': 'info'
    };
    return severityMap[type?.toLowerCase()] || 'info';
  };

  const columns = [
    {
      header: 'Type',
      accessor: 'reportType',
      render: (report) => (
        <Badge variant={getSeverityColor(report.reportType)}>
          {report.reportType || 'Unknown'}
        </Badge>
      )
    },
    {
      header: 'Reason',
      accessor: 'reason',
      render: (report) => (
        <div style={{ maxWidth: '250px' }}>
          {report.reason || 'No reason provided'}
        </div>
      )
    },
    {
      header: 'Reporter',
      accessor: 'reporterUsername',
      render: (report) => report.reporterUsername || 'Anonymous'
    },
    {
      header: 'Target',
      render: (report) => (
        <div>
          <small style={{ color: '#666' }}>
            {report.contentType || 'Unknown'}
          </small>
        </div>
      )
    },
    {
      header: 'Reported',
      accessor: 'createdAt',
      render: (report) => report.createdAt 
        ? format(new Date(report.createdAt), 'MMM dd, HH:mm')
        : 'N/A'
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (report) => (
        <Badge variant={
          report.status === 'pending' ? 'warning' : 
          report.status === 'resolved' ? 'success' : 'info'
        }>
          {report.status || 'Pending'}
        </Badge>
      )
    },
    {
      header: 'Actions',
      render: (report) => (
        <div className="action-buttons">
          {report.status === 'pending' && (
            <>
              <button 
                className="btn-icon btn-danger"
                onClick={() => openResolveModal(report, 'delete')}
                title="Delete Content"
              >
                <XCircle size={16} />
              </button>
              <button 
                className="btn-icon btn-success"
                onClick={() => openResolveModal(report, 'dismiss')}
                title="Dismiss Report"
              >
                <CheckCircle size={16} />
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Reports Management</h1>
          <p className="subtitle">Review and manage user reports</p>
        </div>
        <Badge variant="warning" size="lg">
          <AlertTriangle size={16} style={{ marginRight: '5px' }} />
          {reports.filter(r => r.status === 'pending').length} Pending
        </Badge>
      </div>

      <div className="card">
        <DataTable
          data={reports}
          columns={columns}
          searchPlaceholder="Search reports by type, reason, or reporter..."
          itemsPerPage={15}
        />
      </div>

      {/* Resolve Modal */}
      <Modal
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        title={`${resolveAction === 'delete' ? 'Delete Content' : 'Dismiss Report'}`}
        footer={
          <>
            <button className="btn" onClick={() => setShowResolveModal(false)}>
              Cancel
            </button>
            <button 
              className={`btn ${resolveAction === 'delete' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleResolve}
            >
              {resolveAction === 'delete' ? 'Delete Content' : 'Dismiss Report'}
            </button>
          </>
        }
      >
        {selectedReport && (
          <div>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <strong>Report Details:</strong>
              <div style={{ marginTop: '10px' }}>
                <p><strong>Type:</strong> {selectedReport.reportType}</p>
                <p><strong>Reason:</strong> {selectedReport.reason}</p>
                <p><strong>Reporter:</strong> {selectedReport.reporterUsername}</p>
              </div>
            </div>
            
            <div className="form-group">
              <label>Admin Notes *</label>
              <textarea
                placeholder="Provide details about your decision..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows="4"
              />
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

export default Reports;
