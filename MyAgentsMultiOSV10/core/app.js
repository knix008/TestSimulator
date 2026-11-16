// The core: storage, services, the run engine and the scheduler (ARCHITECTURE.md §2). Used by
// server/desktop.js (the desktop app's local core) and server/web.js (the web server).
import path from 'node:path';
import os from 'node:os';
import { EventBus } from './events.js';
import { createStore } from './store.js';
import { createKnowledge } from './knowledge.js';
import { createMemory } from './memory.js';
import { createAgents, createCredentials, createSettings } from './services.js';
import { createEngine } from './engine.js';
import { createFileWatch, watchAgentRuns } from './triggers.js';
import { createOllama } from './ollama.js';
import { createScheduler } from './scheduler.js';
import { VERSION } from './version.js';
import { seedSamples } from './samples.js';

/**
 * @param {{ mode?: 'desktop' | 'web' | 'test', dataDir?: string | null, scheduler?: boolean, env?: object, mockDelay?: number }} opts
 */
export function createCore(opts = {}) {
  const mode = opts.mode ?? 'desktop';
  const dataDir = opts.dataDir === null ? null : path.resolve(opts.dataDir ?? path.join(os.homedir(), '.myagents'));
  const events = new EventBus();
  const store = createStore(dataDir);
  const settings = createSettings(store, { mode });
  const credentials = createCredentials(store, opts.env ?? process.env);
  const knowledge = createKnowledge(store, events);
  const memory = createMemory(store.memoryDir);
  const agents = createAgents(store, events);
  const core = { version: VERSION, mode, dataDir, events, store, settings, credentials, knowledge, memory, agents, mockDelay: opts.mockDelay };
  const workDir = () => settings.get().workDir || store.workDir || path.join(os.tmpdir(), 'myagents-work');
  core.nodeServices = {
    knowledge, memory, credentials, settings,
    workDir,
    allowShell: () => settings.get().allowShell !== false && mode !== 'web',
    get engine() { return core.engine; },
  };
  core.engine = createEngine(core);
  core.engine.recover();
  if (opts.samples !== false) seedSamples(core);
  core.fileWatch = createFileWatch(core);
  core.ollama = createOllama(core, { env: opts.env ?? process.env });
  core.scheduler = createScheduler(core);
  watchAgentRuns(core);
  if (opts.scheduler !== false && mode !== 'test') core.scheduler.start();
  core.close = async () => { core.scheduler.stop(); await core.engine.close(); };
  return core;
}
