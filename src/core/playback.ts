import * as Tone from 'tone';
import { Project, InstrumentId, Block } from './types';
import { resolveProject, ResolvedTrack } from './resolution';
import { createInstruments, scheduleEvent, disposeInstruments, InstrumentInstances, getOrCreateAudioPlayer, clearAudioPlayers, stopAudioPlayers } from './instruments';
import { ChordQuality, generateChordPitches } from './harmony';
import { getVisualPlaybackEngine, VisualPlaybackEngine } from './visualPlayback';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface PlaybackCallbacks {
  onBeatChange?: (beat: number) => void;
  onStateChange?: (state: PlaybackState) => void;
  onLoop?: () => void;
}

export class PlaybackEngine {
  private instruments: InstrumentInstances | null = null;
  private state: PlaybackState = 'stopped';
  private animationFrame: number | null = null;
  private callbacks: PlaybackCallbacks = {};
  private parts: Tone.Part[] = [];
  private project: Project | null = null;
  private isInitialized = false;
  private visualEngine: VisualPlaybackEngine | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await Tone.start();
    this.instruments = createInstruments();
    this.isInitialized = true;
  }

  setCallbacks(callbacks: PlaybackCallbacks): void {
    this.callbacks = callbacks;
  }

  async play(project: Project): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.state === 'playing') {
      this.stop();
    }

    this.project = project;
    this.state = 'playing';
    this.callbacks.onStateChange?.('playing');

    // Set BPM
    Tone.getTransport().bpm.value = project.bpm;

    // Resolve project to get all playable events
    const resolvedTracks = resolveProject(project);

    // Schedule all events (including audio tracks)
    await this.scheduleEvents(resolvedTracks, project);

    // Initialize and start visual playback engine (synced with Tone.js transport)
    this.visualEngine = getVisualPlaybackEngine();
    this.visualEngine.initialize(
      resolvedTracks,
      project.bpm,
      project.beatsPerBar,
      project.totalBars,
      () => this.getCurrentBeat()
    );
    this.visualEngine.start();

    // Start transport
    Tone.getTransport().start();

    // Start beat tracking
    this.startBeatTracking(project);
  }

  private async scheduleEvents(resolvedTracks: ResolvedTrack[], project: Project): Promise<void> {
    if (!this.instruments) return;

    const totalBeats = project.totalBars * project.beatsPerBar;

    // Clear any existing audio players from previous playback
    clearAudioPlayers(this.instruments);

    for (const resolved of resolvedTracks) {
      if (!resolved.instrumentId) continue;

      // Handle audio tracks separately
      if (resolved.instrumentId === 'audio') {
        await this.scheduleAudioTrack(resolved.trackId, project);
        continue;
      }

      // Filter events within bounds and convert to Tone.Part format
      const partEvents = resolved.output.events
        .filter(event => event.startTimeInBeats < totalBeats)
        .map(event => ({
          time: `${Math.floor(event.startTimeInBeats / project.beatsPerBar)}:${event.startTimeInBeats % project.beatsPerBar}`,
          event,
        }));

      if (partEvents.length === 0) continue;

      // Create a Tone.Part for this track - handles lookahead scheduling automatically
      const part = new Tone.Part((time, { event }) => {
        scheduleEvent(
          event,
          resolved.instrumentId as InstrumentId,
          this.instruments!,
          time
        );
      }, partEvents);

      part.start(0);
      part.loop = true;
      part.loopEnd = `${project.totalBars}:0`;

      this.parts.push(part);
    }

    // Configure transport loop
    Tone.getTransport().loop = true;
    Tone.getTransport().loopEnd = `${project.totalBars}:0`;
    Tone.getTransport().loopStart = 0;
  }

  private async scheduleAudioTrack(trackId: string, project: Project): Promise<void> {
    if (!this.instruments) return;

    const track = project.tracks[trackId];
    if (!track || track.muted) return;

    for (const block of track.blocks) {
      if (!block.audioData) continue;

      try {
        // Get or create the player for this block
        const player = await getOrCreateAudioPlayer(
          block.id,
          block.audioData,
          this.instruments
        );

        // Skip if audio couldn't be loaded
        if (!player) {
          console.warn(`Skipping audio block ${block.id} - audio not found`);
          continue;
        }

        // Calculate timing
        const startTime = `${block.startBar}:0:0`;
        const endBar = block.startBar + block.durationBars;
        const endTime = `${endBar}:0:0`;

        // Configure looping
        if (block.loop) {
          player.loop = true;
          player.loopStart = 0;
          player.loopEnd = block.audioData.duration;
        } else {
          player.loop = false;
        }

        // Schedule player start
        const startPart = new Tone.Part((time) => {
          // Stop first in case it's already playing (from loop)
          player.stop(time);
          player.start(time);
        }, [{ time: startTime }]);

        startPart.start(0);
        startPart.loop = true;
        startPart.loopEnd = `${project.totalBars}:0`;
        this.parts.push(startPart);

        // Schedule player stop at block end
        const stopPart = new Tone.Part((time) => {
          player.stop(time);
        }, [{ time: endTime }]);

        stopPart.start(0);
        stopPart.loop = true;
        stopPart.loopEnd = `${project.totalBars}:0`;
        this.parts.push(stopPart);

      } catch (error) {
        console.error(`Error scheduling audio block ${block.id}:`, error);
      }
    }
  }

  private startBeatTracking(project: Project): void {
    const totalBeats = project.totalBars * project.beatsPerBar;

    const update = () => {
      if (this.state !== 'playing') return;

      const position = Tone.getTransport().position;
      const [bars, beats, sixteenths] = String(position).split(':').map(Number);
      // Include sixteenths for smooth sub-beat movement
      const currentBeat = (bars || 0) * project.beatsPerBar + (beats || 0) + (sixteenths || 0) / 4;

      // Update every frame for smooth playhead movement
      this.callbacks.onBeatChange?.(currentBeat % totalBeats);

      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  stop(): void {
    this.state = 'stopped';
    this.callbacks.onStateChange?.('stopped');

    // Stop transport
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

    // Stop all audio players immediately
    if (this.instruments) {
      stopAudioPlayers(this.instruments);
    }

    // Dispose all parts
    for (const part of this.parts) {
      part.dispose();
    }
    this.parts = [];

    // Stop visual playback
    if (this.visualEngine) {
      this.visualEngine.stop();
    }

    // Stop beat tracking
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.callbacks.onBeatChange?.(0);
  }

  pause(): void {
    if (this.state !== 'playing') return;

    this.state = 'paused';
    this.callbacks.onStateChange?.('paused');
    Tone.getTransport().pause();

    // Stop audio players (they'll be re-triggered on resume via transport)
    if (this.instruments) {
      stopAudioPlayers(this.instruments);
    }

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resume(): void {
    if (this.state !== 'paused' || !this.project) return;

    this.state = 'playing';
    this.callbacks.onStateChange?.('playing');
    Tone.getTransport().start();
    this.startBeatTracking(this.project);
  }

  getState(): PlaybackState {
    return this.state;
  }

  getCurrentBeat(): number {
    if (!this.project) return 0;

    const position = Tone.getTransport().position;
    const [bars, beats] = String(position).split(':').map(Number);
    return (bars || 0) * this.project.beatsPerBar + (beats || 0);
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  seekTo(beat: number, beatsPerBar: number): void {
    const bars = Math.floor(beat / beatsPerBar);
    const beats = beat % beatsPerBar;

    // Stop audio players so they can be re-triggered at the new position
    if (this.instruments) {
      stopAudioPlayers(this.instruments);
    }

    Tone.getTransport().position = `${bars}:${beats}:0`;

    // If playing, start any audio blocks that should be active at this position
    if (this.state === 'playing' && this.project && this.instruments) {
      this.startAudioAtPosition(beat, beatsPerBar);
    }

    // Seek visual engine to show correct state at this position
    if (this.visualEngine) {
      this.visualEngine.seekTo(beat);
    }

    this.callbacks.onBeatChange?.(beat);
  }

  private startAudioAtPosition(beat: number, beatsPerBar: number): void {
    if (!this.project || !this.instruments) return;

    const bpm = this.project.bpm;
    const secondsPerBeat = 60 / bpm;

    for (const trackId of Object.keys(this.project.tracks)) {
      const track = this.project.tracks[trackId];
      if (!track || track.muted || track.instrumentId !== 'audio') continue;

      for (const block of track.blocks) {
        if (!block.audioData) continue;

        const blockStartBeat = block.startBar * beatsPerBar;
        const blockEndBeat = (block.startBar + block.durationBars) * beatsPerBar;

        // Check if the seek position is within this block
        if (beat >= blockStartBeat && beat < blockEndBeat) {
          const player = this.instruments.audioPlayers.get(block.id);
          if (!player) continue;

          // Calculate offset into the audio file
          const beatsIntoBlock = beat - blockStartBeat;
          const secondsIntoBlock = beatsIntoBlock * secondsPerBeat;

          // Handle looping audio - wrap the offset
          let audioOffset = secondsIntoBlock;
          if (block.loop && block.audioData.duration > 0) {
            audioOffset = secondsIntoBlock % block.audioData.duration;
          }

          // Start playback from the calculated offset
          player.start(Tone.now(), audioOffset);
        }
      }
    }
  }

  async previewChord(
    root: number,
    quality: ChordQuality,
    octave: number = 4,
    instrumentId: InstrumentId = 'pad'
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.instruments) return;

    const pitches = generateChordPitches(root, quality, octave);
    const now = Tone.now();

    // Use the track's instrument if it supports polyphony, else fallback to pad
    const polyInstruments: InstrumentId[] = ['synth', 'keys', 'pad'];
    const actualInstrument = polyInstruments.includes(instrumentId) ? instrumentId : 'pad';

    for (const pitch of pitches) {
      scheduleEvent(
        { startTimeInBeats: 0, pitch, velocity: 90, duration: 0.5 },
        actualInstrument,
        this.instruments,
        now
      );
    }
  }

  setLoopRegion(startBeat: number | null, endBeat: number | null, beatsPerBar: number): void {
    const transport = Tone.getTransport();

    if (startBeat === null || endBeat === null) {
      // Clear loop region - restore full project loop
      if (this.project) {
        transport.loopStart = 0;
        transport.loopEnd = `${this.project.totalBars}:0`;
      }
      return;
    }

    // Set custom loop region
    const startBars = Math.floor(startBeat / beatsPerBar);
    const startBeats = startBeat % beatsPerBar;
    const endBars = Math.floor(endBeat / beatsPerBar);
    const endBeats = endBeat % beatsPerBar;

    transport.loopStart = `${startBars}:${startBeats}:0`;
    transport.loopEnd = `${endBars}:${endBeats}:0`;
  }

  dispose(): void {
    this.stop();

    if (this.instruments) {
      disposeInstruments(this.instruments);
      this.instruments = null;
    }

    this.isInitialized = false;
  }
}

// Singleton instance
let playbackEngine: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (!playbackEngine) {
    playbackEngine = new PlaybackEngine();
  }
  return playbackEngine;
}

export function disposePlaybackEngine(): void {
  if (playbackEngine) {
    playbackEngine.dispose();
    playbackEngine = null;
  }
}
