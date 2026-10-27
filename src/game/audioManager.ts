import { AudioSettings, FloorSurface } from './types';

class SurvivalAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private currentMood: 'safe' | 'tension' | 'danger' | 'boss' | 'none' = 'none';
  private motifInterval: number | null = null;

  public settings: AudioSettings = {
    master: 0.8,
    music: 0.65,
    sfx: 0.85,
    ambience: 0.75,
    muted: false,
    reducedFlash: false,
  };

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambienceGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.ambienceGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.applySettings();
      this.startAmbientDrone();
    } catch {
      // Ignore if Web Audio API is unavailable in headless environment
    }
  }

  public updateSettings(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.applySettings();
  }

  private applySettings(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain || !this.ambienceGain) return;
    const now = this.ctx.currentTime;
    const masterVal = this.settings.muted ? 0 : this.settings.master;
    this.masterGain.gain.setTargetAtTime(masterVal, now, 0.04);
    this.musicGain.gain.setTargetAtTime(this.settings.music, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, now, 0.05);
    this.ambienceGain.gain.setTargetAtTime(this.settings.ambience, now, 0.05);
  }

  private startAmbientDrone(): void {
    if (!this.ctx || !this.ambienceGain) return;
    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const droneGain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.value = 46.25; // Low F#1
      osc2.type = 'triangle';
      osc2.frequency.value = 69.3; // C#2 fifth

      filter.type = 'lowpass';
      filter.frequency.value = 135;

      droneGain.gain.value = 0.16;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(droneGain);
      droneGain.connect(this.ambienceGain);

      osc1.start();
      osc2.start();
      this.droneOsc1 = osc1;
      this.droneOsc2 = osc2;
    } catch {
      // Ignore
    }
  }

  public setMusicMood(mood: 'safe' | 'tension' | 'danger' | 'boss'): void {
    if (this.currentMood === mood) return;
    this.currentMood = mood;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (this.droneOsc1 && this.droneOsc2) {
      if (mood === 'safe') {
        // Warm Fmaj7 / Dm melancholic safe-room pad
        this.droneOsc1.frequency.setTargetAtTime(55.0, now, 0.5); // A1
        this.droneOsc2.frequency.setTargetAtTime(82.41, now, 0.5); // E2
      } else if (mood === 'tension') {
        this.droneOsc1.frequency.setTargetAtTime(46.25, now, 0.5);
        this.droneOsc2.frequency.setTargetAtTime(65.41, now, 0.5); // Tritone
      } else if (mood === 'danger') {
        this.droneOsc1.frequency.setTargetAtTime(41.2, now, 0.3);
        this.droneOsc2.frequency.setTargetAtTime(58.27, now, 0.3);
      } else if (mood === 'boss') {
        this.droneOsc1.frequency.setTargetAtTime(36.71, now, 0.2);
        this.droneOsc2.frequency.setTargetAtTime(51.91, now, 0.2);
      }
    }

    if (this.motifInterval) {
      window.clearInterval(this.motifInterval);
      this.motifInterval = null;
    }

    const intervalMs = mood === 'boss' ? 1400 : mood === 'danger' ? 2200 : mood === 'safe' ? 3200 : 3800;
    this.motifInterval = window.setInterval(() => {
      if (document.body.dataset.state !== 'playing') return;
      this.playMoodNote(this.currentMood);
    }, intervalMs);
  }

  private playMoodNote(mood: string): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (mood === 'safe') {
      // Classic Resident Evil Save Room style sparse electric piano bell notes
      const notes = [220, 261.63, 329.63, 293.66, 246.94, 196.0];
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.4);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 2.5);
    } else if (mood === 'danger' || mood === 'boss') {
      // Low industrial heartbeat thud
      osc.type = 'sine';
      osc.frequency.setValueAtTime(mood === 'boss' ? 78 : 62, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.28);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Tension eerie minor second chime
      const notes = [311.13, 329.63, 233.08, 246.94];
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.8);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 1.9);
    }
  }

  // Silence immediately before selected jumpscares, then sharp stinger payoff
  public triggerJumpscareAudio(preSilenceSec: number, visualId: string): void {
    this.init();
    if (!this.ctx || !this.musicGain || !this.ambienceGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // 1. Duck music and ambience to near-silence immediately
    this.musicGain.gain.setValueAtTime(0.01, now);
    this.ambienceGain.gain.setValueAtTime(0.01, now);

    const strikeTime = now + Math.max(0.05, preSilenceSec);

    // 2. Sharp dissonant horror chord + screech at strikeTime
    const freqs = [185.0, 196.0, 277.18, 587.33, 830.61];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(f, strikeTime);
      osc.frequency.linearRampToValueAtTime(f * (idx % 2 === 0 ? 0.92 : 1.08), strikeTime + 0.75);

      gain.gain.setValueAtTime(0.001, strikeTime);
      gain.gain.linearRampToValueAtTime(0.11, strikeTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, strikeTime + 0.95);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(strikeTime);
      osc.stop(strikeTime + 1.0);
    });

    // Sub-bass impact boom + glass shatter or metallic burst
    this.playNoiseBurst(strikeTime, visualId === 'window_zombie' ? 0.45 : 0.3, visualId === 'window_zombie' ? 2400 : 900, 0.32);

    // Restore music and ambience after scare settles
    this.musicGain.gain.setTargetAtTime(this.settings.music, strikeTime + 0.9, 0.4);
    this.ambienceGain.gain.setTargetAtTime(this.settings.ambience, strikeTime + 0.9, 0.4);
  }

  private playNoiseBurst(startTime: number, duration: number, filterFreq: number, volume: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(startTime);
  }

  public playFootstep(surface: FloorSurface, isRunning: boolean): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const pitchJitter = 0.92 + Math.random() * 0.16;
    const baseFreq =
      surface === 'metal'
        ? 320
        : surface === 'wood'
          ? 145
          : surface === 'tile'
            ? 260
            : surface === 'carpet'
              ? 95
              : surface === 'grass'
                ? 420
                : 190;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = surface === 'metal' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.065);

    const vol = isRunning ? 0.14 : 0.08;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playWeaponFire(weapon: 'knife' | 'handgun' | 'shotgun'): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;

    if (weapon === 'knife') {
      this.playNoiseBurst(now, 0.09, 1800, 0.18);
      return;
    }

    if (weapon === 'handgun') {
      this.playNoiseBurst(now, 0.16, 1100, 0.34);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.11);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (weapon === 'shotgun') {
      this.playNoiseBurst(now, 0.28, 750, 0.48);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);
      gain.gain.setValueAtTime(0.38, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  public playDryFire(): void {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(920, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playReload(): void {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [0, 0.14].forEach((offset, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i === 0 ? 520 : 780, now + offset);
      gain.gain.setValueAtTime(0.15, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.06);
    });
  }

  public playEnemyCue(cue: 'groan' | 'stalker_hiss' | 'lurker_whisper' | 'boss_roar' | 'attack_bite'): void {
    this.init();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (cue === 'groan') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(92, now);
      osc.frequency.linearRampToValueAtTime(68, now + 0.45);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (cue === 'stalker_hiss') {
      this.playNoiseBurst(now, 0.25, 2200, 0.22);
    } else if (cue === 'lurker_whisper') {
      this.playNoiseBurst(now, 0.35, 1400, 0.15);
    } else if (cue === 'boss_roar') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(64, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.65);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.7);
    } else if (cue === 'attack_bite') {
      this.playNoiseBurst(now, 0.14, 900, 0.26);
    }
  }

  public playUiSound(type: 'pickup' | 'door' | 'locked' | 'save_typewriter' | 'heal' | 'puzzle_solve' | 'hurt'): void {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    if (type === 'pickup') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.06);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (type === 'door') {
      this.playNoiseBurst(now, 0.22, 320, 0.22);
    } else if (type === 'locked') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(160, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'save_typewriter') {
      // Classic typewriter clack-clack-clack + carriage bell ding
      [0, 0.09, 0.18, 0.27].forEach((t) => {
        this.playNoiseBurst(now + t, 0.03, 1800, 0.16);
      });
      const bell = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(1318.5, now + 0.38);
      gain.gain.setValueAtTime(0.18, now + 0.38);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      bell.connect(gain);
      gain.connect(this.sfxGain);
      bell.start(now + 0.38);
      bell.stop(now + 1.0);
    } else if (type === 'heal') {
      [440, 554.37, 659.25].forEach((f, idx) => {
        if (!this.ctx || !this.sfxGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.07);
        gain.gain.setValueAtTime(0.12, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.25);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.26);
      });
    } else if (type === 'puzzle_solve') {
      [293.66, 369.99, 440, 587.33].forEach((f, idx) => {
        if (!this.ctx || !this.sfxGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.09);
        gain.gain.setValueAtTime(0.16, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.38);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.4);
      });
    } else if (type === 'hurt') {
      this.playNoiseBurst(now, 0.2, 650, 0.35);
    }
  }
}

export const audioManager = new SurvivalAudioManager();
