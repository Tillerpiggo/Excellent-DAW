'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PluginInstance } from '@/core/types';
import { getPlugin } from '@/plugins';
import { getPluginSettingsWithOverrides } from '@/core/visualPlayback';

interface TransformWrapperProps {
  trackId: string;
  plugins: PluginInstance[];
  children: React.ReactNode;
}

export function TransformWrapper({ trackId, plugins, children }: TransformWrapperProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Get all transform plugins (enabled check is per-frame via automation)
  const transformPlugins = plugins.filter((instance) => {
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'transform' && plugin.applyTransform;
  });

  useFrame((state) => {
    if (!groupRef.current) return;

    // Reset transforms before applying plugins
    groupRef.current.rotation.set(0, 0, 0);
    groupRef.current.scale.set(1, 1, 1);
    groupRef.current.position.set(0, 0, 0);

    // Apply each transform plugin in order (with automation overrides)
    const time = state.clock.elapsedTime;
    for (const instance of transformPlugins) {
      const plugin = getPlugin(instance.pluginId);
      if (plugin?.applyTransform) {
        const settings = getPluginSettingsWithOverrides(trackId, instance.id, instance.settings);
        // Check enabled: automation override takes priority, else use store value
        const isEnabled = settings.enabled !== undefined ? (settings.enabled as number) >= 0.5 : instance.enabled;
        if (!isEnabled) continue;
        plugin.applyTransform(groupRef.current, settings, time);
      }
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
