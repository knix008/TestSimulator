import React from 'react';
import {
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Unlock,
  Move,
  RotateCw,
  Maximize,
  Sliders,
  Palette,
  Layers,
} from 'lucide-react';
import { SceneObject, ShadingMode, TransformTool } from '../../types';

interface InspectorPanelProps {
  objects: SceneObject[];
  selectedObject: SceneObject | null;
  onSelectObject: (id: string | null) => void;
  onUpdateObject: (updated: SceneObject) => void;
  onDeleteObject: (id: string) => void;
  shading: ShadingMode;
  onChangeShading: (mode: ShadingMode) => void;
  tool: TransformTool;
  onChangeTool: (tool: TransformTool) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  objects,
  selectedObject,
  onSelectObject,
  onUpdateObject,
  onDeleteObject,
  shading,
  onChangeShading,
  tool,
  onChangeTool,
}) => {
  return (
    <aside className="w-72 bg-studio-900 border-l border-studio-800 flex flex-col h-full z-20 select-none">
      {/* Viewport Display Controls (Shading & Tools) */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-1 bg-studio-950 p-1 rounded-lg border border-studio-800">
          {(['solid', 'wireframe', 'rendered'] as ShadingMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onChangeShading(m)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-all ${
                shading === m ? 'bg-studio-800 text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-studio-950 p-1 rounded-lg border border-studio-800">
          {(['select', 'translate', 'rotate', 'scale'] as TransformTool[]).map((t) => (
            <button
              key={t}
              onClick={() => onChangeTool(t)}
              className={`p-1 rounded text-slate-400 hover:text-slate-200 transition-all ${
                tool === t ? 'bg-studio-800 text-blue-400 shadow-sm' : ''
              }`}
              title={t.toUpperCase()}
            >
              {t === 'translate' && <Move className="w-3.5 h-3.5" />}
              {t === 'rotate' && <RotateCw className="w-3.5 h-3.5" />}
              {t === 'scale' && <Maximize className="w-3.5 h-3.5" />}
              {t === 'select' && <Sliders className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 1. Scene Outliner (Hierarchy) */}
        <div className="flex-1 min-h-[160px] border-b border-studio-800/80 flex flex-col">
          <div className="px-3 py-2 text-xs font-semibold text-slate-300 flex items-center justify-between bg-studio-950/40">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Scene Outliner
            </span>
            <span className="text-[10px] text-slate-500 font-mono">({objects.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {objects.map((obj) => {
              const isSelected = selectedObject?.id === obj.id;
              return (
                <div
                  key={obj.id}
                  onClick={() => onSelectObject(obj.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/40 text-blue-200 font-medium'
                      : 'hover:bg-studio-800/80 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: obj.color }}
                    />
                    <span className="truncate">{obj.name}</span>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onUpdateObject({ ...obj, visible: !obj.visible })}
                      className="p-1 hover:bg-studio-700/60 rounded text-slate-400 hover:text-slate-200"
                    >
                      {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                    </button>
                    <button
                      onClick={() => onDeleteObject(obj.id)}
                      className="p-1 hover:bg-rose-950/40 rounded text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Transform & Material Inspector */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {selectedObject ? (
            <>
              {/* Transform Block */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">Transform</label>
                <div className="space-y-2 bg-studio-950 p-2.5 rounded-lg border border-studio-800 text-xs">
                  {/* Position */}
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Position (X, Y, Z)</span>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="flex items-center bg-studio-900 rounded border border-studio-800 px-1.5">
                          <span className="text-[10px] text-slate-500 font-mono mr-1">{axis}</span>
                          <input
                            type="number"
                            step="0.1"
                            value={selectedObject.position[i]}
                            onChange={(e) => {
                              const pos = [...selectedObject.position] as [number, number, number];
                              pos[i] = parseFloat(e.target.value) || 0;
                              onUpdateObject({ ...selectedObject, position: pos });
                            }}
                            className="w-full bg-transparent text-slate-200 text-xs py-0.5 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scale */}
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Scale (X, Y, Z)</span>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="flex items-center bg-studio-900 rounded border border-studio-800 px-1.5">
                          <span className="text-[10px] text-slate-500 font-mono mr-1">{axis}</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.01"
                            value={selectedObject.scale[i]}
                            onChange={(e) => {
                              const sc = [...selectedObject.scale] as [number, number, number];
                              sc[i] = parseFloat(e.target.value) || 0.1;
                              onUpdateObject({ ...selectedObject, scale: sc });
                            }}
                            className="w-full bg-transparent text-slate-200 text-xs py-0.5 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Material Block */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-blue-400" />
                  PBR Material
                </label>
                <div className="bg-studio-950 p-2.5 rounded-lg border border-studio-800 space-y-2.5 text-xs">
                  {/* Color */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Base Color</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedObject.color}
                        onChange={(e) => onUpdateObject({ ...selectedObject, color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                      />
                      <span className="font-mono text-slate-300 text-[11px]">{selectedObject.color}</span>
                    </div>
                  </div>

                  {/* Roughness */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Roughness</span>
                      <span className="font-mono text-slate-300">{selectedObject.roughness.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedObject.roughness}
                      onChange={(e) =>
                        onUpdateObject({ ...selectedObject, roughness: parseFloat(e.target.value) })
                      }
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>

                  {/* Metalness */}
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Metalness</span>
                      <span className="font-mono text-slate-300">{selectedObject.metalness.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedObject.metalness}
                      onChange={(e) =>
                        onUpdateObject({ ...selectedObject, metalness: parseFloat(e.target.value) })
                      }
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs">
              <Sliders className="w-8 h-8 mb-2 stroke-1 opacity-50" />
              <p>Select an object in the 3D viewport or outliner to view its properties.</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
