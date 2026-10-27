import React, { useState } from 'react';
import { SceneObject, ShadingMode, StudioMode, TransformTool } from './types';
import { HeaderBar } from './components/layout/HeaderBar';
import { Viewport3D } from './components/viewport/Viewport3D';
import { InspectorPanel } from './components/layout/InspectorPanel';
import { BottomBar } from './components/layout/BottomBar';

// Mode Panels
import { OpenSCADMode } from './components/modes/OpenSCADMode';
import { WompMode } from './components/modes/WompMode';
import { BlockbenchMode } from './components/modes/BlockbenchMode';
import { MeshyMode } from './components/modes/MeshyMode';
import { BlenderMode } from './components/modes/BlenderMode';
import { SplineMode } from './components/modes/SplineMode';
import { FreeCADMode } from './components/modes/FreeCADMode';

// Engines
import { parseAndExecuteScad } from './core/scadEngine';

const INITIAL_OBJECTS: SceneObject[] = [
  {
    id: 'obj-cube-1',
    name: 'Main Cube',
    type: 'cube',
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [2, 2, 2],
    color: '#3b82f6',
    roughness: 0.3,
    metalness: 0.2,
    visible: true,
    locked: false,
  },
  {
    id: 'obj-sphere-1',
    name: 'Accent Sphere',
    type: 'sphere',
    position: [2.5, 0.75, 0],
    rotation: [0, 0, 0],
    scale: [1.5, 1.5, 1.5],
    color: '#ec4899',
    roughness: 0.15,
    metalness: 0.8,
    visible: true,
    locked: false,
  },
  {
    id: 'obj-cyl-1',
    name: 'Column Base',
    type: 'cylinder',
    position: [-2.5, 1, 0],
    rotation: [0, 0, 0],
    scale: [1.6, 2, 1.6],
    color: '#10b981',
    roughness: 0.4,
    metalness: 0.1,
    visible: true,
    locked: false,
  },
];

