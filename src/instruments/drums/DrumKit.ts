import * as Tone from 'tone';
import { Instrument, AudioInstance } from '../types';
import { Event, getDrumType } from '@/core/types';

type KickHitType = 'deep' | 'tight' | 'click';
type SnareHitType = 'crack' | 'body' | 'gated';

interface DrumKitInstance extends AudioInstance {
  kick: Tone.MembraneSynth;
  snare: Tone.NoiseSynth;
  hihat: Tone.MetalSynth;
  clap: Tone.NoiseSynth;
}

const KICK_HIT_TYPES: Record<KickHitType, { pitchDecay: number; octaves: number; oscillator: 'sine' | 'triangle' }> = {
  deep: { pitchDecay: 0.055, octaves: 7, oscillator: 'sine' },
  tight: { pitchDecay: 0.032, octaves: 4, oscillator: 'sine' },
  click: { pitchDecay: 0.018, octaves: 2, oscillator: 'triangle' },
};

const SNARE_HIT_TYPES: Record<SnareHitType, { noise: 'white' | 'pink'; defaultDecay: number; defaultRelease: number }> = {
  crack: { noise: 'white', defaultDecay: 0.18, defaultRelease: 0.08 },
  body: { noise: 'pink', defaultDecay: 0.26, defaultRelease: 0.16 },
  gated: { noise: 'white', defaultDecay: 0.09, defaultRelease: 0.04 },
};

const numberSetting = (settings: Record<string, unknown>, key: string, fallback: number): number =>
  typeof settings[key] === 'number' ? (settings[key] as number) : fallback;

const selectSetting = <T extends string>(
  settings: Record<string, unknown>,
  key: string,
  options: Record<T, unknown>,
  fallback: T
): T => {
  const value = settings[key];
  return typeof value === 'string' && value in options ? (value as T) : fallback;
};

