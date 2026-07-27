/**
 * Scaffold DreamSpaceAI into a runnable Next.js app (local use).
 * Upstream repo ships loose source files without app/ layout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const ds = path.join(root, 'DreamSpaceAI');

if (!fs.existsSync(ds)) {
  console.error('DreamSpaceAI/ missing. Clone https://github.com/jevintanjh/DreamSpaceAI first.');
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function moveIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  ensureDir(path.dirname(to));
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
}

function write(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

// Layout source into Next.js folders
const moves = [
  ['floorPlanProcessor.ts', 'lib/floorPlanProcessor.ts'],
  ['3dConversionEngine.ts', 'lib/3dConversionEngine.ts'],
  ['testData.ts', 'lib/testData.ts'],
  ['textureLibrary.ts', 'lib/textureLibrary.ts'],
  ['Scene.tsx', 'components/3d/Scene.tsx'],
  ['FloorPlan3D.tsx', 'components/3d/FloorPlan3D.tsx'],
  ['CustomizationPanel.tsx', 'components/customization/CustomizationPanel.tsx'],
  ['UploadFloorPlan.tsx', 'components/upload/UploadFloorPlan.tsx'],
];

for (const [src, dest] of moves) {
  moveIfExists(path.join(ds, src), path.join(ds, dest));
}

// Root samples/ for DreamSpaceAI (and mirror into public/samples for Next static)
const samplesDir = path.join(ds, 'samples');
ensureDir(samplesDir);
const parentSamples = path.join(root, 'samples');
const sampleMap = [
  ['example1.png', 'sample_apartment.png'],
  ['example2.png', 'sample_house.png'],
  ['handDrawn.png', 'sample_office.png'],
];
for (const [from, to] of sampleMap) {
  const src = path.join(parentSamples, from);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(samplesDir, to));
  }
}

const publicSamples = path.join(ds, 'public', 'samples');
ensureDir(publicSamples);
for (const file of fs.readdirSync(samplesDir)) {
  if (file === 'README.md') continue;
  fs.copyFileSync(path.join(samplesDir, file), path.join(publicSamples, file));
}

write(
  path.join(samplesDir, 'README.md'),
  `# DreamSpaceAI samples (project root of DreamSpaceAI)

| File | Description |
|---|---|
| sample_apartment.png | Apartment layout |
| sample_house.png | House layout |
| sample_office.png | Office / hand-drawn style |

Synced into \`public/samples/\` for Next.js static serving.
Source: parent \`../samples/\` plan images.
`,
);

write(
  path.join(ds, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: false,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    },
    null,
    2,
  )}\n`,
);

write(
  path.join(ds, 'next.config.mjs'),
  `import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
`,
);

write(
  path.join(ds, 'next-env.d.ts'),
  `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
);

write(
  path.join(ds, 'postcss.config.mjs'),
  `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
`,
);

write(
  path.join(ds, 'app/globals.css'),
  `@import "tailwindcss";

:root {
  color-scheme: light;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #f3f4f6;
  color: #111827;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
}
`,
);

write(
  path.join(ds, 'app/layout.tsx'),
  `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DreamSpaceAI — 2D Floor Plan to 3D',
  description: 'Local DreamSpaceAI floor plan visualizer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
);

write(
  path.join(ds, 'components/HomeClient.tsx'),
  `'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Upload from '@/components/upload/UploadFloorPlan';
import CustomizationPanel from '@/components/customization/CustomizationPanel';
import { FloorPlanData } from '@/lib/floorPlanProcessor';
import { mockFloorPlanData } from '@/lib/testData';

const Scene = dynamic(() => import('@/components/3d/Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] items-center justify-center rounded-md bg-gray-100 text-sm text-gray-500">
      Loading 3D scene…
    </div>
  ),
});

const SAMPLES = [
  { name: 'Apartment', file: '/samples/sample_apartment.png' },
  { name: 'House', file: '/samples/sample_house.png' },
  { name: 'Office', file: '/samples/sample_office.png' },
];

function pastel() {
  return \`hsl(\${Math.floor(Math.random() * 360)}, 70%, 80%)\`;
}

export default function HomeClient() {
  const [floorPlanData, setFloorPlanData] = useState<FloorPlanData | null>(null);
  const [roomHeight, setRoomHeight] = useState(2.5);
  const [wallThickness, setWallThickness] = useState(0.15);
  const [lightIntensity, setLightIntensity] = useState(1);
  const [roomColors, setRoomColors] = useState<Record<string, string>>({});
  const [roomTextures, setRoomTextures] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');

  const applyData = (data: FloorPlanData) => {
    setFloorPlanData(data);
    const colors: Record<string, string> = {};
    const textures: Record<string, string> = {};
    data.rooms.forEach((room) => {
      colors[room.id] = pastel();
      textures[room.id] = '/textures/wood_floor_light.jpg';
    });
    setRoomColors(colors);
    setRoomTextures(textures);
  };

  const loadDemo = () => applyData(mockFloorPlanData as FloorPlanData);

  const loadSample = async (url: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { processFloorPlan } = await import('@/lib/floorPlanProcessor');
    const data = await processFloorPlan(dataUrl);
    applyData(data);
  };

  const hasScene = useMemo(() => Boolean(floorPlanData), [floorPlanData]);

  return (
    <main className="min-h-screen p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DreamSpaceAI</h1>
          <p className="text-sm text-gray-600">
            Local 2D floor plan → 3D visualizer (
            <a className="text-blue-600 underline" href="https://github.com/jevintanjh/DreamSpaceAI" target="_blank" rel="noreferrer">
              upstream
            </a>
            )
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white" onClick={loadDemo}>
            Demo data
          </button>
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              type="button"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
              onClick={() => loadSample(s.file)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </header>

      {!hasScene ? (
        <Upload onUpload={applyData} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={\`rounded px-3 py-1 text-sm \${viewMode === '2d' ? 'bg-blue-600 text-white' : 'bg-white border'}\`}
                onClick={() => setViewMode('2d')}
              >
                2D
              </button>
              <button
                type="button"
                className={\`rounded px-3 py-1 text-sm \${viewMode === '3d' ? 'bg-blue-600 text-white' : 'bg-white border'}\`}
                onClick={() => setViewMode('3d')}
              >
                3D
              </button>
              <button type="button" className="ml-auto text-sm text-blue-600" onClick={() => setFloorPlanData(null)}>
                New upload
              </button>
            </div>
            <Scene
              floorPlanData={floorPlanData!}
              height={roomHeight}
              wallThickness={wallThickness}
              roomColors={roomColors}
              roomTextures={roomTextures}
              lightIntensity={lightIntensity}
              viewMode={viewMode}
            />
          </section>
          <CustomizationPanel
            floorPlanData={floorPlanData!}
            roomHeight={roomHeight}
            onRoomHeightChange={setRoomHeight}
            roomColors={roomColors}
            onRoomColorsChange={setRoomColors}
            roomTextures={roomTextures}
            onRoomTexturesChange={setRoomTextures}
            wallThickness={wallThickness}
            onWallThicknessChange={setWallThickness}
            lightIntensity={lightIntensity}
            onLightIntensityChange={setLightIntensity}
          />
        </div>
      )}
    </main>
  );
}
`,
);

write(
  path.join(ds, 'app/page.tsx'),
  `import HomeClient from '@/components/HomeClient';

export default function HomePage() {
  return <HomeClient />;
}
`,
);

// Fix FloorPlanData typing for conversion enhancements
const processorPath = path.join(ds, 'lib/floorPlanProcessor.ts');
let processor = fs.readFileSync(processorPath, 'utf8');
if (!processor.includes('floorVertices?:')) {
  processor = processor.replace(
    'export interface Room {\n id: string;\n name: string;\n area: number;\n walls: Wall[];\n center: Point;\n}',
    `export interface Room {
 id: string;
 name: string;
 area: number;
 walls: Wall[];
 center: Point;
 floorVertices?: Point[];
 ceilingVertices?: Point[];
 height?: number;
 style?: unknown;
}`,
  );
  processor = processor.replace(
    'export interface Wall {\n start: Point;\n end: Point;\n thickness: number;\n hasOpening?: boolean;\n}',
    `export interface Wall {
 start: Point;
 end: Point;
 thickness: number;
 hasOpening?: boolean;
 height?: number;
 length?: number;
 angle?: number;
 opening?: unknown;
}`,
  );
  processor = processor.replace(
    'export interface FloorPlanData {\n dimensions: {\n width: number;\n height: number;\n };\n rooms: Room[];\n walls: Wall[];\n imageUrl: string;\n}',
    `export interface FloorPlanData {
 dimensions: {
 width: number;
 height: number;
 };
 rooms: Room[];
 walls: Wall[];
 imageUrl: string;
 metadata?: Record<string, unknown>;
}`,
  );
  processor = processor.replace(
    'export async function processFloorPlan(imageData: string): Promise {',
    'export async function processFloorPlan(imageData: string): Promise<FloorPlanData> {',
  );
  fs.writeFileSync(processorPath, processor);
}

// Make Scene offline-safe (Environment preset needs network)
const scenePath = path.join(ds, 'components/3d/Scene.tsx');
let scene = fs.readFileSync(scenePath, 'utf8');
scene = scene.replace(
  "import { OrbitControls, Environment, Text } from '@react-three/drei';",
  "import { OrbitControls, Text } from '@react-three/drei';",
);
scene = scene.replace(/\s*<Environment preset="city" \/>\s*/, '\n');
fs.writeFileSync(scenePath, scene);

