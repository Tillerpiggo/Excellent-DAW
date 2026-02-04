'use client';

import { Track, TrackTypeId, InstrumentId, VisualInstrumentId } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { TRACK_TYPES } from '@/core/trackTypes';
import { INSTRUMENTS } from '@/core/instruments';
import { VISUAL_INSTRUMENTS, getVisualInstrumentOptions } from '@/core/visualInstruments';
import { TRACK_TYPE_COLORS } from '@/utils/colors';

interface TrackInspectorProps {
  track: Track;
}

const TRACK_TYPE_OPTIONS: { id: TrackTypeId; label: string; category: string }[] = [
  { id: 'base', label: 'Base', category: 'Source' },
  { id: 'rest', label: 'Rest', category: 'Source' },
  { id: 'add', label: 'Add', category: 'Combiner' },
  { id: 'override', label: 'Override', category: 'Combiner' },
  { id: 'gate', label: 'Gate', category: 'Modifier' },
  { id: 'shift', label: 'Shift', category: 'Modifier' },
  { id: 'transpose', label: 'Transpose', category: 'Modifier' },
  { id: 'scale', label: 'Scale Velocity', category: 'Modifier' },
  { id: 'scaleShift', label: 'Scale Shift', category: 'Modifier' },
  { id: 'harmonyMap', label: 'Harmony Map', category: 'Mapper' },
];

// Derived from INSTRUMENTS registry - no need to maintain separately
const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENTS).map(([id, def]) => ({
  id: id as InstrumentId,
  label: def.name,
}));

// Visual instrument options
const VISUAL_INSTRUMENT_OPTIONS = getVisualInstrumentOptions();

// Find inherited visual instrument by walking up the parent chain
function getInheritedVisualInstrument(
  track: Track,
  tracks: Record<string, Track>
): VisualInstrumentId | undefined {
  if (track.visualInstrumentId) return track.visualInstrumentId;
  if (!track.parentId) return undefined;

  let current = tracks[track.parentId];
  while (current) {
    if (current.visualInstrumentId) return current.visualInstrumentId;
    if (!current.parentId) break;
    current = tracks[current.parentId];
  }
  return undefined;
}

export function TrackInspector({ track }: TrackInspectorProps) {
  const { updateTrack, deleteTrack } = useProjectStore();
  const tracks = useProjectStore((s) => s.project.tracks);
  const { selectTrack } = useUIStore();

  const trackType = TRACK_TYPES[track.typeId];

  // Get effective visual instrument (own or inherited from parent)
  const effectiveVisualInstrument = getInheritedVisualInstrument(track, tracks);
  const isInherited = effectiveVisualInstrument && !track.visualInstrumentId;

  const handleDelete = () => {
    if (confirm('Delete this track and all its children?')) {
      deleteTrack(track.id);
      selectTrack(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Track Name */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Name</label>
        <input
          type="text"
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
        />
      </div>

      {/* Track Type */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Track Type</label>
        <select
          value={track.typeId}
          onChange={(e) => updateTrack(track.id, { typeId: e.target.value as TrackTypeId })}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
        >
          {TRACK_TYPE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label} ({opt.category})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">{trackType?.description}</p>
      </div>

      {/* Audio Instrument */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Audio Instrument</label>
        <select
          value={track.instrumentId || ''}
          onChange={(e) =>
            updateTrack(track.id, {
              instrumentId: e.target.value ? (e.target.value as InstrumentId) : undefined,
            })
          }
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
        >
          <option value="">None (modifier only)</option>
          {INSTRUMENT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {track.instrumentId && (
          <p className="text-xs text-muted-foreground mt-1">
            {INSTRUMENTS[track.instrumentId]?.description}
          </p>
        )}
      </div>

      {/* Visual Instrument */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Visual Instrument</label>
        <select
          value={track.visualInstrumentId || ''}
          onChange={(e) =>
            updateTrack(track.id, {
              visualInstrumentId: e.target.value ? (e.target.value as VisualInstrumentId) : undefined,
              visualParams: undefined, // Reset params when changing instrument
            })
          }
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
        >
          <option value="">None</option>
          {VISUAL_INSTRUMENT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {track.visualInstrumentId && (
          <p className="text-xs text-muted-foreground mt-1">
            {VISUAL_INSTRUMENTS[track.visualInstrumentId]?.description}
          </p>
        )}
      </div>

      {/* Visual Instrument Parameters - Fractal Tunnel (own or inherited) */}
      {effectiveVisualInstrument === 'fractalTunnel' && (
        <div className="space-y-3 pl-3 border-l-2 border-accent-from/30">
          <label className="block text-xs text-muted-foreground">
            Fractal Options{isInherited && ' (inherited)'}
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={track.visualParams?.colorPulse as boolean ?? false}
              onChange={(e) => {
                const newParams = {
                  ...track.visualParams,
                  colorPulse: e.target.checked,
                };
                console.log('[TrackInspector] Setting visualParams:', newParams);
                updateTrack(track.id, { visualParams: newParams });
              }}
              className="w-4 h-4 rounded border-border accent-accent-from"
            />
            <span className="text-sm">Color Pulse</span>
          </label>

          {(track.visualParams?.colorPulse as boolean) && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Pulse Speed (pixels/sec)
                </label>
                <input
                  type="number"
                  min="50"
                  max="500"
                  step="10"
                  value={track.visualParams?.pulseSpeed as number ?? 200}
                  onChange={(e) =>
                    updateTrack(track.id, {
                      visualParams: {
                        ...track.visualParams,
                        pulseSpeed: parseFloat(e.target.value) || 200,
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Band Width (pixels)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="5"
                  value={track.visualParams?.pulseBandWidth as number ?? 40}
                  onChange={(e) =>
                    updateTrack(track.id, {
                      visualParams: {
                        ...track.visualParams,
                        pulseBandWidth: parseFloat(e.target.value) || 40,
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Fade Duration (seconds)
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={track.visualParams?.pulseFadeDuration as number ?? 2.0}
                  onChange={(e) =>
                    updateTrack(track.id, {
                      visualParams: {
                        ...track.visualParams,
                        pulseFadeDuration: parseFloat(e.target.value) || 2.0,
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mute Toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={track.muted}
            onChange={(e) => updateTrack(track.id, { muted: e.target.checked })}
            className="w-4 h-4 rounded border-border accent-accent-from"
          />
          <span className="text-sm">Muted</span>
        </label>
      </div>

      {/* Stats */}
      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {track.blocks.length} block{track.blocks.length !== 1 ? 's' : ''} •{' '}
          {track.childIds.length} child track{track.childIds.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Delete Button */}
      <div className="pt-4">
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          Delete Track
        </button>
      </div>
    </div>
  );
}
