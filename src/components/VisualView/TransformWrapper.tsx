'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PluginInstance } from '@/core/types';
import { getPlugin } from '@/plugins';

interface TransformWrapperProps {
  plugins: PluginInstance[];
  children: React.ReactNode;
}

export function TransformWrapper({ plugins, children }: TransformWrapperProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Get only enabled transform plugins
  const transformPlugins = plugins.filter((instance) => {
    if (!instance.enabled) return false;
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'transform' && plugin.applyTransform;
  });

  useFrame((state) => {
    if (!groupRef.current) return;

    // Reset transforms before applying plugins
    groupRef.current.rotation.set(0, 0, 0);
    groupRef.current.scale.set(1, 1, 1);
    groupRef.current.position.set(0, 0, 0);

    // Apply each transform plugin in order
    const time = state.clock.elapsedTime;
    for (const instance of transformPlugins) {
      const plugin = getPlugin(instance.pluginId);
      if (plugin?.applyTransform) {
        plugin.applyTransform(groupRef.current, instance.settings, time);
      }
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
