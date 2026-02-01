'use client';

import { Track, TrackTypeId, InstrumentId } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { TRACK_TYPES } from '@/core/trackTypes';
import { INSTRUMENTS } from '@/core/instruments';
import { TRACK_TYPE_COLORS } from '@/utils/colors';

interface TrackInspectorProps {
  track: Track;
}

const TRACK_TYPE_OPTIONS: { id: TrackTypeId; label: string; category: string }[] = [
  { id: 'base', label: 'Base', category: 'Source' },
  { id: 'add', label: 'Add', category: 'Combiner' },
  { id: 'override', label: 'Override', category: 'Combiner' },
  { id: 'gate', label: 'Gate', category: 'Modifier' },
  { id: 'shift', label: 'Shift', category: 'Modifier' },
  { id: 'scale', label: 'Scale Velocity', category: 'Modifier' },
  { id: 'scaleShift', label: 'Scale Shift', category: 'Modifier' },
  { id: 'harmonyMap', label: 'Harmony Map', category: 'Mapper' },
];

// Derived from INSTRUMENTS registry - no need to maintain separately
const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENTS).map(([id, def]) => ({
  id: id as InstrumentId,
  label: def.name,
}));

export function TrackInspector({ track }: TrackInspectorProps) {
  const { updateTrack, deleteTrack } = useProjectStore();
  const { selectTrack } = useUIStore();

  const trackType = TRACK_TYPES[track.typeId];

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

      {/* Instrument */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Instrument</label>
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
