import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, Check, X, AlertCircle } from 'lucide-react';
import './Input.css';

const Input = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  icon,
  disabled = false,
  required = false,
  className = '',
  name,
  validationStatus, // 'idle', 'checking', 'available', 'taken'
  helperText,
  ...props
}) => {
  const inputId = props.id || name || `input-${Math.random().toString(36).substr(2, 9)}`;

  // Determine status color/icon
  const getStatusIcon = () => {
    if (validationStatus === 'checking') return <Loader size={18} className="icon-spin" />;
    if (validationStatus === 'available') return <Check size={18} />;
    if (validationStatus === 'taken') return <X size={18} />;
    if (error) return <AlertCircle size={18} />;
    return null;
  };

  const statusClass = error ? 'error' : validationStatus === 'taken' ? 'error' : validationStatus === 'available' ? 'success' : '';

  return (
    <div className={`glass-input-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
          {required && <span className="required-mark">*</span>}
        </label>
      )}
      
      <div className={`input-wrapper ${statusClass} ${disabled ? 'disabled' : ''}`}>
        {/* Left Icon */}
        {icon && <span className="input-icon-left">{icon}</span>}
        
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`glass-field ${icon ? 'has-icon' : ''}`}
          {...props}
        />

        {/* Validation/Status Icon (Animated) */}
        <div className="input-status-right">
          <AnimatePresence mode="wait">
            {(validationStatus !== 'idle' || error) && (
              <motion.div
                key={validationStatus || 'error'}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className={`status-indicator ${statusClass}`}
              >
                {getStatusIcon()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Focus Border Effect */}
        <div className="focus-border" />
      </div>

      {/* Error / Helper Text */}
      <AnimatePresence>
        {(error || (validationStatus === 'taken' && (name === 'username' || name === 'email'))) ? (
          <motion.div 
            className="input-message error"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || (name === 'username' ? 'Username taken' : 'Email registered')}
          </motion.div>
        ) : helperText && (
          <div className="input-message helper">{helperText}</div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Input;