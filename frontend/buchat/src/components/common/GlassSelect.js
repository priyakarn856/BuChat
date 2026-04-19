import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import './GlassSelect.css';

const GlassSelect = ({ value, onChange, options = [], optgroups = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDisplayValue = () => {
    if (!value) return options[0]?.label || 'Select...';
    
    // Check top-level options
    const foundOption = options.find(opt => opt.value === value);
    if (foundOption) return foundOption.label;

    // Check optgroups
    for (const group of optgroups) {
      const foundInGroup = group.options.find(opt => opt.value === value);
      if (foundInGroup) return foundInGroup.label;
    }

    return value;
  };

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className="glass-select-custom-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`glass-select-custom ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{getDisplayValue()}</span>
        <ChevronDown className={`select-icon-custom ${isOpen ? 'open' : ''}`} size={16} />
      </button>

      {isOpen && (
        <div className="glass-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`glass-dropdown-item ${value === opt.value ? 'selected' : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          
          {optgroups.map((group) => (
            <div key={group.label} className="glass-dropdown-group">
              <div className="glass-dropdown-group-label">{group.label}</div>
              {group.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`glass-dropdown-item ${value === opt.value ? 'selected' : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GlassSelect;