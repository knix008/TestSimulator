import React, { useState } from 'react';
import { Droplet, Plus, Sparkles, Layers, Sliders } from 'lucide-react';
import { SdfNodeData } from '../../types';

interface WompModeProps {
  onAddSdfPrimitive: (type: 'sphere' | 'box' | 'torus', op: 'smooth-union' | 'subtract') => void;
}

export const WompMode: React.FC<WompModeProps> = ({ onAddSdfPrimitive }) => {
  const [smoothness, setSmoothness] = useState<number>(0.6);
  const [materialType, setMaterialType] = useState<string>('clay');

  return (
    <div className="w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Title */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <Droplet className="w-4 h-4 text-rose-500 fill-rose-500/20" />
          <span className="text-xs font-semibold text-slate-200">Womp Liquid Clay (SDF)</span>
        </div>
        <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-mono">
          Real-time
        </span>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Clay Add buttons */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Add Clay Shape</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onAddSdfPrimitive('sphere', 'smooth-union')}
              className="flex flex-col items-center justify-center p-2.5 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 transition-all group"
            >
              <div className="w-6 h-6 rounded-full bg-rose-500/30 group-hover:bg-rose-500/50 mb-1 flex items-center justify-center">
                <span className="text-[10px] text-rose-300">●</span>
              </div>
              <span>Blob</span>
            </button>
            <button
              onClick={() => onAddSdfPrimitive('box', 'smooth-union')}
              className="flex flex-col items-center justify-center p-2.5 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 transition-all group"
            >
              <div className="w-6 h-6 rounded bg-rose-500/30 group-hover:bg-rose-500/50 mb-1 flex items-center justify-center">
                <span className="text-[10px] text-rose-300">■</span>
              </div>
              <span>Clay Box</span>
            </button>
            <button
              onClick={() => onAddSdfPrimitive('torus', 'smooth-union')}
              className="flex flex-col items-center justify-center p-2.5 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 transition-all group"
            >
              <div className="w-6 h-6 rounded-full border-2 border-rose-500/50 mb-1 flex items-center justify-center">
                <span className="text-[8px] text-rose-300">○</span>
              </div>
              <span>Donut</span>
            </button>
          </div>
        </div>

        {/* Liquid Blending Slider */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-rose-400" />
              Liquid Smoothness (smin)
            </span>
            <span className="font-mono text-rose-400">{smoothness.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.5"
            step="0.05"
            value={smoothness}
            onChange={(e) => setSmoothness(parseFloat(e.target.value))}
            className="w-full accent-rose-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Sharp Edges (0.05)</span>
            <span>Liquid Melt (1.5)</span>
          </div>
        </div>

        {/* Carve Tool (Smooth Subtraction) */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Carve / Negative Clay</label>
          <button
            onClick={() => onAddSdfPrimitive('sphere', 'subtract')}
            className="w-full flex items-center justify-center gap-2 py-2 bg-studio-800 hover:bg-rose-950/40 border border-studio-700 hover:border-rose-500/40 rounded-lg text-xs text-rose-300 transition-all"
          >
            <Droplet className="w-3.5 h-3.5 rotate-180" />
            <span>Subtract / Carve Cavity</span>
          </button>
        </div>

        {/* Clay Material presets */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Clay Material</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'clay', name: 'Terracotta', color: '#e07a5f' },
              { id: 'ceramic', name: 'White Ceramic', color: '#f4f1de' },
              { id: 'slime', name: 'Toxic Slime', color: '#81b29a' },
              { id: 'gold', name: 'Liquid Gold', color: '#f2cc8f' },
            ].map((mat) => (
              <button
                key={mat.id}
                onClick={() => setMaterialType(mat.id)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                  materialType === mat.id
                    ? 'border-rose-500 bg-rose-500/10 text-white'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                <div className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: mat.color }} />
                <span>{mat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Explain info */}
        <div className="p-3 bg-rose-950/20 border border-rose-900/30 rounded-lg text-[11px] text-rose-200/80 leading-relaxed">
          <strong>Womp-style Modeling:</strong>
          <p className="mt-1">
            Shapes exist as mathematical distance fields (SDF). When two shapes get close, they smoothly melt and blend together automatically like real clay or liquid mercury!
          </p>
        </div>
      </div>
    </div>
  );
};
