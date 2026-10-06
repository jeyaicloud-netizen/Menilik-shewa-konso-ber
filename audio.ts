// Web Audio API sound synthesis and tone generator for authentic Google Phone experience
import { getCachedAudioUrl } from './localBrain';

class PhoneAudioEngine {
  private ctx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;
  private currentAudio: HTMLAudioElement | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // DTMF Frequencies for telephone keypad
  private dtmfFreqs: Record<string, [number, number]> = {
    '1': [697, 1209],
    '2': [697, 1336],
    '3': [697, 1477],
    '4': [770, 1209],
    '5': [770, 1336],
    '6': [770, 1477],
    '7': [852, 1209],
    '8': [852, 1336],
    '9': [852, 1477],
    '*': [941, 1209],
    '0': [941, 1336],
    '#': [941, 1477],
  };

  // Play standard DTMF touch tone when tapping keypad buttons
  playDtmf(key: string, durationMs: number = 160) {
    try {
      const ctx = this.getContext();
      const freqs = this.dtmfFreqs[key];
      if (!freqs) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freqs[0], ctx.currentTime);
      osc2.frequency.setValueAtTime(freqs[1], ctx.currentTime);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();

      osc1.stop(ctx.currentTime + durationMs / 1000);
      osc2.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) {
      console.warn('Audio tone error:', e);
    }
  }

  // Play telephone ringback tone (when waiting for 951 to answer)
  startRingback() {
    this.stopRingback();
    try {
      const ctx = this.getContext();

      const playRingBurst = () => {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        // 400Hz + 450Hz standard European/African ring tone
        osc1.frequency.setValueAtTime(400, now);
        osc2.frequency.setValueAtTime(450, now);
        osc1.type = 'sine';
        osc2.type = 'sine';

        // 1.5 seconds ring
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.12, now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.5);
        osc2.stop(now + 1.5);
      };

      playRingBurst();
      this.ringInterval = setInterval(() => {
        playRingBurst();
      }, 3500);
    } catch (e) {
      console.warn('Ringback error:', e);
    }
  }

  stopRingback() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // Play call connected beep (disabled for clean realistic phone audio)
  playCallConnected() {
    // Silent - realistic phone connects without artificial beeps
  }

  // Play call end tone
  playCallEnded() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn(e);
    }
  }

  private isSpeakerLoud: boolean = true;

  // Toggle or set loudspeaker volume (Loud vs Earpiece)
  setSpeaker(isLoud: boolean) {
    this.isSpeakerLoud = isLoud;
    if (this.currentAudio) {
      this.currentAudio.volume = isLoud ? 1.0 : 0.25;
    }
  }

  getSpeaker(): boolean {
    return this.isSpeakerLoud;
  }

  // Play base64 WAV audio (from Gemini TTS)
  async playBase64Audio(base64Data: string): Promise<void> {
    this.stopCurrentAudio();
    return new Promise((resolve, reject) => {
      try {
        const audio = new Audio(`data:audio/wav;base64,${base64Data}`);
        audio.volume = this.isSpeakerLoud ? 1.0 : 0.25;
        this.currentAudio = audio;
        audio.onended = () => {
          this.currentAudio = null;
          resolve();
        };
        audio.onerror = (err) => {
          this.currentAudio = null;
          reject(err);
        };
        audio.play().catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Play direct audio file (MP3 / WAV from /audio/ directory, root /, or local memory cache)
  async playAudioFile(url: string): Promise<void> {
    this.stopCurrentAudio();
    return new Promise((resolve) => {
      try {
        const localOrRemoteUrl = getCachedAudioUrl(url);
        const audio = new Audio(localOrRemoteUrl);
        audio.volume = this.isSpeakerLoud ? 1.0 : 0.25;
        this.currentAudio = audio;
        audio.onended = () => {
          this.currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          // Fallback to root-level MP3 (e.g. /cbe951.mp3) if /audio/cbe951.mp3 wasn't in a subfolder
          if (localOrRemoteUrl.includes('/audio/')) {
            const rootUrl = localOrRemoteUrl.replace('/audio/', '/');
            const fallbackAudio = new Audio(rootUrl);
            fallbackAudio.volume = this.isSpeakerLoud ? 1.0 : 0.25;
            this.currentAudio = fallbackAudio;
            fallbackAudio.onended = () => {
              this.currentAudio = null;
              resolve();
            };
            fallbackAudio.onerror = () => {
              this.currentAudio = null;
              resolve();
            };
            fallbackAudio.play().catch(() => resolve());
            return;
          }
          this.currentAudio = null;
          resolve();
        };
        audio.play().catch(() => {
          resolve();
        });
      } catch (err) {
        console.warn('playAudioFile error:', err);
        resolve();
      }
    });
  }

  // Stop currently playing voice audio
  stopCurrentAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Play speech using SpeechSynthesis as fallback
  speakFallback(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'am-ET';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Strictly check available voices for am or Ethiopian
      const voices = window.speechSynthesis.getVoices();
      const amVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith('am') ||
          v.name.toLowerCase().includes('amharic') ||
          v.name.toLowerCase().includes('ethiop')
      );

      // If phone lacks an authentic Amharic voice, NEVER fall back to English TalkBack voice!
      if (!amVoice) {
        console.warn('No native Amharic TTS voice found on this device; skipping browser speech to avoid English TalkBack voice.');
        resolve();
        return;
      }

      utterance.voice = amVoice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }
}

export const phoneAudio = new PhoneAudioEngine();
