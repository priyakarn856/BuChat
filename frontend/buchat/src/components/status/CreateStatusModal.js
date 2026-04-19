import React, { useState } from 'react';
import { motion } from 'framer-motion';
// eslint-disable-next-line no-unused-vars
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { socialService } from '../../services/socialService';
import { presignService } from '../../services/presignService';
import Button from '../common/Button';
import './CreateStatusModal.css';

const CreateStatusModal = ({ onClose, onCreated }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState('followers');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      toast.error('Please select an image or video');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    try {
      const { fileUrl } = await presignService.uploadFile(file, file.type.startsWith('video/') ? 'video' : 'image');
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

      await socialService.createStatus({ mediaUrl: fileUrl, mediaType, visibility, caption });
      toast.success('Status posted!');
      onCreated();
      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to post status');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="create-status-modal" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Status</h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal-body">
          {!preview ? (
            <label className="file-upload-area">
              <input type="file" accept="image/*,video/*" onChange={handleFileChange} hidden />
              <Upload size={48} />
              <p>Click to upload image or video</p>
              <span>Max 50MB</span>
            </label>
          ) : (
            <div className="preview-area">
              {file.type.startsWith('video/') ? <video src={preview} controls /> : <img src={preview} alt="Preview" />}
              <button className="remove-preview" onClick={() => { setFile(null); setPreview(null); }}><X size={20} /></button>
            </div>
          )}

          <textarea placeholder="Add a caption..." value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} />

          <div className="visibility-selector">
            <label>Who can see this?</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="followers">Followers</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={uploading} disabled={!file || uploading}>Post Status</Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CreateStatusModal;
