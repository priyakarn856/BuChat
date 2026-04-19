import React, { createContext, useContext, useState } from 'react';

const CallContext = createContext(null);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
};

export const CallProvider = ({ children }) => {
  const [activeCall, setActiveCall] = useState(null);

  const startCall = (callData) => {
    setActiveCall(callData);
  };

  const endCall = () => {
    setActiveCall(null);
  };

  const value = {
    activeCall,
    startCall,
    endCall
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
