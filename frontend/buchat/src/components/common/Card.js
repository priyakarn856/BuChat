import React from 'react';
import { motion } from 'framer-motion';
import './Card.css';

const Card = ({
  children,
  className = '',
  hover = true, // Enables hover lift effect
  onClick,
  noPadding = false,
  ...props
}) => {
  const isInteractive = !!onClick;

  return (
    <motion.div
      className={`glass-card ${noPadding ? 'no-padding' : ''} ${isInteractive ? 'interactive' : ''} ${className}`}
      onClick={onClick}
      
      // Smooth Entry Animation
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      
      // Interactive Animations (Only if clickable/hover enabled)
      whileHover={isInteractive && hover ? { y: -4, scale: 1.005 } : {}}
      whileTap={isInteractive ? { scale: 0.98 } : {}}
      
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default Card;