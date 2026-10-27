import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Terminal, Cpu, Box } from 'lucide-react';

interface BottomBarProps {
  objectCount: number;
}

export const BottomBar: React.FC<BottomBarProps> = ({ objectCount }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  return (
    <footer className="h-10 bg-studio-950 border-t border-studio-800 flex items-center justify-between px-3 text-xs text-slate-400 select-none z-30">
      {/* Left: Animation Timeline Controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-studio-900 px-2 py-0.5 rounded border border-studio-800">
          <button
            onClick={() => setCurrentFrame(0)}
            className="p-1 hover:text-white"
            title="Start"
          >
            <SkipBack className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1 hover:text-white text-blue-400"
            title="Play / Pause"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
          </button>
          <button
            onClick={() => setCurrentFrame((f) => Math.min(120, f + 1))}
            className="p-1 hover:text-white"
            title="Step"
          >
            <SkipForward className="w-3 h-3" />
          </button>
          <span className="font-mono text-[11px] text-slate-300 ml-1">
            Frame: {currentFrame} / 120
          </span>
        </div>

        {/* Timeline track preview */}
        <div className="hidden md:flex items-center gap-1 bg-studio-900 h-5 px-2 rounded border border-studio-800/80 w-64">
          <div
            className="h-2 bg-blue-500 rounded-full transition-all"
            style={{ width: `${(currentFrame / 120) * 100}%` }}
          />
        </div>
      </div>

      {/* Center: Engine Status */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          <Box className="w-3 h-3 text-blue-400" />
          <span>Objects: <strong>{objectCount}</strong></span>
        </span>
        <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
          <Cpu className="w-3 h-3 text-emerald-400" />
          <span>Rust Kernel: <strong className="text-emerald-400">Active (v0.1)</strong></span>
        </span>
        <span className="text-[11px] text-slate-400">
          60 FPS (WebGPU Ready)
        </span>
      </div>

      {/* Right: Platform info */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
        <span>Tauri 2.0 / WASM</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      </div>
    </footer>
  );
};
