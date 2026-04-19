import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { adminAPI } from '../services/api';
import { notify } from '../services/notifications';
import { Save, Settings as SettingsIcon, Shield, Bell, Database } from 'lucide-react';

function Settings() {
  const [settings, setSettings] = useState({
    siteName: 'BuChat',
    maxUploadSize: 10,
    allowRegistration: true,
    requireEmailVerification: false,
    maintenanceMode: false,
    autoModeration: true,
    profanityFilter: true,
    minKarmaToPost: 0,
    maxPostLength: 5000,
    sessionTimeout: 24,
    enableNotifications: true,
    enableAnalytics: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getSettings();
      setSettings({ ...settings, ...response.data });
    } catch (err) {
      notify.error('Failed to fetch settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await notify.promise(
        adminAPI.updateSettings(settings),
        {
          loading: 'Saving settings...',
          success: 'Settings saved successfully',
          error: 'Failed to save settings'
        }
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>System Settings</h1>
          <p className="subtitle">Configure your platform settings</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="settings-grid">
        {/* General Settings */}
        <div className="card">
          <div className="card-header">
            <SettingsIcon size={20} />
            <h3>General Settings</h3>
          </div>
          <div className="settings-section">
            <div className="form-group">
              <label>Site Name</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => handleChange('siteName', e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label>Max Upload Size (MB)</label>
              <input
                type="number"
                value={settings.maxUploadSize}
                onChange={(e) => handleChange('maxUploadSize', parseInt(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label>Session Timeout (hours)</label>
              <input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => handleChange('sessionTimeout', parseInt(e.target.value))}
              />
            </div>

            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.allowRegistration}
                  onChange={(e) => handleChange('allowRegistration', e.target.checked)}
                />
                <span>Allow New Registrations</span>
              </label>
            </div>

            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.requireEmailVerification}
                  onChange={(e) => handleChange('requireEmailVerification', e.target.checked)}
                />
                <span>Require Email Verification</span>
              </label>
            </div>

            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
                />
                <span>Maintenance Mode</span>
              </label>
              {settings.maintenanceMode && (
                <small style={{ color: '#dc3545', marginTop: '5px', display: 'block' }}>
                  ⚠️ Users will not be able to access the platform
                </small>
              )}
            </div>
          </div>
        </div>

        {/* Security & Moderation */}
        <div className="card">
          <div className="card-header">
            <Shield size={20} />
            <h3>Security & Moderation</h3>
          </div>
          <div className="settings-section">
            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.autoModeration}
                  onChange={(e) => handleChange('autoModeration', e.target.checked)}
                />
                <span>Auto Moderation</span>
              </label>
              <small style={{ color: '#666' }}>Automatically flag suspicious content</small>
            </div>

            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.profanityFilter}
                  onChange={(e) => handleChange('profanityFilter', e.target.checked)}
                />
                <span>Profanity Filter</span>
              </label>
            </div>

            <div className="form-group">
              <label>Minimum Karma to Post</label>
              <input
                type="number"
                value={settings.minKarmaToPost}
                onChange={(e) => handleChange('minKarmaToPost', parseInt(e.target.value))}
              />
              <small style={{ color: '#666' }}>Users need this much karma to create posts</small>
            </div>

            <div className="form-group">
              <label>Maximum Post Length (characters)</label>
              <input
                type="number"
                value={settings.maxPostLength}
                onChange={(e) => handleChange('maxPostLength', parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="card">
          <div className="card-header">
            <Bell size={20} />
            <h3>Features</h3>
          </div>
          <div className="settings-section">
            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.enableNotifications}
                  onChange={(e) => handleChange('enableNotifications', e.target.checked)}
                />
                <span>Enable Notifications</span>
              </label>
            </div>

            <div className="toggle-group">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={settings.enableAnalytics}
                  onChange={(e) => handleChange('enableAnalytics', e.target.checked)}
                />
                <span>Enable Analytics</span>
              </label>
            </div>
          </div>
        </div>

        {/* Database Info */}
        <div className="card">
          <div className="card-header">
            <Database size={20} />
            <h3>System Information</h3>
          </div>
          <div className="settings-section">
            <div className="info-item">
              <strong>Platform Version:</strong>
              <span>1.0.0</span>
            </div>
            <div className="info-item">
              <strong>Environment:</strong>
              <span>{process.env.NODE_ENV || 'production'}</span>
            </div>
            <div className="info-item">
              <strong>API URL:</strong>
              <span>{process.env.REACT_APP_API_URL || 'http://localhost:3001'}</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Settings;
