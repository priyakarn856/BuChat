import React, { createContext, useRef, useEffect, useState } from 'react';
import SignalProtocolManager from '../utils/signalProtocol';

export const SignalContext = createContext();

/**
 * Signal Protocol Context Provider
 * 
 * CRITICAL: Prevents re-initialization of Signal Protocol instance
 * Industry Standard: Signal/WhatsApp use singleton pattern for crypto manager
 * 
 * Problem solved:
 * - Multiple component re-renders were creating new identities
 * - Each new identity made previous sessions invalid
 * - Messages encrypted with old identity couldn't decrypt
 * 
 * Solution:
 * - useRef persists across re-renders (doesn't reset like useState)
 * - Initialize ONCE on mount
 * - Provide same instance to all children
 */
export const SignalProvider = ({ children }) => {
  const signalManager = useRef(null); // Persists across re-renders
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initSignal = async () => {
      // Guard: Prevent double initialization
      if (signalManager.current) {
        console.log('⚠️ Signal already initialized, skipping');
        return;
      }

      try {
        console.log('🔒 Initializing Signal Protocol (ONE TIME ONLY)');
        // signalProtocol.js already exports a singleton instance, just use it directly
        await SignalProtocolManager.initialize();
        signalManager.current = SignalProtocolManager;
        setIsReady(true);
        console.log('✅ Signal Protocol ready');
      } catch (err) {
        console.error('❌ Signal initialization failed:', err);
        setError(err);
      }
    };

    initSignal();
  }, []); // Empty deps = run once on mount

  return (
    <SignalContext.Provider value={{ 
      signalManager: signalManager.current, 
      isReady,
      error 
    }}>
      {children}
    </SignalContext.Provider>
  );
};

// Custom hook for easy access
export const useSignal = () => {
  const context = React.useContext(SignalContext);
  if (!context) {
    throw new Error('useSignal must be used within SignalProvider');
  }
  return context;
};
