'use client';

import { Track, TrackTypeId } from '@/core/types';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { TRACK_TYPES } from '@/core/trackTypes';
import { INSTRUMENTS, getInstrument, getInstrumentOptions } from '@/instruments';

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

// Get instrument options for dropdown
const INSTRUMENT_OPTIONS = getInstrumentOptions();

// Find inherited instrument (with visual capability) by walking up the parent chain
function getInheritedInstrument(
  track: Track,
  tracks: Record<string, Track>
): string | undefined {
  const instrument = track.instrumentId ? getInstrument(track.instrumentId) : undefined;
  if (instrument?.hasVisual) return track.instrumentId;
  if (!track.parentId) return undefined;

  let current = tracks[track.parentId];
  while (current) {
    const parentInstrument = current.instrumentId ? getInstrument(current.instrumentId) : undefined;
    if (parentInstrument?.hasVisual) return current.instrumentId;
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
  const instrument = track.instrumentId ? getInstrument(track.instrumentId) : undefined;

  // Get effective instrument (own or inherited for visual settings)
  const effectiveInstrumentId = getInheritedInstrument(track, tracks);
  const effectiveInstrument = effectiveInstrumentId ? getInstrument(effectiveInstrumentId) : undefined;
  const isInherited = effectiveInstrumentId && !track.instrumentId;

  const handleDelete = () => {
    if (confirm('Delete this track and all its children?')) {
      deleteTrack(track.id);
      selectTrack(null);
    }
  };

  const handleInstrumentChange = (instrumentId: string | undefined) => {
    const newInstrument = instrumentId ? getInstrument(instrumentId) : undefined;
    updateTrack(track.id, {
      instrumentId: instrumentId || undefined,
      instrumentSettings: newInstrument ? { ...newInstrument.defaultSettings } : undefined,
    });
  };

  const handleSettingChange = (key: string, value: unknown) => {
    updateTrack(track.id, {
      instrumentSettings: {
        ...track.instrumentSettings,
        [key]: value,
      },
    });
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

      {/* Unified Instrument */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Instrument</label>
        <select
          value={track.instrumentId || ''}
          onChange={(e) => handleInstrumentChange(e.target.value || undefined)}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
        >
          <option value="">None (modifier only)</option>
          {INSTRUMENT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {instrument && (
          <p className="text-xs text-muted-foreground mt-1">
            {instrument.description}
            {instrument.hasAudio && instrument.hasVisual && ' (Audio + Visual)'}
            {instrument.hasAudio && !instrument.hasVisual && ' (Audio)'}
            {!instrument.hasAudio && instrument.hasVisual && ' (Visual)'}
          </p>
        )}
      </div>

      {/* Instrument Settings - Dynamic based on settingsSchema */}
      {effectiveInstrument?.settingsSchema && (
        <div className="space-y-3 pl-3 border-l-2 border-accent-from/30">
          <label className="block text-xs text-muted-foreground">
            Settings{isInherited && ' (inherited instrument)'}
          </label>

          {Object.entries(effectiveInstrument.settingsSchema).map(([key, field]) => (
            <div key={key}>
              {field.type === 'number' && (
                <>
                  <label className="block text-xs text-muted-foreground mb-1">
                    {field.label}
                  </label>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={(track.instrumentSettings?.[key] as number) ?? field.default}
                    onChange={(e) => handleSettingChange(key, parseFloat(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
                  />
                </>
              )}

              {field.type === 'boolean' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(track.instrumentSettings?.[key] as boolean) ?? field.default}
                    onChange={(e) => handleSettingChange(key, e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-accent-from"
                  />
                  <span className="text-sm">{field.label}</span>
                </label>
              )}

              {field.type === 'select' && field.options && (
                <>
                  <label className="block text-xs text-muted-foreground mb-1">
                    {field.label}
                  </label>
                  <select
                    value={(track.instrumentSettings?.[key] as string) ?? field.default}
                    onChange={(e) => handleSettingChange(key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent-from"
                  >
                    {field.options.map((opt) => (
                      <option key={String(opt.value)} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          ))}
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
