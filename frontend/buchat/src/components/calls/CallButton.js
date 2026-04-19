import React from 'react';
import { motion } from 'framer-motion';
import { Phone, Video } from 'lucide-react';
import './CallButton.css';

const CallButton = ({ type = 'audio', onClick, disabled = false }) => {
  return (
    <motion.button
      className={`call-button ${type}`}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.1 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      title={`${type === 'audio' ? 'Voice' : 'Video'} call`}
    >
      {type === 'audio' ? <Phone size={20} /> : <Video size={20} />}
    </motion.button>
  );
};

export default CallButton;
