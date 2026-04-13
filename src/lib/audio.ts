let audioCtx: AudioContext | null = null;

export const initAudio = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.error("Audio init failed", e);
  }
};

export const playNotificationSound = () => {
  try {
    initAudio();
    if (!audioCtx) return;
    
    const playBeep = (freq: number, time: number, duration: number) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.00001, time + duration);
      osc.start(time);
      osc.stop(time + duration);
    };
    
    playBeep(880, audioCtx.currentTime, 0.1);
    playBeep(1108, audioCtx.currentTime + 0.1, 0.2);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

if (typeof document !== 'undefined') {
  const init = () => {
    initAudio();
    document.removeEventListener('pointerdown', init);
    document.removeEventListener('keydown', init);
  };
  document.addEventListener('pointerdown', init);
  document.addEventListener('keydown', init);
}