// Remove unused router import
const uploadPath = path.join(ds, 'components/upload/UploadFloorPlan.tsx');
let upload = fs.readFileSync(uploadPath, 'utf8');
upload = upload.replace("import { useRouter } from 'next/navigation';\n", '');
fs.writeFileSync(uploadPath, upload);

write(
  path.join(ds, 'package.json'),
  `${JSON.stringify(
    {
      name: 'dreamspace-ai-local',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev --port 3000',
        build: 'next build',
        start: 'next start --port 3000',
        lint: 'next lint',
        setup: 'node ../scripts/setup-dreamspace.mjs',
      },
      dependencies: {
        next: '^15.0.0',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        three: '^0.160.0',
        '@react-three/fiber': '^8.17.10',
        '@react-three/drei': '^9.117.3',
      },
      devDependencies: {
        '@types/node': '^22.10.0',
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        '@types/three': '^0.160.0',
        typescript: '^5.7.2',
        tailwindcss: '^4.0.0',
        '@tailwindcss/postcss': '^4.0.0',
      },
    },
    null,
    2,
  )}\n`,
);

// Keep upstream page as test route
if (fs.existsSync(path.join(ds, 'page.tsx'))) {
  moveIfExists(path.join(ds, 'page.tsx'), path.join(ds, 'app/test/page.tsx'));
  let testPage = fs.readFileSync(path.join(ds, 'app/test/page.tsx'), 'utf8');
  testPage = testPage.replace("import Scene from '@/components/3d/Scene';", "import Scene from '@/components/3d/Scene';");
  // Fix broken generic useState if present
  testPage = testPage.replace(/useState \(/g, 'useState<any>(');
  fs.writeFileSync(path.join(ds, 'app/test/page.tsx'), testPage);
}

write(
  path.join(ds, 'README.local.md'),
  `# DreamSpaceAI (local)

Upstream: https://github.com/jevintanjh/DreamSpaceAI

## Run

From repo root:

\`\`\`bash
npm run dreamspace:setup
npm run dreamspace
\`\`\`

Open http://localhost:3000

Samples live in \`DreamSpaceAI/samples/\` (mirrored to \`public/samples/\`).
`,
);

console.log('DreamSpaceAI scaffolded for local use.');
