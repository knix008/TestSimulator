import React, { useState } from 'react';
import { Cpu, Compass, Layers, GitBranch, ArrowUpRight, Circle, Square } from 'lucide-react';

interface FreeCADModeProps {
  onAddCadFeature: (type: 'pad' | 'pocket' | 'fillet', height: number) => void;
}

export const FreeCADMode: React.FC<FreeCADModeProps> = ({ onAddCadFeature }) => {
  const [activePlane, setActivePlane] = useState<'XY' | 'XZ' | 'YZ'>('XY');
  const [padHeight, setPadHeight] = useState(2.5);

  const features = [
    { id: '1', name: 'Sketch001 (Base Profile)', type: 'Sketch (XY Plane)', status: 'Fully Constrained' },
    { id: '2', name: 'Pad001 (Extrusion 25mm)', type: 'Feature: Pad', status: 'Active' },
    { id: '3', name: 'Pocket001 (Mount Hole)', type: 'Feature: Cut', status: 'Active' },
    { id: '4', name: 'Fillet001 (Edge R2mm)', type: 'Feature: Fillet', status: 'Active' },
  ];

  return (
    <div className="w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-slate-200">FreeCAD Parametric</span>
        </div>
        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono">
          B-Rep
        </span>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* 2D Sketcher Plane */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">New Sketch Plane</label>
          <div className="grid grid-cols-3 gap-2">
            {(['XY', 'XZ', 'YZ'] as const).map((plane) => (
              <button
                key={plane}
                onClick={() => setActivePlane(plane)}
                className={`py-1.5 rounded-lg border text-xs font-mono font-medium transition-all ${
                  activePlane === plane
                    ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                {plane} Plane
              </button>
            ))}
          </div>
        </div>

        {/* 2D Sketch Entities & Constraints */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">2D Sketcher Tools</label>
          <div className="grid grid-cols-3 gap-1.5 bg-studio-950 p-1.5 rounded-lg border border-studio-800">
            <button className="flex items-center justify-center gap-1 p-2 bg-studio-800 hover:bg-studio-700 rounded text-xs text-slate-200">
              <Square className="w-3.5 h-3.5 text-blue-400" />
              <span>Rect</span>
            </button>
            <button className="flex items-center justify-center gap-1 p-2 bg-studio-800 hover:bg-studio-700 rounded text-xs text-slate-200">
              <Circle className="w-3.5 h-3.5 text-blue-400" />
              <span>Circle</span>
            </button>
            <button className="flex items-center justify-center gap-1 p-2 bg-studio-800 hover:bg-studio-700 rounded text-xs text-slate-200">
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              <span>Line</span>
            </button>
          </div>
        </div>

        {/* 3D Part Design Operations */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">PartDesign Features</label>
          <div className="space-y-2">
            <div className="bg-studio-950 p-2.5 rounded-lg border border-studio-800">
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-slate-300">Pad / Extrude Length</span>
                <span className="font-mono text-blue-400">{padHeight} mm</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={padHeight}
                onChange={(e) => setPadHeight(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <button
                onClick={() => onAddCadFeature('pad', padHeight)}
                className="w-full mt-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Apply Pad Extrusion</span>
              </button>
            </div>
          </div>
        </div>

        {/* Parametric History Tree */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-blue-400" />
            Parametric History Tree
          </label>
          <div className="space-y-1 bg-studio-950 p-2 rounded-lg border border-studio-800">
            {features.map((feat, i) => (
              <div
                key={feat.id}
                className="p-2 rounded bg-studio-900 border border-studio-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-medium text-slate-200">{feat.name}</div>
                  <div className="text-[10px] text-slate-400">{feat.type}</div>
                </div>
                <span className="text-[9px] bg-blue-950 text-blue-400 px-1.5 py-0.5 rounded border border-blue-900">
                  {feat.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
