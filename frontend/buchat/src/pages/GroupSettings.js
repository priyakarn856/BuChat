import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Shield, Settings, Search, X, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { groupService } from '../services/groupService';
import { postService } from '../services/postService';
import { useAuth } from '../contexts/AuthContext';
import './GroupSettings.css';

const GroupSettings = () => {
  const { groupName } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [permissions, setPermissions] = useState({
    removePosts: true,
    removeMembers: false,
    banMembers: false,
    changeVisibility: false
  });
  const [membershipApproval, setMembershipApproval] = useState('instant');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [iconFile, setIconFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, variant: 'danger' });

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

  const fetchData = async () => {
    try {
      const [groupData, membersData, modsData] = await Promise.all([
        groupService.getgroup(groupName),
        groupService.getMembers(groupName),
        groupService.getModerators(groupName)
      ]);
      
      const grp = groupData.group || groupData;
      setGroup(grp);
      setMembers(membersData.members || []);
      setModerators(modsData.moderators || []);
      setMembershipApproval(grp.membershipApproval || 'instant');

      if (grp.creatorId !== user.userId) {
        toast.error('Access denied');
        navigate(`/g/${groupName}`);
      }
    } catch (error) {
      
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteModerator = async () => {
    if (!selectedMember) {
      toast.error('Select a member');
      return;
    }

    try {
      await groupService.inviteModerator(
        groupName,
        selectedMember.userId,
        selectedMember.username || selectedMember.userId,
        user.userId,
        permissions
      );
      toast.success('Moderator invite sent');
      setSelectedMember(null);
      setPermissions({ removePosts: true, removeMembers: false, banMembers: false, changeVisibility: false });
    } catch (error) {
      toast.error('Failed to send invite');
    }
  };

  const handleRemoveModerator = async (modUserId, modUsername) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Moderator?',
      message: `Remove @${modUsername || modUserId} as a moderator? They will lose all moderator permissions.`,
      confirmText: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await groupService.removeModerator(groupName, modUserId, user.userId);
          toast.success('Moderator removed');
          fetchData();
        } catch (error) {
          toast.error('Failed to remove moderator');
        }
        setConfirmDialog({ isOpen: false });
      }
    });
  };

  const handleUpdateSettings = async () => {
    try {
      setUploading(true);
      const updates = { membershipApproval };

      // Upload icon if selected
      if (iconFile) {
        const uploadResult = await postService.uploadMedia(iconFile);
        updates.icon = uploadResult.url;
      }

      // Upload banner if selected
      if (bannerFile) {
        const uploadResult = await postService.uploadMedia(bannerFile);
        updates.banner = uploadResult.url;
      }

      await groupService.updateGroup(groupName, user.userId, updates);
      toast.success('Settings updated');
      setIconFile(null);
      setBannerFile(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setUploading(false);
    }
  };

  const filteredMembers = members.filter(m => 
    !moderators.find(mod => mod.userId === m.userId) &&
    (m.username || m.userId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        confirmVariant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false })}
      />
      <div className="group-settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h1><Settings size={24} /> Group Settings</h1>
          <p>c/{groupName}</p>
        </div>

        {/* General Settings */}
        <Card>
          <h2>General Settings</h2>
          
          <div className="setting-item">
            <label>Group Icon</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setIconFile(e.target.files[0])}
            />
            {(iconFile || group?.icon) && (
              <div className="preview-image">
                <img 
                  src={iconFile ? URL.createObjectURL(iconFile) : group.icon} 
                  alt="Icon preview" 
                  style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '50%' }}
                />
              </div>
            )}
          </div>

          <div className="setting-item">
            <label>Group Banner</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setBannerFile(e.target.files[0])}
            />
            {(bannerFile || group?.banner) && (
              <div className="preview-image">
                <img 
                  src={bannerFile ? URL.createObjectURL(bannerFile) : group.banner} 
                  alt="Banner preview" 
                  style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }}
                />
              </div>
            )}
          </div>

          <div className="setting-item">
            <label>Membership Approval</label>
            <select value={membershipApproval} onChange={(e) => setMembershipApproval(e.target.value)}>
              <option value="instant">Instant - Anyone can join</option>
              <option value="approval">Approval Required - Owner must approve</option>
            </select>
          </div>
          <Button onClick={handleUpdateSettings} loading={uploading} disabled={uploading}>Save Settings</Button>
        </Card>

        {/* Moderators */}
        <Card>
          <h2><Shield size={20} /> Moderators ({moderators.length})</h2>
          <div className="moderators-list">
            {moderators.length === 0 ? (
              <p className="empty-text">No moderators yet</p>
            ) : (
              moderators.map(mod => (
                <div key={mod.userId} className="moderator-item">
                  <div className="mod-info">
                    <strong>u/{mod.username || mod.userId}</strong>
                    <div className="mod-permissions">
                      {mod.permissions?.removePosts && <span className="perm-badge">Remove Posts</span>}
                      {mod.permissions?.removeMembers && <span className="perm-badge">Remove Members</span>}
                      {mod.permissions?.banMembers && <span className="perm-badge">Ban Members</span>}
                      {mod.permissions?.changeVisibility && <span className="perm-badge">Change Visibility</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="small" onClick={() => handleRemoveModerator(mod.userId, mod.username)}>
                    <X size={16} /> Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Invite Moderator */}
        <Card>
          <h2><UserPlus size={20} /> Invite Moderator</h2>
          
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={18} />}
          />

          {searchQuery && (
            <div className="members-search-results">
              {filteredMembers.length === 0 ? (
                <p className="empty-text">No members found</p>
              ) : (
                filteredMembers.map(member => (
                  <div
                    key={member.userId}
                    className={`member-item ${selectedMember?.userId === member.userId ? 'selected' : ''}`}
                    onClick={() => setSelectedMember(member)}
                  >
                    <Users size={18} />
                    <span>u/{member.username || member.userId}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {selectedMember && (
            <div className="invite-section">
              <h3>Selected: u/{selectedMember.username || selectedMember.userId}</h3>
              <div className="permissions-grid">
                <label className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={permissions.removePosts}
                    onChange={(e) => setPermissions({ ...permissions, removePosts: e.target.checked })}
                  />
                  <span>Remove Posts</span>
                </label>
                <label className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={permissions.removeMembers}
                    onChange={(e) => setPermissions({ ...permissions, removeMembers: e.target.checked })}
                  />
                  <span>Remove Members</span>
                </label>
                <label className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={permissions.banMembers}
                    onChange={(e) => setPermissions({ ...permissions, banMembers: e.target.checked })}
                  />
                  <span>Ban Members</span>
                </label>
                <label className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={permissions.changeVisibility}
                    onChange={(e) => setPermissions({ ...permissions, changeVisibility: e.target.checked })}
                  />
                  <span>Change Visibility</span>
                </label>
              </div>
              <Button onClick={handleInviteModerator}>Send Invite</Button>
            </div>
          )}
        </Card>

        {/* Members List */}
        <Card>
          <h2><Users size={20} /> Members ({members.length})</h2>
          <div className="members-list">
            {members.map(member => (
              <div key={member.userId} className="member-list-item">
                <Users size={16} />
                <span>u/{member.username || member.userId}</span>
                <span className="join-date">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
    </>
  );
};

export default GroupSettings;
