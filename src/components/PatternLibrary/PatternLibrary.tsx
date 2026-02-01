'use client';

import { useState } from 'react';
import { CategorySection } from './CategorySection';
import { SegmentedControl } from './SegmentedControl';
import { PatternGrid } from './PatternGrid';
import { PRESET_CATEGORIES } from '@/core/presets';

export function PatternLibrary() {
  const [activeTab, setActiveTab] = useState<'loops' | 'patterns'>('loops');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(PRESET_CATEGORIES)
  );

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Pattern Library
      </h2>

      <SegmentedControl activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'loops' ? (
        <div className="space-y-2">
          {PRESET_CATEGORIES.map((category) => (
            <CategorySection
              key={category}
              category={category}
              isExpanded={expandedCategories.has(category)}
              onToggle={() => toggleCategory(category)}
            />
          ))}
        </div>
      ) : (
        <PatternGrid />
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Drag patterns onto the timeline or track hierarchy to add them.
        </p>
      </div>
    </div>
  );
}
