'use client';

import React, { useMemo, useRef, ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PluginInstance } from '@/core/types';
import { getPlugin } from '@/plugins';

interface CloneWrapperProps {
  plugins: PluginInstance[];
  children: ReactNode;
}

interface CloneData {
  pluginId: string;
  count: number;
  getTransform: (
    index: number,
    settings: Record<string, unknown>,
    time: number
  ) => THREE.Matrix4;
  settings: Record<string, unknown>;
}

// Module-scope scratch objects — reused every frame to avoid allocations
const _tempMatrix = new THREE.Matrix4();
const _combinedMatrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

export function CloneWrapper({ plugins, children }: CloneWrapperProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  // Get only enabled clone plugins
  const clonePlugins = plugins.filter((instance) => {
    if (!instance.enabled) return false;
    const plugin = getPlugin(instance.pluginId);
    return plugin?.category === 'clone' && plugin.getClones;
  });

  // Calculate clone data from all clone plugins
  const cloneData = useMemo<CloneData[]>(() => {
    return clonePlugins.map((instance) => {
      const plugin = getPlugin(instance.pluginId)!;
      const cloneConfig = plugin.getClones!(instance.settings);
      return {
        pluginId: instance.pluginId,
        count: cloneConfig.count,
        getTransform: cloneConfig.getTransform,
        settings: instance.settings,
      };
    });
  }, [clonePlugins]);

  // Total number of clones (multiply all plugin clone counts)
  const totalClones = useMemo(() => {
    if (cloneData.length === 0) return 1;
    return cloneData.reduce((acc, d) => acc * d.count, 1);
  }, [cloneData]);

  // Update transforms each frame
  useFrame((state) => {
    const time = state.clock.elapsedTime;

    groupRefs.current.forEach((group, cloneIndex) => {
      if (!group) return;

      // Reset transform
      group.position.set(0, 0, 0);
      group.scale.set(1, 1, 1);
      group.rotation.set(0, 0, 0);

      if (cloneData.length === 0) return;

      // For each clone plugin, calculate which sub-index this clone is
      // and apply the corresponding transform
      let remainingIndex = cloneIndex;
      _combinedMatrix.identity();

      for (let i = cloneData.length - 1; i >= 0; i--) {
        const data = cloneData[i];
        const subIndex = remainingIndex % data.count;
        remainingIndex = Math.floor(remainingIndex / data.count);

        const transform = data.getTransform(subIndex, data.settings, time);
        _combinedMatrix.premultiply(transform);
      }

      // Apply combined transform using module-scope scratch objects
      _combinedMatrix.decompose(_position, _quaternion, _scale);

      group.position.copy(_position);
      group.quaternion.copy(_quaternion);
      group.scale.copy(_scale);

      // Apply opacity falloff via userData (instruments can read this)
      const opacityFalloff = cloneData[0]?.settings.opacityFalloff as number ?? 0.2;
      group.userData.opacity = Math.max(0.1, 1 - opacityFalloff * cloneIndex);
      group.userData.cloneIndex = cloneIndex;
    });
  });

  // If no clone plugins, just render children directly
  if (cloneData.length === 0) {
    return <>{children}</>;
  }

  // Clone children for each copy - must create separate React elements
  // so React Three Fiber creates separate Three.js objects
  const cloneChildren = (children: ReactNode, cloneIndex: number): ReactNode => {
    return React.Children.map(children, (child, childIndex) => {
      if (!React.isValidElement(child)) return child;
      return React.cloneElement(child, {
        key: `clone-${cloneIndex}-${childIndex}`,
      } as React.Attributes);
    });
  };

  // Render multiple copies
  return (
    <>
      {Array.from({ length: totalClones }).map((_, index) => (
        <group
          key={index}
          ref={(el) => {
            groupRefs.current[index] = el;
          }}
        >
          {cloneChildren(children, index)}
        </group>
      ))}
    </>
  );
}
