import React from 'react';

function Badge({ children, variant = 'default', size = 'md' }) {
  const variants = {
    default: 'badge-default',
    success: 'badge-success',
    danger: 'badge-danger',
    warning: 'badge-warning',
    info: 'badge-info',
    primary: 'badge-primary'
  };

  const sizes = {
    sm: 'badge-sm',
    md: 'badge-md',
    lg: 'badge-lg'
  };

  return (
    <span className={`badge ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}

export default Badge;
