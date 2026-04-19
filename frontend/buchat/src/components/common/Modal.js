import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import './Modal.css';

const Modal = ({ isOpen, onClose, title, children, size = 'medium' }) => {
  
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const variants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-wrapper">
          {/* Backdrop */}
          <motion.div
            className="modal-glass-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: 0.2 }}
          />
          
          {/* Modal Container */}
          <div className="modal-positioner">
            <motion.div
              className={`modal-glass-container ${size}`}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()} // Prevent close on click inside
            >
              <div className="modal-glass-header">
                <h2 className="modal-title">{title}</h2>
                <button className="modal-close-btn" onClick={onClose}>
                  <X size={20} />
                </button>
              </div>
              
              <div className="modal-glass-content">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;