export const DrumKit: Instrument = {
  id: 'drumKit',
  name: 'Drums',
  description: 'Drum kit with kick, snare, hi-hat, and clap',
  color: '#ef4444',
  hasAudio: true,
  hasVisual: false,
  editorType: 'drum',

  defaultSettings: {
    kickType: 'deep',
    kickAttack: 0.001,
    kickDecay: 0.36,
    kickSustain: 0.01,
    kickRelease: 0.34,
    kickVolume: -2,
    snareType: 'crack',
    snareAttack: 0.001,
    snareDecay: 0.18,
    snareSustain: 0,
    snareRelease: 0.08,
    snareVolume: -6,
    hihatVolume: -16,
    clapVolume: -8,
  },

  settingsSchema: {
    kickType: {
      type: 'select',
      label: 'Kick Hit',
      options: [
        { value: 'deep', label: 'Deep' },
        { value: 'tight', label: 'Tight' },
        { value: 'click', label: 'Click' },
      ],
      default: 'deep',
    },
    kickAttack: { type: 'number', label: 'Kick Attack', min: 0.001, max: 0.1, step: 0.001, default: 0.001 },
    kickDecay: { type: 'number', label: 'Kick Decay', min: 0.02, max: 1, step: 0.01, default: 0.36 },
    kickSustain: { type: 'number', label: 'Kick Sustain', min: 0, max: 1, step: 0.01, default: 0.01 },
    kickRelease: { type: 'number', label: 'Kick Release', min: 0.02, max: 1.5, step: 0.01, default: 0.34 },
    kickVolume: { type: 'number', label: 'Kick Vol', min: -20, max: 0, step: 1, default: -2 },
    snareType: {
      type: 'select',
      label: 'Snare Hit',
      options: [
        { value: 'crack', label: 'Crack' },
        { value: 'body', label: 'Body' },
        { value: 'gated', label: 'Gated' },
      ],
      default: 'crack',
    },
    snareAttack: { type: 'number', label: 'Snare Attack', min: 0.001, max: 0.1, step: 0.001, default: 0.001 },
    snareDecay: { type: 'number', label: 'Snare Decay', min: 0.02, max: 1, step: 0.01, default: 0.18 },
    snareSustain: { type: 'number', label: 'Snare Sustain', min: 0, max: 1, step: 0.01, default: 0 },
    snareRelease: { type: 'number', label: 'Snare Release', min: 0.01, max: 1, step: 0.01, default: 0.08 },
    snareVolume: { type: 'number', label: 'Snare Vol', min: -20, max: 0, step: 1, default: -6 },
    hihatVolume: { type: 'number', label: 'HiHat Vol', min: -20, max: 0, step: 1, default: -16 },
    clapVolume: { type: 'number', label: 'Clap Vol', min: -20, max: 0, step: 1, default: -8 },
  },

  createAudio: (settings): DrumKitInstance => {
    const kickType = selectSetting(settings, 'kickType', KICK_HIT_TYPES, 'deep');
    const kickShape = KICK_HIT_TYPES[kickType];
    const kick = new Tone.MembraneSynth({
      pitchDecay: kickShape.pitchDecay,
      octaves: kickShape.octaves,
      oscillator: { type: kickShape.oscillator },
      envelope: {
        attack: numberSetting(settings, 'kickAttack', 0.001),
        decay: numberSetting(settings, 'kickDecay', 0.36),
        sustain: numberSetting(settings, 'kickSustain', 0.01),
        release: numberSetting(settings, 'kickRelease', 0.34),
      },
    }).toDestination();
    kick.volume.value = numberSetting(settings, 'kickVolume', -2);

    const snareType = selectSetting(settings, 'snareType', SNARE_HIT_TYPES, 'crack');
    const snareShape = SNARE_HIT_TYPES[snareType];
    const snare = new Tone.NoiseSynth({
      noise: { type: snareShape.noise },
      envelope: {
        attack: numberSetting(settings, 'snareAttack', 0.001),
        decay: numberSetting(settings, 'snareDecay', snareShape.defaultDecay),
        sustain: numberSetting(settings, 'snareSustain', 0),
        release: numberSetting(settings, 'snareRelease', snareShape.defaultRelease),
      },
    }).toDestination();
    snare.volume.value = numberSetting(settings, 'snareVolume', -6);

    const hihat = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: 0.1,
        release: 0.05,
      },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).toDestination();
    hihat.volume.value = numberSetting(settings, 'hihatVolume', -16);

    const clap = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: {
        attack: 0.005,
        decay: 0.15,
        sustain: 0,
        release: 0.1,
      },
    }).toDestination();
    clap.volume.value = numberSetting(settings, 'clapVolume', -8);

    return {
      kick,
      snare,
      hihat,
      clap,
      dispose: () => {
        kick.dispose();
        snare.dispose();
        hihat.dispose();
        clap.dispose();
      },
    };
  },

  scheduleNote: (instance: AudioInstance, event: Event, time: number) => {
    const inst = instance as DrumKitInstance;
    const velocity = event.velocity / 127;
    const duration = event.duration;

    const drumType = getDrumType(event.pitch);
    switch (drumType) {
      case 'kick':
        inst.kick.triggerAttackRelease('C1', duration, time, velocity);
        break;
      case 'snare':
        inst.snare.triggerAttackRelease(duration, time, velocity);
        break;
      case 'hihat':
        inst.hihat.triggerAttackRelease('C6', duration * 0.5, time, velocity * 0.6);
        break;
      case 'clap':
        inst.clap.triggerAttackRelease(duration, time, velocity);
        break;
      default:
        // Unknown drum pitch - default to kick
        inst.kick.triggerAttackRelease('C1', duration, time, velocity);
        break;
    }
  },

  updateParam: (instance: AudioInstance, key: string, value: number) => {
    const inst = instance as DrumKitInstance;
    switch (key) {
      case 'kickVolume':
        inst.kick.volume.value = value;
        break;
      case 'snareVolume':
        inst.snare.volume.value = value;
        break;
      case 'hihatVolume':
        inst.hihat.volume.value = value;
        break;
      case 'clapVolume':
        inst.clap.volume.value = value;
        break;
    }
  },
};
