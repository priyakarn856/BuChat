import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle } from 'lucide-react';
import './ConfirmDialog.css';

const ConfirmDialog = ({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  confirmVariant = 'danger', // 'danger', 'primary', 'warning'
  onConfirm, 
  onCancel 
}) => {
  
  // Icon mapping based on variant
  const getIcon = () => {
    switch(confirmVariant) {
      case 'danger': return <AlertTriangle size={24} className="dialog-icon danger" />;
      case 'warning': return <AlertTriangle size={24} className="dialog-icon warning" />;
      case 'primary': return <Info size={24} className="dialog-icon primary" />;
      case 'success': return <CheckCircle size={24} className="dialog-icon success" />;
      default: return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="confirm-overlay" 
          onClick={onCancel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div 
            className="confirm-glass-card" 
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header / Icon Area */}
            <div className="confirm-header">
              <div className={`icon-wrapper ${confirmVariant}`}>
                {getIcon()}
              </div>
              <h3>{title}</h3>
            </div>

            {/* Content Body */}
            <div className="confirm-body">
              <p>{message}</p>
            </div>

            {/* Action Buttons */}
            <div className="confirm-actions">
              <button className="glass-btn-ghost" onClick={onCancel}>
                {cancelText}
              </button>
              <button 
                className={`glass-btn-solid ${confirmVariant}`} 
                onClick={onConfirm}
              >
                {confirmText}
              </button>
            </div>
            
            {/* Decorative Glow */}
            <div className={`dialog-glow ${confirmVariant}`} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;