export const App: React.FC = () => {
  const [mode, setMode] = useState<StudioMode>('mesh');
  const [objects, setObjects] = useState<SceneObject[]>(INITIAL_OBJECTS);
  const [selectedId, setSelectedId] = useState<string | null>('obj-cube-1');
  const [shading, setShading] = useState<ShadingMode>('solid');
  const [tool, setTool] = useState<TransformTool>('translate');

  const selectedObject = objects.find((o) => o.id === selectedId) || null;

  // Add standard primitive
  const handleAddPrimitive = (type: 'cube' | 'sphere' | 'cylinder' | 'torus') => {
    const id = `obj-${type}-${Date.now()}`;
    const newObj: SceneObject = {
      id,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${objects.length + 1}`,
      type,
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: type === 'sphere' ? [1.5, 1.5, 1.5] : [2, 2, 2],
      color: '#6366f1',
      roughness: 0.3,
      metalness: 0.2,
      visible: true,
      locked: false,
    };
    setObjects((prev) => [...prev, newObj]);
    setSelectedId(id);
  };

  // Update object properties
  const handleUpdateObject = (updated: SceneObject) => {
    setObjects((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  // Delete object
  const handleDeleteObject = (id: string) => {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // OpenSCAD code compiler handler
  const handleRunScadCode = (code: string) => {
    const parsed = parseAndExecuteScad(code);
    if (parsed.length > 0) {
      setObjects(parsed);
      setSelectedId(parsed[0].id);
    }
  };

  // Womp SDF Clay primitive handler
  const handleAddSdfPrimitive = (type: 'sphere' | 'box' | 'torus', op: 'smooth-union' | 'subtract') => {
    const id = `sdf-${type}-${Date.now()}`;
    const newObj: SceneObject = {
      id,
      name: `Clay ${type} (${op})`,
      type: type === 'sphere' ? 'sphere' : type === 'box' ? 'cube' : 'torus',
      position: [(Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2],
      rotation: [0, 0, 0],
      scale: [1.8, 1.8, 1.8],
      color: op === 'subtract' ? '#1e293b' : '#e07a5f',
      roughness: 0.9,
      metalness: 0.05,
      visible: true,
      locked: false,
    };
    setObjects((prev) => [...prev, newObj]);
    setSelectedId(id);
  };

  // Blockbench Box handler
  const handleAddBlockbenchBox = (name: string, from: [number, number, number], to: [number, number, number], color: string) => {
    const id = `voxel-box-${Date.now()}`;
    const width = to[0] - from[0];
    const height = to[1] - from[1];
    const depth = to[2] - from[2];

    const newObj: SceneObject = {
      id,
      name: `Box: ${name}`,
      type: 'cube',
      position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      rotation: [0, 0, 0],
      scale: [Math.abs(width), Math.abs(height), Math.abs(depth)],
      color,
      roughness: 0.8,
      metalness: 0.1,
      visible: true,
      locked: false,
    };
    setObjects((prev) => [...prev, newObj]);
    setSelectedId(id);
  };

  // FreeCAD Pad Extrusion handler
  const handleAddCadFeature = (type: 'pad' | 'pocket' | 'fillet', height: number) => {
    const id = `cad-pad-${Date.now()}`;
    const newObj: SceneObject = {
      id,
      name: `CAD Pad (${height}mm)`,
      type: 'cube',
      position: [0, height / 2, 0],
      rotation: [0, 0, 0],
      scale: [3, height, 3],
      color: '#38bdf8',
      roughness: 0.25,
      metalness: 0.5,
      visible: true,
      locked: false,
    };
    setObjects((prev) => [...prev, newObj]);
    setSelectedId(id);
  };

  // Meshy AI Model generator handler
  const handleGenerateAiModel = (prompt: string, style: string) => {
    const id = `ai-mesh-${Date.now()}`;
    const newObj: SceneObject = {
      id,
      name: `AI: ${prompt.slice(0, 20)}...`,
      type: 'torus',
      position: [0, 1.5, 0],
      rotation: [0.3, 0.4, 0],
      scale: [2.5, 2.5, 2.5],
      color: '#a855f7',
      roughness: 0.2,
      metalness: 0.7,
      visible: true,
      locked: false,
    };
    setObjects((prev) => [...prev, newObj]);
    setSelectedId(id);
  };

  // Export handler
  const handleExport = (format: string) => {
    let content = '';
    let mimeType = 'text/plain';
    let filename = `omni3d_model.${format}`;

    if (format === 'scad') {
      content = objects
        .map((o) => {
          const [px, py, pz] = o.position;
          const [sx, sy, sz] = o.scale;
          if (o.type === 'cube') {
            return `translate([${px}, ${py}, ${pz}]) cube([${sx}, ${sy}, ${sz}], center=true);`;
          } else if (o.type === 'sphere') {
            return `translate([${px}, ${py}, ${pz}]) sphere(r=${sx / 2});`;
          } else if (o.type === 'cylinder') {
            return `translate([${px}, ${py}, ${pz}]) cylinder(h=${sy}, r=${sx / 2}, center=true);`;
          }
          return '';
        })
        .join('\n');
    } else if (format === 'obj') {
      content = `# Omni3D Studio Wavefront OBJ Export\n# Objects: ${objects.length}\n`;
      let vertexOffset = 1;
      for (const o of objects) {
        content += `o ${o.name.replace(/\s+/g, '_')}\n`;
        const [x, y, z] = o.position;
        const [sx, sy, sz] = o.scale.map((s) => s / 2);
        // Basic bounding box vertices for demonstration
        content += `v ${x - sx} ${y - sy} ${z - sz}\n`;
        content += `v ${x + sx} ${y - sy} ${z - sz}\n`;
        content += `v ${x + sx} ${y + sy} ${z - sz}\n`;
        content += `v ${x - sx} ${y + sy} ${z - sz}\n`;
        content += `v ${x - sx} ${y - sy} ${z + sz}\n`;
        content += `v ${x + sx} ${y - sy} ${z + sz}\n`;
        content += `v ${x + sx} ${y + sy} ${z + sz}\n`;
        content += `v ${x - sx} ${y + sy} ${z + sz}\n`;
        const v = vertexOffset;
        content += `f ${v} ${v + 1} ${v + 2} ${v + 3}\n`;
        content += `f ${v + 5} ${v + 4} ${v + 7} ${v + 6}\n`;
        content += `f ${v + 4} ${v} ${v + 3} ${v + 7}\n`;
        content += `f ${v + 1} ${v + 5} ${v + 6} ${v + 2}\n`;
        content += `f ${v + 3} ${v + 2} ${v + 6} ${v + 7}\n`;
        content += `f ${v + 4} ${v + 5} ${v + 1} ${v}\n`;
        vertexOffset += 8;
      }
    } else {
      content = JSON.stringify({ version: '1.0', format, objects }, null, 2);
      filename = `omni3d_scene.json`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-studio-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Studio Header */}
      <HeaderBar
        currentMode={mode}
        onSelectMode={setMode}
        onExport={handleExport}
        onAddPrimitive={handleAddPrimitive}
      />

      {/* Main Workspace Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Side: Mode-Specific Workspace Panel */}
        {mode === 'scad' && <OpenSCADMode onRunCode={handleRunScadCode} />}
        {mode === 'sdf' && <WompMode onAddSdfPrimitive={handleAddSdfPrimitive} />}
        {mode === 'voxel' && <BlockbenchMode onAddBox={handleAddBlockbenchBox} />}
        {mode === 'ai' && <MeshyMode onGenerateAiModel={handleGenerateAiModel} />}
        {mode === 'mesh' && (
          <BlenderMode
            onSubdivide={() => {
              if (selectedObject) {
                handleUpdateObject({
                  ...selectedObject,
                  scale: [selectedObject.scale[0] * 1.05, selectedObject.scale[1] * 1.05, selectedObject.scale[2] * 1.05],
                });
              }
            }}
            onExtrude={() => {
              if (selectedObject) {
                handleUpdateObject({
                  ...selectedObject,
                  scale: [selectedObject.scale[0], selectedObject.scale[1] * 1.3, selectedObject.scale[2]],
                });
              }
            }}
          />
        )}
        {mode === 'interactive' && <SplineMode />}
        {mode === 'cad' && <FreeCADMode onAddCadFeature={handleAddCadFeature} />}

        {/* Center: 3D Viewport */}
        <main className="flex-1 h-full relative overflow-hidden bg-gradient-to-b from-[#0b0e14] to-[#12161f]">
          <Viewport3D
            objects={objects}
            selectedId={selectedId}
            onSelectObject={setSelectedId}
            onUpdateTransform={(id, pos, rot, sc) => {
              setObjects((prev) =>
                prev.map((o) =>
                  o.id === id ? { ...o, position: pos, rotation: rot, scale: sc } : o
                )
              );
            }}
            mode={mode}
            tool={tool}
            onChangeTool={setTool}
            shading={shading}
          />
        </main>

        {/* Right Side: Scene Outliner & Properties Inspector */}
        <InspectorPanel
          objects={objects}
          selectedObject={selectedObject}
          onSelectObject={setSelectedId}
          onUpdateObject={handleUpdateObject}
          onDeleteObject={handleDeleteObject}
          shading={shading}
          onChangeShading={setShading}
          tool={tool}
          onChangeTool={setTool}
        />
      </div>

      {/* Bottom Timeline & Status */}
      <BottomBar objectCount={objects.length} />
    </div>
  );
};

export default App;
