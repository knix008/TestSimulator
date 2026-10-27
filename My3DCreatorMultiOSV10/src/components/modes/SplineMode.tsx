import React, { useState } from 'react';
import { Play, Pause, Zap, Move3d, Compass, Code, Share2 } from 'lucide-react';

export const SplineMode: React.FC = () => {
  const [isPlayingPhysics, setIsPlayingPhysics] = useState(false);
  const [gravity, setGravity] = useState(9.8);
  const [bounciness, setBounciness] = useState(0.7);

  return (
    <div className="w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200">Spline Interactive 3D</span>
        </div>
        <button
          onClick={() => setIsPlayingPhysics(!isPlayingPhysics)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            isPlayingPhysics
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-studio-800 text-slate-300 hover:bg-studio-700'
          }`}
        >
          {isPlayingPhysics ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
          <span>{isPlayingPhysics ? 'Pause Sim' : 'Play Sim'}</span>
        </button>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Event Triggers */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Interactivity & Triggers</label>
          <div className="space-y-1.5">
            {[
              { event: 'Mouse Hover', action: 'Scale up 1.1x & glow' },
              { event: 'Mouse Click', action: 'Trigger jump impulse' },
              { event: 'Scroll Drag', action: 'Parallax camera tilt' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-studio-950 p-2.5 rounded-lg border border-studio-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-medium text-cyan-300">{item.event}</div>
                  <div className="text-[11px] text-slate-400">{item.action}</div>
                </div>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/40">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Physics Properties */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800 space-y-3">
          <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Move3d className="w-3.5 h-3.5 text-cyan-400" />
            <span>Rapier3D Physics Engine</span>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>World Gravity (m/s²)</span>
              <span className="font-mono text-cyan-400">{gravity}</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={gravity}
              onChange={(e) => setGravity(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>Restitution (Bounciness)</span>
              <span className="font-mono text-cyan-400">{bounciness}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bounciness}
              onChange={(e) => setBounciness(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Web Export Embed */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-2">Web Embed & Sharing</label>
          <div className="bg-studio-950 p-2.5 rounded-lg border border-studio-800 text-[11px] font-mono text-slate-400 overflow-x-auto">
            <code>&lt;omni-3d-viewer src="/scene.gltf" interactive /&gt;</code>
          </div>
        </div>
      </div>
    </div>
  );
};
