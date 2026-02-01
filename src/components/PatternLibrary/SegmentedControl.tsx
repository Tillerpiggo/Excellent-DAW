'use client';

interface SegmentedControlProps {
  activeTab: 'loops' | 'patterns';
  onChange: (tab: 'loops' | 'patterns') => void;
}

export function SegmentedControl({ activeTab, onChange }: SegmentedControlProps) {
  return (
    <div className="flex rounded-lg bg-muted/50 p-1 mb-3">
      <button
        onClick={() => onChange('loops')}
        className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
          activeTab === 'loops'
            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Loops
      </button>
      <button
        onClick={() => onChange('patterns')}
        className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
          activeTab === 'patterns'
            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Patterns
      </button>
    </div>
  );
}
