import React from 'react';
import { motion } from 'framer-motion';
import './Button.css';

const Button = ({
  children,
  variant = 'primary', // primary, secondary, ghost, danger
  size = 'medium',     // small, medium, large
  onClick,
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  className = '',
  type = 'button',
  ...props
}) => {
  const buttonClass = `glass-btn ${variant} ${size} ${fullWidth ? 'full-width' : ''} ${className}`;

  return (
    <motion.button
      type={type}
      className={buttonClass}
      onClick={onClick}
      disabled={disabled || loading}
      // Micro-interactions
      whileHover={{ scale: disabled ? 1 : 1.02, y: -1 }}
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      {...props}
    >
      {/* Background Layer for Hover Effects */}
      <div className="btn-shine" />

      {/* Content Layer */}
      <span className="btn-content">
        {loading ? (
          <span className="btn-spinner" />
        ) : (
          <>
            {icon && <span className="btn-icon">{icon}</span>}
            <span>{children}</span>
          </>
        )}
      </span>
    </motion.button>
  );
};

export default Button;