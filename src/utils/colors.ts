import { PatternCategory, TrackTypeId, InstrumentId } from '@/core/types';
import { INSTRUMENTS } from '@/core/instruments';

// Category colors (kid-friendly but not childish)
export const CATEGORY_COLORS: Record<PatternCategory, string> = {
  drums: '#AA96DA',    // Purple
  chords: '#FF6B6B',   // Coral
  bass: '#FFE66D',     // Yellow
  arp: '#4ECDC4',      // Teal
  modifier: '#95E1D3', // Mint
  rhythm: '#F9A826',   // Orange
  mute: '#64748b',     // Slate
  rest: '#9ca3af',     // Gray
};

// Track type colors
export const TRACK_TYPE_COLORS: Record<TrackTypeId, string> = {
  base: '#6366f1',       // Indigo
  add: '#22c55e',        // Green
  override: '#ef4444',   // Red
  mute: '#64748b',       // Slate (muted gray)
  gate: '#f59e0b',       // Amber
  shift: '#06b6d4',      // Cyan
  transpose: '#0ea5e9',  // Sky blue
  scale: '#8b5cf6',      // Violet
  scaleShift: '#ec4899', // Pink
  harmonyMap: '#14b8a6', // Teal
  rhythm: '#F9A826',     // Orange
  rest: '#9ca3af',       // Gray
};

// Instrument colors - derived from INSTRUMENTS registry
export const INSTRUMENT_COLORS = Object.fromEntries(
  Object.entries(INSTRUMENTS).map(([id, def]) => [id, def.color])
) as Record<InstrumentId, string>;

// Background variants (darker for timeline blocks)
export function getBlockColor(instrumentId?: InstrumentId, category?: PatternCategory): string {
  if (instrumentId) {
    return INSTRUMENT_COLORS[instrumentId];
  }
  if (category) {
    return CATEGORY_COLORS[category];
  }
  return '#64748b'; // Slate gray default
}

// Get contrasting text color
export function getTextColor(backgroundColor: string): string {
  // Simple luminance check
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a2e' : '#ffffff';
}

// Get a semi-transparent version of a color
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Lighten a color
export function lighten(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + amount);
  const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Darken a color
export function darken(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - amount);
  const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Mix white with a color (tinted white)
// ratio is how much white (0 = full color, 1 = pure white)
export function tintWhite(color: string, ratio: number = 0.85): string {
  const hex = color.replace('#', '');
  const colorR = parseInt(hex.substr(0, 2), 16);
  const colorG = parseInt(hex.substr(2, 2), 16);
  const colorB = parseInt(hex.substr(4, 2), 16);
  const r = Math.round(255 * ratio + colorR * (1 - ratio));
  const g = Math.round(255 * ratio + colorG * (1 - ratio));
  const b = Math.round(255 * ratio + colorB * (1 - ratio));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
