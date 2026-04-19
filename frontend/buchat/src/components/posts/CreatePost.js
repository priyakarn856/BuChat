import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, X, Image as ImageIcon, Video, Music, FileText, 
  Plus, Hash, ShieldAlert, EyeOff, Send 
} from 'lucide-react';
import { toast } from 'react-toastify';
import Button from '../common/Button';
import { postService } from '../../services/postService';
import { useAuth } from '../../contexts/AuthContext';
import './CreatePost.css';

const CreatePost = ({ communityName, onPostCreated }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [flair, setFlair] = useState('');
  const [nsfw, setNsfw] = useState(false);
  const [spoiler, setSpoiler] = useState(false);
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const fileInputRef = useRef(null);

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);

    try {
      for (const file of files) {
        const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

        const uploadedMedia = await postService.uploadMedia(file);

        // Simple mock for metadata extraction logic
        let thumbnail = uploadedMedia.url;
        
        setMedia(prev => [...prev, {
          id: fileId,
          type: uploadedMedia.type,
          url: uploadedMedia.url,
          thumbnail,
          caption: '',
          metadata: uploadedMedia.metadata
        }]);

        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[fileId];
          return updated;
        });
      }
      toast.success('Media uploaded!');
    } catch (error) {
      toast.error('Failed to upload media');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = (mediaId) => {
    setMedia(media.filter(m => m.id !== mediaId));
  };

  const handleUpdateCaption = (mediaId, caption) => {
    setMedia(media.map(m => m.id === mediaId ? { ...m, caption } : m));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Title is required');
    if (!user) return toast.error('Please login');

    try {
      const postData = {
        userId: user.userId,
        title: title.trim(),
        body: body.trim(),
        tags,
        flair: flair || null,
        nsfw,
        spoiler,
        media: media.map(m => ({
          type: m.type,
          url: m.url,
          thumbnail: m.thumbnail,
          caption: m.caption,
          metadata: m.metadata
        }))
      };

      await postService.createPost(communityName, postData);
      toast.success('Post created successfully!');
      
      // Reset
      setTitle('');
      setBody('');
      setTags([]);
      setFlair('');
      setNsfw(false);
      setSpoiler(false);
      setMedia([]);

      if (onPostCreated) onPostCreated();
    } catch (error) {
      toast.error('Failed to create post');
    }
  };

  return (
    <motion.div 
      className="create-post-glass"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="glass-header">
        <h2>Create Post</h2>
        <span className="community-badge">c/{communityName}</span>
      </div>
      
      <form onSubmit={handleSubmit} className="post-form">
        {/* Title Input */}
        <div className="input-group">
          <input
            type="text"
            placeholder="An interesting title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="glass-input title-input"
            required
          />
          <span className="char-count">{title.length}/300</span>
        </div>

        {/* Body Textarea */}
        <div className="input-group">
          <textarea
            placeholder="Share your thoughts..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="glass-input body-input"
          />
        </div>

        {/* Media Toolbar */}
        <div className="media-toolbar">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          
          <div className="toolbar-actions">
            <button type="button" className="tool-btn" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon size={20} /> <span className="btn-label">Image</span>
            </button>
            <button type="button" className="tool-btn" onClick={() => fileInputRef.current?.click()}>
              <Video size={20} /> <span className="btn-label">Video</span>
            </button>
            <button type="button" className="tool-btn" onClick={() => fileInputRef.current?.click()}>
              <FileText size={20} /> <span className="btn-label">Doc</span>
            </button>
          </div>

          <div className="toolbar-status">
            {uploading && <span className="uploading-pulse">Uploading...</span>}
          </div>
        </div>

        {/* Media Preview Grid */}
        <AnimatePresence>
          {media.length > 0 && (
            <motion.div 
              className="media-grid"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              {media.map((item) => (
                <motion.div 
                  key={item.id} 
                  className="media-card"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  layout
                >
                  <button type="button" className="remove-btn" onClick={() => handleRemoveMedia(item.id)}>
                    <X size={14} />
                  </button>
                  
                  <div className="media-thumb">
                    {item.type.includes('image') ? (
                      <img src={item.url} alt="Preview" />
                    ) : (
                      <div className="generic-file-icon">
                        {item.type.includes('video') ? <Video size={32} /> : <FileText size={32} />}
                      </div>
                    )}
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Caption..."
                    value={item.caption}
                    onChange={(e) => handleUpdateCaption(item.id, e.target.value)}
                    className="caption-input"
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tags & Options */}
        <div className="meta-section">
          <div className="tags-container">
            <div className="tags-wrapper">
              <Hash size={16} className="hash-icon" />
              {tags.map((tag) => (
                <motion.span key={tag} className="tag-pill" layout>
                  {tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)}><X size={12} /></button>
                </motion.span>
              ))}
              <input
                type="text"
                placeholder="Add tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                className="tag-input"
              />
            </div>
          </div>

          <div className="toggles-row">
            <button 
              type="button" 
              className={`toggle-chip ${nsfw ? 'active nsfw' : ''}`}
              onClick={() => setNsfw(!nsfw)}
            >
              <ShieldAlert size={16} /> NSFW
            </button>
            <button 
              type="button" 
              className={`toggle-chip ${spoiler ? 'active spoiler' : ''}`}
              onClick={() => setSpoiler(!spoiler)}
            >
              <EyeOff size={16} /> Spoiler
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="form-footer">
          <Button type="button" variant="ghost" disabled={uploading}>Cancel</Button>
          <Button 
            type="submit" 
            variant="primary" 
            disabled={uploading || !title.trim()}
            icon={<Send size={18} />}
          >
            Post
          </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default CreatePost;