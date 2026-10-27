import React, { useState } from 'react';
import { Sparkles, Wand2, Image as ImageIcon, Cpu, Loader2, CheckCircle2 } from 'lucide-react';
import { SceneObject } from '../../types';

interface MeshyModeProps {
  onGenerateAiModel: (prompt: string, style: string) => void;
}

export const MeshyMode: React.FC<MeshyModeProps> = ({ onGenerateAiModel }) => {
  const [prompt, setPrompt] = useState('Cyberpunk sci-fi energy reactor core with glowing rings');
  const [style, setStyle] = useState('stylized');
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      onGenerateAiModel(prompt, style);
      setIsGenerating(false);
    }, 1800);
  };

  return (
    <div className="w-84 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20">
      {/* Header */}
      <div className="h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-slate-200">Meshy AI 3D Studio</span>
        </div>
        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">
          AI Gen
        </span>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Prompt Input */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-purple-400" />
            Prompt (Text-to-3D)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-studio-950 text-slate-200 text-xs p-2.5 rounded-lg border border-studio-800 focus:outline-none focus:border-purple-500/60 resize-none"
            placeholder="Describe the 3D model you want to generate..."
          />
        </div>

        {/* Style Selection */}
        <div>
          <label className="text-xs font-medium text-slate-300 block mb-1.5">Art Style</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'realistic', label: 'Realistic PBR' },
              { id: 'stylized', label: 'Cartoon Stylized' },
              { id: 'lowpoly', label: 'Low-Poly / Game' },
              { id: 'sculpt', label: 'Clay Sculpt' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`py-2 px-2.5 rounded-lg border text-xs text-left transition-all ${
                  style === s.id
                    ? 'border-purple-500 bg-purple-500/15 text-purple-200 font-medium'
                    : 'border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating 3D Neural Mesh...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate 3D Model</span>
            </>
          )}
        </button>

        {/* API Settings */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-purple-400" />
              API Provider
            </span>
            <span className="text-purple-400 font-mono">Meshy / Tripo3D</span>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API Key (Optional for preview)..."
            className="w-full bg-studio-900 text-slate-300 text-xs px-2.5 py-1.5 rounded border border-studio-800 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Info Box */}
        <div className="p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg text-[11px] text-purple-200/80 leading-relaxed">
          <strong>AI 3D Synthesis:</strong>
          <p className="mt-1">
            Generate complex organic meshes, quad-topology game characters, and 4K PBR texture maps using generative AI diffusion models.
          </p>
        </div>
      </div>
    </div>
  );
};
