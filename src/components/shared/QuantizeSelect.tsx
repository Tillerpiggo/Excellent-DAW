'use client';

interface QuantizeSelectProps {
  value: number;
  onChange: (value: number) => void;
}

/**
 * Dropdown for selecting grid quantization value.
 * Options are in beats: 0.25 (1/16), 0.5 (1/8), 1 (1/4), 4 (bar).
 */
export function QuantizeSelect({ value, onChange }: QuantizeSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">Grid:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
      >
        <option value={0.25}>1/16</option>
        <option value={0.5}>1/8</option>
        <option value={1}>1/4</option>
        <option value={4}>Bar</option>
      </select>
    </div>
  );
}
