import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import './CustomDialog.css';

export const ConfirmDialog = ({ show, title, message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel", danger = false }) => {
  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="custom-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        <motion.div
          className="custom-dialog glass-panel"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dialog-header">
            <h3>{title}</h3>
            <button className="close-btn" onClick={onCancel}>
              <X size={20} />
            </button>
          </div>
          <div className="dialog-body">
            <p>{message}</p>
          </div>
          <div className="dialog-actions">
            <button className="btn-secondary" onClick={onCancel}>
              {cancelText}
            </button>
            <button className={`btn-primary ${danger ? 'danger' : ''}`} onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export const AlertDialog = ({ show, title, message, onClose, type = 'info' }) => {
  if (!show) return null;

  const icons = {
    info: <Info size={24} className="icon-info" />,
    warning: <AlertTriangle size={24} className="icon-warning" />,
    success: <CheckCircle size={24} className="icon-success" />,
    error: <AlertTriangle size={24} className="icon-error" />
  };

  return (
    <AnimatePresence>
      <motion.div
        className="custom-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="custom-dialog glass-panel"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dialog-header">
            <div className="dialog-title-with-icon">
              {icons[type]}
              <h3>{title}</h3>
            </div>
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="dialog-body">
            <p>{message}</p>
          </div>
          <div className="dialog-actions">
            <button className="btn-primary" onClick={onClose}>
              OK
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export const InputDialog = ({ show, title, message, placeholder, onConfirm, onCancel, confirmText = "Submit", cancelText = "Cancel" }) => {
  const [value, setValue] = React.useState('');

  if (!show) return null;

  const handleConfirm = () => {
    onConfirm(value);
    setValue('');
  };

  const handleCancel = () => {
    onCancel();
    setValue('');
  };

  return (
    <AnimatePresence>
      <motion.div
        className="custom-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleCancel}
      >
        <motion.div
          className="custom-dialog glass-panel"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dialog-header">
            <h3>{title}</h3>
            <button className="close-btn" onClick={handleCancel}>
              <X size={20} />
            </button>
          </div>
          <div className="dialog-body">
            <p>{message}</p>
            <input
              type="text"
              className="dialog-input"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleConfirm()}
            />
          </div>
          <div className="dialog-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              {cancelText}
            </button>
            <button className="btn-primary" onClick={handleConfirm} disabled={!value.trim()}>
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
