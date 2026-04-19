// Audio manager for call sounds (ringtones, dial tones, etc.)
// Uses Web Audio API to generate tones programmatically

class CallAudioManager {
  constructor() {
    this.audioContext = null;
    this.ringtoneOscillator = null;
    this.dialToneOscillator = null;
    this.gainNode = null;
    this.isRinging = false;
    this.isDialing = false;
    this.ringtoneInterval = null;
    this.ringtoneAudio = null;
  }

  getAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // Play incoming call ringtone (similar to WhatsApp/Telegram)
  playRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;
    
    const playRingPattern = () => {
      if (!this.isRinging) return;
      
      const ctx = this.getAudioContext();
      
      // Create oscillators for a pleasant two-tone ring
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      // Pleasant ringtone frequencies (similar to classic phone ring)
      osc1.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc2.frequency.setValueAtTime(480, ctx.currentTime); // B4
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime + 0.4);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
      
      // Second ring burst
      setTimeout(() => {
        if (!this.isRinging) return;
        
        const osc3 = ctx.createOscillator();
        const osc4 = ctx.createOscillator();
        const gainNode2 = ctx.createGain();
        
        osc3.type = 'sine';
        osc4.type = 'sine';
        osc3.frequency.setValueAtTime(440, ctx.currentTime);
        osc4.frequency.setValueAtTime(480, ctx.currentTime);
        
        gainNode2.gain.setValueAtTime(0, ctx.currentTime);
        gainNode2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gainNode2.gain.setValueAtTime(0.3, ctx.currentTime + 0.4);
        gainNode2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        
        osc3.connect(gainNode2);
        osc4.connect(gainNode2);
        gainNode2.connect(ctx.destination);
        
        osc3.start(ctx.currentTime);
        osc4.start(ctx.currentTime);
        osc3.stop(ctx.currentTime + 0.5);
        osc4.stop(ctx.currentTime + 0.5);
      }, 200);
    };
    
    // Play immediately and then repeat
    playRingPattern();
    this.ringtoneInterval = setInterval(playRingPattern, 2500);
    
    console.log('🔔 Ringtone started');
  }

  stopRingtone() {
    this.isRinging = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    console.log('🔕 Ringtone stopped');
  }

  // Play outgoing call dial tone (similar to phone ringing sound)
  playDialTone() {
    if (this.isDialing) return;
    this.isDialing = true;
    
    const playDialPattern = () => {
      if (!this.isDialing) return;
      
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, ctx.currentTime); // Standard ringback tone
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime + 1.0);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.1);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.1);
    };
    
    playDialPattern();
    this.dialToneInterval = setInterval(playDialPattern, 4000);
    
    console.log('📞 Dial tone started');
  }

  stopDialTone() {
    this.isDialing = false;
    if (this.dialToneInterval) {
      clearInterval(this.dialToneInterval);
      this.dialToneInterval = null;
    }
    console.log('📞 Dial tone stopped');
  }

  // Play call connected sound
  playConnected() {
    const ctx = this.getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    
    console.log('✅ Call connected sound');
  }

  // Play call ended sound
  playEnded() {
    const ctx = this.getAudioContext();
    
    // Three descending beeps
    [0, 0.15, 0.3].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480 - (i * 60), ctx.currentTime + delay);
      
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.12);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.12);
    });
    
    console.log('📴 Call ended sound');
  }

  // Play busy tone
  playBusy() {
    if (this.isBusy) return;
    this.isBusy = true;
    
    const playBusyPattern = () => {
      if (!this.isBusy) return;
      
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.25);
      gainNode.gain.setValueAtTime(0, ctx.currentTime + 0.25);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    };
    
    playBusyPattern();
    this.busyInterval = setInterval(playBusyPattern, 500);
    
    // Auto-stop after 3 seconds
    setTimeout(() => this.stopBusy(), 3000);
  }

  stopBusy() {
    this.isBusy = false;
    if (this.busyInterval) {
      clearInterval(this.busyInterval);
      this.busyInterval = null;
    }
  }

  // Stop all sounds
  stopAll() {
    this.stopRingtone();
    this.stopDialTone();
    this.stopBusy();
  }

  // Cleanup
  dispose() {
    this.stopAll();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

// Export singleton instance
const callAudioManager = new CallAudioManager();
export default callAudioManager;
