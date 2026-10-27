import React, { useState } from 'react';
import { Play, RotateCcw, Copy, Check, FileCode } from 'lucide-react';

interface OpenSCADModeProps {
  onRunCode: (code: string) => void;
}

const PRESET_CODES: Record<string, string> = {
  basic: `// Basic OpenSCAD Primitives
cube([2, 2, 2]);
translate([3, 0, 0]) sphere(r = 1.2);
translate([-3, 0, 0]) cylinder(h = 2.5, r = 1);
`,
  csgCut: `// CSG Boolean Cutout Example
cube([3, 3, 3]);
translate([0, 1.5, 0]) sphere(r = 1.8);
translate([0, 0, 3]) cylinder(h = 2, r = 0.8);
`,
  bracket: `// Mechanical Bracket CAD
cube([4, 1, 3]);
translate([0, 2, 0]) cube([4, 1, 1]);
translate([0, 0.5, 2.5]) cylinder(h = 2, r = 0.5);
`,
};

export const OpenSCADMode: React.FC<OpenSCADModeProps> = ({ onRunCode }) => {
  const [code, setCode] = useState<string>(PRESET_CODES.basic);
  const [copied, setCopied] = useState(false);

  const handleCompile = () => {
    onRunCode(code);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="w-96 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold text-slate-200">OpenSCAD Editor</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-studio-800 rounded text-slate-400 hover:text-slate-200"
            title="Copy Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleCompile}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium shadow-sm transition-all"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Compile (F5)</span>
          </button>
        </div>
      </div>

      {/* Preset selector */}
      <div className="px-3 py-2 border-b border-studio-800/60 bg-studio-950/40 flex items-center gap-2">
        <span className="text-[11px] text-slate-400">Presets:</span>
        <select
          onChange={(e) => {
            const val = PRESET_CODES[e.target.value];
            if (val) {
              setCode(val);
              onRunCode(val);
            }
          }}
          className="bg-studio-800 text-slate-200 text-xs rounded px-2 py-1 border border-studio-700/60 focus:outline-none focus:border-amber-500"
        >
          <option value="basic">Basic Primitives</option>
          <option value="csgCut">CSG Difference Cut</option>
          <option value="bracket">Mechanical Bracket</option>
        </select>
      </div>

      {/* Code Textarea */}
      <div className="flex-1 p-2 relative font-mono text-xs">
        <textarea
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            onRunCode(e.target.value);
          }}
          className="w-full h-full bg-studio-950 text-amber-200 p-3 rounded-lg border border-studio-800 focus:outline-none focus:border-amber-500/50 resize-none font-mono text-xs leading-relaxed"
          spellCheck={false}
          placeholder="// Type OpenSCAD code here...&#10;cube([2, 2, 2]);&#10;translate([3, 0, 0]) sphere(r=1);"
        />
      </div>

      {/* Syntax Quick Reference */}
      <div className="p-3 bg-studio-950/60 border-t border-studio-800 text-[11px] text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300">Quick Syntax:</div>
        <div><code className="text-amber-400">cube([x, y, z]);</code> - Box primitive</div>
        <div><code className="text-amber-400">sphere(r = radius);</code> - Sphere</div>
        <div><code className="text-amber-400">cylinder(h = 10, r = 2);</code> - Cylinder</div>
        <div><code className="text-amber-400">translate([x, y, z])</code> - Move</div>
      </div>
    </div>
  );
};
