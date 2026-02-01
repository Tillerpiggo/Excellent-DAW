'use client';

import { DropPosition } from '@/utils/trackDragValidation';

interface DropIndicatorProps {
  position: DropPosition;
  depth: number;
  isValid: boolean;
}

export function DropIndicator({ position, depth, isValid }: DropIndicatorProps) {
  const baseOffset = 8 + depth * 16;
  const color = isValid ? 'var(--accent)' : 'var(--destructive, #ef4444)';

  if (position === 'inside') {
    // Dashed border for reparenting
    return (
      <div
        className="absolute inset-0 pointer-events-none rounded border-2 border-dashed z-10"
        style={{
          borderColor: color,
          left: baseOffset,
          right: 8,
        }}
      />
    );
  }

  // Horizontal line for before/after
  const isTop = position === 'before';

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-10"
      style={{
        top: isTop ? 0 : undefined,
        bottom: isTop ? undefined : 0,
        height: 2,
        paddingLeft: baseOffset,
        paddingRight: 8,
      }}
    >
      <div
        className="h-full w-full rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
