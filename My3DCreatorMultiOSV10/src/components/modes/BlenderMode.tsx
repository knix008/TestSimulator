import React, { useState } from 'react';
import { Layers, Scissors, Maximize2, Minimize2, CircleDot, Disc, Square } from 'lucide-react';

interface BlenderModeProps {
  onSubdivide: () => void;
  onExtrude: () => void;
}

export const BlenderMode: React.FC<BlenderModeProps> = ({ onSubdivide, onExtrude }) => {
  const [selectMode, setSelectMode] = useState<'vertex' | 'edge' | 'face'>('face');
  const [activeBrush, setActiveBrush] = useState<string>('grab');

  const brushes = [
    { id: 'grab', name: 'Grab / Move', icon: '✋' },
    { id: 'smooth', name: 'Smooth Relax', icon: '🌊' },
    { id: 'inflate', name: 'Inflate', icon: '🎈' },
    { id: 'flatten', name: 'Flatten', icon: '📏' },
    { id: 'crease', name: 'Crease Sharp', icon: '⚡' },
    { id: 'pinch', name: 'Pinch Pull', icon: '🤏' },
  ];

  return (
    <div className="w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-semibold text-slate-200">Blender Mesh & Sculpt</span>
        </div>
        <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-mono">
          B-Mesh
        </span>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Selection Modes */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Edit Mode Element</label>
          <div className="grid grid-cols-3 gap-2 bg-studio-950 p-1 rounded-lg border border-studio-800">
            <button
              onClick={() => setSelectMode('vertex')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-all ${
                selectMode === 'vertex' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" />
              <span>Vertex</span>
            </button>
            <button
              onClick={() => setSelectMode('edge')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-all ${
                selectMode === 'edge' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Edge</span>
            </button>
            <button
              onClick={() => setSelectMode('face')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-all ${
                selectMode === 'face' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span>Face</span>
            </button>
          </div>
        </div>

        {/* Modeling Operations */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Mesh Operations</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExtrude}
              className="p-2 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 flex items-center gap-2"
            >
              <Maximize2 className="w-3.5 h-3.5 text-orange-400" />
              <span>Extrude (E)</span>
            </button>
            <button
              onClick={onSubdivide}
              className="p-2 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 flex items-center gap-2"
            >
              <Scissors className="w-3.5 h-3.5 text-orange-400" />
              <span>Subdivide</span>
            </button>
          </div>
        </div>

        {/* Sculpt Brushes */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Sculpting Brushes</label>
          <div className="grid grid-cols-2 gap-2">
            {brushes.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBrush(b.id)}
                className={`p-2.5 rounded-lg border text-xs text-left flex items-center gap-2 transition-all ${
                  activeBrush === b.id
                    ? 'border-orange-500 bg-orange-500/15 text-orange-200 font-medium'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                <span className="text-base">{b.icon}</span>
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Brush Settings */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800 space-y-2">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Brush Radius</span>
            <span className="font-mono text-orange-400">45 px</span>
          </div>
          <input type="range" min="10" max="150" defaultValue="45" className="w-full accent-orange-500 cursor-pointer" />

          <div className="flex justify-between text-xs text-slate-300 pt-1">
            <span>Brush Strength</span>
            <span className="font-mono text-orange-400">0.50</span>
          </div>
          <input type="range" min="0.05" max="1.0" step="0.05" defaultValue="0.5" className="w-full accent-orange-500 cursor-pointer" />
        </div>
      </div>
    </div>
  );
};
