import React, { useState } from 'react';
import { Box, Grid, Palette, Plus, Eye, Lock } from 'lucide-react';
import { VoxelBoxData } from '../../types';

interface BlockbenchModeProps {
  onAddBox: (name: string, from: [number, number, number], to: [number, number, number], color: string) => void;
}

export const BlockbenchMode: React.FC<BlockbenchModeProps> = ({ onAddBox }) => {
  const [selectedColor, setSelectedColor] = useState('#4ade80');
  const palette = [
    '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6',
    '#ffffff', '#94a3b8', '#334155', '#1e293b', '#78350f', '#b45309', '#15803d', '#1e40af'
  ];

  return (
    <div className="w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-semibold text-slate-200">Blockbench Box & UV</span>
        </div>
        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
          Low-Poly
        </span>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Quick Box Add */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Add Element / Bone</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onAddBox('Head', [-1, 1.5, -1], [1, 3.5, 1], selectedColor)}
              className="p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2"
            >
              <div className="w-3.5 h-3.5 bg-emerald-500 rounded-sm" />
              <span>Head (2x2x2)</span>
            </button>
            <button
              onClick={() => onAddBox('Torso', [-1, -0.5, -0.5], [1, 1.5, 0.5], selectedColor)}
              className="p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2"
            >
              <div className="w-3.5 h-3.5 bg-cyan-500 rounded-sm" />
              <span>Torso (2x2x1)</span>
            </button>
            <button
              onClick={() => onAddBox('Arm_L', [1.2, -0.5, -0.5], [1.8, 1.5, 0.5], selectedColor)}
              className="p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2"
            >
              <div className="w-3.5 h-3.5 bg-indigo-500 rounded-sm" />
              <span>Arm / Limb</span>
            </button>
            <button
              onClick={() => onAddBox('Weapon', [-0.2, 0, -2], [0.2, 0.5, 2], selectedColor)}
              className="p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2"
            >
              <div className="w-3.5 h-3.5 bg-amber-500 rounded-sm" />
              <span>Sword / Prop</span>
            </button>
          </div>
        </div>

        {/* Pixel Art Color Palette */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-emerald-400" />
              Pixel Palette (16-Color)
            </span>
            <div className="w-4 h-4 rounded border border-studio-600" style={{ backgroundColor: selectedColor }} />
          </label>
          <div className="grid grid-cols-6 gap-1.5 bg-studio-950 p-2.5 rounded-lg border border-studio-800">
            {palette.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                style={{ backgroundColor: c }}
                className={`w-full aspect-square rounded transition-transform ${
                  selectedColor === c ? 'scale-110 ring-2 ring-white shadow-lg' : 'hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>

        {/* UV Mapping Mode */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-emerald-400" />
              Texture Resolution
            </span>
            <span className="font-mono text-emerald-400">16 x 16 px</span>
          </div>
          <div className="flex gap-2">
            {['16x', '32x', '64x'].map((res) => (
              <button
                key={res}
                className="flex-1 py-1 text-xs bg-studio-800 hover:bg-studio-700 rounded text-slate-300 border border-studio-700/50"
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Blockbench Info */}
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-[11px] text-emerald-200/80 leading-relaxed">
          <strong>Blockbench Low-Poly:</strong>
          <p className="mt-1">
            Build game-ready box meshes with pixel-perfect UV mapping. Ideal for Minecraft mods, indie low-poly games, and retro 3D aesthetics.
          </p>
        </div>
      </div>
    </div>
  );
};
