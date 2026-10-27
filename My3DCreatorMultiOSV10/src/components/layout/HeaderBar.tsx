import React from 'react';
import {
  Box,
  Layers,
  Sparkles,
  Code2,
  Cpu,
  Droplet,
  Play,
  Download,
  FolderOpen,
  Save,
  Monitor,
  Globe,
  Settings,
  Share2,
} from 'lucide-react';
import { StudioMode } from '../../types';

interface HeaderBarProps {
  currentMode: StudioMode;
  onSelectMode: (mode: StudioMode) => void;
  onExport: (format: string) => void;
  onAddPrimitive: (type: 'cube' | 'sphere' | 'cylinder' | 'torus') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentMode,
  onSelectMode,
  onExport,
  onAddPrimitive,
}) => {
  const modes: { id: StudioMode; label: string; icon: React.ReactNode; badge: string; desc: string }[] = [
    { id: 'mesh', label: 'Mesh & Sculpt', icon: <Layers className="w-4 h-4" />, badge: 'Blender', desc: 'Polygon modeling, sculpting & nodes' },
    { id: 'interactive', label: 'Interactive 3D', icon: <Play className="w-4 h-4" />, badge: 'Spline', desc: 'Physics, events & triggers' },
    { id: 'voxel', label: 'Box & Voxel', icon: <Box className="w-4 h-4" />, badge: 'Blockbench', desc: 'Cube hierarchy & pixel textures' },
    { id: 'cad', label: 'Parametric CAD', icon: <Cpu className="w-4 h-4" />, badge: 'FreeCAD', desc: '2D sketch & parametric features' },
    { id: 'scad', label: 'Code CAD', icon: <Code2 className="w-4 h-4" />, badge: 'OpenSCAD', desc: 'Script-driven CSG solid modeling' },
    { id: 'sdf', label: 'Liquid Clay', icon: <Droplet className="w-4 h-4" />, badge: 'Womp', desc: 'Real-time soft SDF boolean modeling' },
    { id: 'ai', label: 'AI Generator', icon: <Sparkles className="w-4 h-4" />, badge: 'Meshy', desc: 'Text-to-3D & AI texture synthesis' },
  ];

  return (
    <header className="h-14 bg-studio-900 border-b border-studio-800 flex items-center justify-between px-3 z-30 select-none">
      {/* Brand & File Actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-studio-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Box className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              Omni3D
            </span>
            <span className="text-[10px] text-slate-400 block leading-none font-mono">
              STUDIO v0.1
            </span>
          </div>
        </div>

        {/* Quick Primitive Add Menu */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => onAddPrimitive('cube')}
            className="px-2.5 py-1 text-xs rounded hover:bg-studio-800 text-slate-300 transition-colors flex items-center gap-1"
            title="Add Cube"
          >
            + Cube
          </button>
          <button
            onClick={() => onAddPrimitive('sphere')}
            className="px-2.5 py-1 text-xs rounded hover:bg-studio-800 text-slate-300 transition-colors flex items-center gap-1"
            title="Add Sphere"
          >
            + Sphere
          </button>
          <button
            onClick={() => onAddPrimitive('cylinder')}
            className="px-2.5 py-1 text-xs rounded hover:bg-studio-800 text-slate-300 transition-colors flex items-center gap-1"
            title="Add Cylinder"
          >
            + Cylinder
          </button>
        </div>
      </div>

      {/* Center: Mode Switcher */}
      <div className="flex items-center bg-studio-950/80 p-1 rounded-xl border border-studio-800/80 max-w-2xl overflow-x-auto scrollbar-none">
        {modes.map((m) => {
          const isActive = currentMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelectMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-studio-800 text-blue-400 shadow-sm border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-studio-900/60'
              }`}
              title={m.desc}
            >
              {m.icon}
              <span>{m.label}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-studio-800 text-slate-500'
                }`}
              >
                {m.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: Export & Platform Actions */}
      <div className="flex items-center gap-2">
        {/* Export Dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/20 transition-all">
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <div className="absolute right-0 mt-1 w-44 bg-studio-900 border border-studio-700/60 rounded-xl shadow-2xl py-1 hidden group-hover:block z-50">
            <button
              onClick={() => onExport('gltf')}
              className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between"
            >
              <span>GLTF / GLB</span>
              <span className="text-[10px] text-slate-500 font-mono">Web / Game</span>
            </button>
            <button
              onClick={() => onExport('obj')}
              className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between"
            >
              <span>Wavefront OBJ</span>
              <span className="text-[10px] text-slate-500 font-mono">Blender</span>
            </button>
            <button
              onClick={() => onExport('stl')}
              className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between"
            >
              <span>STL</span>
              <span className="text-[10px] text-slate-500 font-mono">3D Print</span>
            </button>
            <button
              onClick={() => onExport('scad')}
              className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between"
            >
              <span>OpenSCAD (.scad)</span>
              <span className="text-[10px] text-slate-500 font-mono">CAD Code</span>
            </button>
          </div>
        </div>

        {/* Multiplatform Badge */}
        <div className="flex items-center gap-1 bg-studio-800/80 px-2 py-1 rounded-md text-[11px] text-slate-400 border border-studio-700/40">
          <Globe className="w-3.5 h-3.5 text-cyan-400" />
          <Monitor className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono text-[10px]">Win/Mac/Linux/Web</span>
        </div>
      </div>
    </header>
  );
};
