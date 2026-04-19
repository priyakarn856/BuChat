import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, RotateCcw, ZoomIn, ZoomOut, Check, Image as ImageIcon, Move } from 'lucide-react';
import Button from './Button';
import './ImageUploadModal.css';

const ImageUploadModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  type = 'avatar', // 'avatar' or 'banner'
  currentImage = null 
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(currentImage);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);

  const maxFileSize = 5 * 1024 * 1024; // 5MB

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setPreview(currentImage);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, currentImage]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSize) {
      alert('Image must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target.result);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  }, [maxFileSize]);

  // --- Drag Logic ---
  const handleDragStart = useCallback((e) => {
    if (e.type !== 'touchstart') e.preventDefault();
    setIsDragging(true);
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  }, [position]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    if (e.type !== 'touchmove') e.preventDefault();
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    setPosition({ x: clientX - dragStart.x, y: clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleDragEnd = useCallback(() => setIsDragging(false), []);

  // --- Zoom Logic ---
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleReset = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  // --- Crop Logic ---
  const getCroppedImage = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!imageRef.current) { reject(new Error('No image loaded')); return; }

      const displayedImg = imageRef.current;
      const container = displayedImg.parentElement;
      const viewportWidth = container.offsetWidth;
      const viewportHeight = container.offsetHeight;
      const renderedWidth = displayedImg.offsetWidth;
      const renderedHeight = displayedImg.offsetHeight;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Output resolution
      canvas.width = type === 'avatar' ? 400 : 1200;
      canvas.height = 400;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const naturalWidth = img.naturalWidth;
        const scaleToRendered = renderedWidth / naturalWidth;
        const zoomedWidth = renderedWidth * zoom;
        const zoomedHeight = renderedHeight * zoom;

        const viewportLeft = (zoomedWidth / 2) - (viewportWidth / 2) - position.x;
        const viewportTop = (zoomedHeight / 2) - (viewportHeight / 2) - position.y;

        const sourceX = viewportLeft / (scaleToRendered * zoom);
        const sourceY = viewportTop / (scaleToRendered * zoom);
        const sourceWidth = viewportWidth / (scaleToRendered * zoom);
        const sourceHeight = viewportHeight / (scaleToRendered * zoom);

        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (blob) {
            const fileName = selectedFile?.name || `${type}-${Date.now()}.jpg`;
            const fileType = selectedFile?.type || 'image/jpeg';
            const croppedFile = new File([blob], fileName, { type: fileType, lastModified: Date.now() });
            resolve(croppedFile);
          } else {
            reject(new Error('Failed to create cropped image'));
          }
        }, selectedFile?.type || 'image/jpeg', 0.95);
      };
      
      img.src = preview;
    });
  }, [preview, zoom, position, selectedFile, type]);

  const handleSave = useCallback(async () => {
    if (!preview) return;
    try {
      const croppedFile = await getCroppedImage();
      const croppedPreview = URL.createObjectURL(croppedFile);
      onSave(croppedFile, croppedPreview);
      onClose();
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  }, [preview, onSave, onClose, getCroppedImage]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="modal-overlay-glass"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div 
            className="modal-glass-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="modal-glass-header">
              <div className="header-title">
                <div className="icon-box">
                  <ImageIcon size={20} />
                </div>
                <h2>{type === 'avatar' ? 'Update Avatar' : 'Update Cover'}</h2>
              </div>
              <button className="icon-btn-close" onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="modal-glass-body">
              {!preview ? (
                <div 
                  className="upload-glass-area" 
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div className="upload-icon-circle">
                    <Upload size={32} />
                  </div>
                  <p>Click or drag to upload</p>
                  <span>JPG, PNG up to 5MB</span>
                </div>
              ) : (
                <>
                  <div 
                    className={`preview-glass-container ${type}`}
                    onMouseDown={handleDragStart}
                    onMouseMove={handleDragMove}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                    onTouchStart={handleDragStart}
                    onTouchMove={handleDragMove}
                    onTouchEnd={handleDragEnd}
                  >
                    <div className="preview-viewport">
                      <img
                        ref={imageRef}
                        src={preview}
                        alt="Preview"
                        crossOrigin="anonymous"
                        style={{
                          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom})`,
                          cursor: isDragging ? 'grabbing' : 'grab'
                        }}
                        draggable={false}
                      />
                      {/* Grid Overlay for Visual Aid */}
                      <div className="crop-grid">
                        <div className="grid-line h" />
                        <div className="grid-line h" />
                        <div className="grid-line v" />
                        <div className="grid-line v" />
                      </div>
                    </div>
                    
                    <motion.div 
                      className="drag-hint"
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                    >
                      <Move size={14} /> Drag to Reposition
                    </motion.div>
                  </div>

                  <div className="controls-glass-panel">
                    <div className="zoom-glass-control">
                      <button onClick={handleZoomOut} className="zoom-btn"><ZoomOut size={16} /></button>
                      <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.1"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="cyber-range"
                      />
                      <button onClick={handleZoomIn} className="zoom-btn"><ZoomIn size={16} /></button>
                    </div>

                    <div className="action-buttons-row">
                      <Button variant="ghost" size="small" onClick={handleReset}>
                        <RotateCcw size={14} /> Reset
                      </Button>
                      <Button variant="secondary" size="small" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={14} /> Change
                      </Button>
                    </div>
                  </div>
                  
                  {/* Hidden Input for Change */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </>
              )}
            </div>

            {/* Footer */}
            <div className="modal-glass-footer">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={!preview}>
                <Check size={18} /> Apply Changes
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageUploadModal;