// Remote control: the WebSocket remote-control protocol, version 5 (what Stream Deck, Touch Portal, Streamer.bot and the
// like speak). The desktop app listens on a local port (src-tauri/src/remote.rs carries the text frames);
// this module answers them. Op codes: 0 Hello · 1 Identify · 2 Identified · 3 Reidentify · 5 Event ·
// 6 Request · 7 RequestResponse · 8 RequestBatch · 9 RequestBatchResponse. Authentication as the
// protocol says: base64(sha256(base64(sha256(password + salt)) + challenge)).
import { WIRE } from '../bc/compat/wire.js';
import * as M from '../bc/model.js';
import { mulToDb } from '../bc/engine/audio.js';

export const RPC_VERSION = 1;
const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const sha256 = async (text) => crypto.subtle.digest('SHA-256', enc.encode(text));
export async function authString(password, salt, challenge) {
  const secret = b64(await sha256(password + salt));
  return b64(await sha256(secret + challenge));
}
const random = () => b64(crypto.getRandomValues(new Uint8Array(24)));

/** Status codes of the protocol used here. */
const OK = 100; const MISSING = 300; const INVALID = 400; const NOT_FOUND = 600; const FAILED = 702; const UNKNOWN = 204; const NOT_READY = 207;

export class RemoteControl {
  constructor(studio, { send, run, version = '1.0.0', password = '', auth = true }) {
    this.studio = studio;
    this.send = send; // (connection id, text) → void
    this.run = run; // app commands (startStream, toggleStudio …): may ask nothing (remote = confirmed)
    this.version = version;
    this.password = password;
    this.auth = auth && Boolean(password);
    this.clients = new Map();
    this.off = [
      studio.on('program', (id) => this.event('CurrentProgramSceneChanged', { sceneName: M.sceneById(studio.c, id)?.name, sceneUuid: id }, 4)),
      studio.on('preview', (id) => this.event('CurrentPreviewSceneChanged', { sceneName: M.sceneById(studio.c, id)?.name, sceneUuid: id }, 4)),
      studio.on('studio', (on) => this.event('StudioModeStateChanged', { studioModeEnabled: on }, 1024)),
      studio.on('outputs', () => this.outputEvents()),
    ];
    this.last = { stream: false, record: false, replay: false };
  }

  dispose() { this.off.forEach((f) => f()); }

  /** A new connection: the server says Hello (with a challenge when a password is set). */
  async open(id) {
    const c = { identified: false, subs: 0x7ff };
    if (this.auth) { c.salt = random(); c.challenge = random(); }
    this.clients.set(id, c);
    this.reply(id, 0, { [WIRE.protocolVersionKey]: '5.5.0', rpcVersion: RPC_VERSION, ...(this.auth ? { authentication: { challenge: c.challenge, salt: c.salt } } : {}), mybroadcasting: this.version });
  }
  close(id) { this.clients.delete(id); }
  reply(id, op, d) { this.send(id, JSON.stringify({ op, d })); }

  async message(id, text) {
    const c = this.clients.get(id);
    if (!c) return;
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    const { op, d = {} } = msg;
    if (op === 1) {
      if (this.auth && d.authentication !== await authString(this.password, c.salt, c.challenge)) { this.send(id, JSON.stringify({ op: -1, close: 4009 })); return; }
      c.identified = true;
      c.subs = d.eventSubscriptions ?? 0x7ff;
      this.reply(id, 2, { negotiatedRpcVersion: RPC_VERSION });
      return;
    }
    if (!c.identified) { this.send(id, JSON.stringify({ op: -1, close: 4007 })); return; }
    if (op === 3) { c.subs = d.eventSubscriptions ?? c.subs; this.reply(id, 2, { negotiatedRpcVersion: RPC_VERSION }); return; }
    if (op === 6) { this.reply(id, 7, await this.request(d)); return; }
    if (op === 8) {
      const results = [];
      for (const r of d.requests ?? []) { const out = await this.request(r); results.push(out); if (d.haltOnFailure && !out.requestStatus.result) break; }
      this.reply(id, 9, { requestId: d.requestId, results });
    }
  }

  event(type, data, intent = 0x7ff) {
    for (const [id, c] of this.clients) if (c.identified && (c.subs & intent)) this.reply(id, 5, { eventType: type, eventIntent: intent, eventData: data });
  }
  outputEvents() {
    const o = this.studio.outputs;
    const now = { stream: Boolean(o.stream), record: Boolean(o.recording), replay: Boolean(o.replay) };
    if (now.stream !== this.last.stream) this.event('StreamStateChanged', { outputActive: now.stream, outputState: now.stream ? WIRE.outputStarted : WIRE.outputStopped }, 64);
    if (now.record !== this.last.record) this.event('RecordStateChanged', { outputActive: now.record, outputState: now.record ? WIRE.outputStarted : WIRE.outputStopped, outputPath: this.studio.lastRecording?.path ?? null }, 64);
    if (now.replay !== this.last.replay) this.event('ReplayBufferStateChanged', { outputActive: now.replay }, 64);
    this.last = now;
  }

  /** One request → { requestType, requestId, requestStatus, responseData }. */
  async request({ requestType, requestId, requestData = {} }) {
    const ok = (responseData) => ({ requestType, requestId, requestStatus: { result: true, code: OK }, ...(responseData ? { responseData } : {}) });
    const fail = (code, comment) => ({ requestType, requestId, requestStatus: { result: false, code, comment } });
    const s = this.studio;
    const c = s.c;
    const sceneOf = () => {
      const scene = c.scenes.find((x) => x.name === requestData.sceneName || x.id === requestData.sceneUuid);
      return scene ?? null;
    };
    const inputOf = () => Object.values(c.sources).find((x) => x.name === requestData.inputName || x.id === requestData.inputUuid) ?? null;
    try {
      switch (requestType) {
        case 'GetVersion': return ok({ [WIRE.hostVersionKey]: '31.0.0', [WIRE.protocolVersionKey]: '5.5.0', rpcVersion: RPC_VERSION, platform: 'mybroadcasting', platformDescription: `MyBroadcasting ${this.version}`, availableRequests: REQUESTS, supportedImageFormats: ['png', 'jpg', 'webp'] });
        case 'GetStats': { const st = s.stats(); return ok({ activeFps: st.fps, averageFrameRenderTime: st.renderMs, renderSkippedFrames: st.lagged, renderTotalFrames: st.frames, outputSkippedFrames: st.skipped, outputTotalFrames: st.encoded + st.skipped, cpuUsage: null, memoryUsage: null }); }
        case 'GetSceneList': return ok({ currentProgramSceneName: M.sceneById(c, c.current)?.name, currentProgramSceneUuid: c.current, currentPreviewSceneName: s.studioMode ? M.sceneById(c, c.preview)?.name : null, currentPreviewSceneUuid: s.studioMode ? c.preview : null, scenes: c.scenes.map((x, i) => ({ sceneIndex: c.scenes.length - 1 - i, sceneName: x.name, sceneUuid: x.id })).reverse() });
        case 'GetCurrentProgramScene': return ok({ sceneName: M.sceneById(c, c.current)?.name, sceneUuid: c.current, currentProgramSceneName: M.sceneById(c, c.current)?.name });
        case 'SetCurrentProgramScene': { const sc = sceneOf(); if (!sc) return fail(NOT_FOUND, 'scene not found'); s.transitionTo(sc.id); return ok(); }
        case 'GetCurrentPreviewScene': if (!s.studioMode) return fail(506, 'studio mode is off'); return ok({ sceneName: M.sceneById(c, c.preview)?.name, sceneUuid: c.preview, currentPreviewSceneName: M.sceneById(c, c.preview)?.name });
        case 'SetCurrentPreviewScene': { if (!s.studioMode) return fail(506, 'studio mode is off'); const sc = sceneOf(); if (!sc) return fail(NOT_FOUND, 'scene not found'); s.selectScene(sc.id); return ok(); }
        case 'CreateScene': { if (!requestData.sceneName) return fail(MISSING, 'sceneName'); if (M.nameTaken(c, requestData.sceneName)) return fail(601, 'name taken'); const sc = s.addScene(requestData.sceneName); return ok({ sceneUuid: sc.id }); }
        case 'RemoveScene': { const sc = sceneOf(); if (!sc) return fail(NOT_FOUND, 'scene not found'); return s.removeScene(sc.id) ? ok() : fail(FAILED, 'last scene'); }
        case 'GetStudioModeEnabled': return ok({ studioModeEnabled: s.studioMode });
        case 'SetStudioModeEnabled': await this.run(requestData.studioModeEnabled ? 'studioOn' : 'studioOff'); return ok();
        case 'TriggerStudioModeTransition': if (!s.studioMode) return fail(506, 'studio mode is off'); s.studioTransition(); return ok();
        case 'GetSceneItemList': { const sc = sceneOf(); if (!sc) return fail(NOT_FOUND, 'scene not found'); return ok({ sceneItems: sc.items.map((it, i) => ({ sceneItemId: i + 1, sceneItemIndex: i, sourceName: c.sources[it.source]?.name ?? M.sceneById(c, it.source)?.name, sourceUuid: it.source, sceneItemEnabled: it.visible, sceneItemLocked: it.locked, isGroup: Boolean(it.children), inputKind: c.sources[it.source]?.type ?? null, sourceType: M.sceneById(c, it.source) ? WIRE.sourceTypeScene : WIRE.sourceTypeInput })) }); }
        case 'GetSceneItemId': { const sc = sceneOf(); const i = sc?.items.findIndex((it) => (c.sources[it.source]?.name ?? M.sceneById(c, it.source)?.name) === requestData.sourceName) ?? -1; return i < 0 ? fail(NOT_FOUND, 'item not found') : ok({ sceneItemId: i + 1 }); }
        case 'GetSceneItemEnabled': case 'SetSceneItemEnabled': case 'SetSceneItemLocked': {
          const sc = sceneOf(); const it = sc?.items[(requestData.sceneItemId ?? 0) - 1];
          if (!it) return fail(NOT_FOUND, 'item not found');
          if (requestType === 'GetSceneItemEnabled') return ok({ sceneItemEnabled: it.visible });
          if (requestType === 'SetSceneItemLocked') { s.change('lockItem', () => { it.locked = Boolean(requestData.sceneItemLocked); }); return ok(); }
          s.toggleVisible(it.id, Boolean(requestData.sceneItemEnabled), sc.id);
          return ok();
        }
        case 'GetInputList': return ok({ inputs: Object.values(c.sources).filter((x) => x.type !== 'group').map((x) => ({ inputName: x.name, inputUuid: x.id, inputKind: x.type, unversionedInputKind: x.type.replace(/_v\d$/, '') })) });
        case 'GetInputSettings': { const i = inputOf(); return i ? ok({ inputSettings: i.settings, inputKind: i.type }) : fail(NOT_FOUND, 'input not found'); }
        case 'SetInputSettings': { const i = inputOf(); if (!i) return fail(NOT_FOUND, 'input not found'); s.updateSettings(i.id, requestData.inputSettings ?? {}); return ok(); }
        case 'GetInputMute': { const i = inputOf(); return i?.audio ? ok({ inputMuted: i.audio.muted }) : fail(NOT_FOUND, 'input not found'); }
        case 'SetInputMute': case 'ToggleInputMute': { const i = inputOf(); if (!i?.audio) return fail(NOT_FOUND, 'input not found'); const muted = requestType === 'ToggleInputMute' ? !i.audio.muted : Boolean(requestData.inputMuted); s.setAudio(i.id, { muted }); s.emit('changed', { label: 'mute' }); this.event('InputMuteStateChanged', { inputName: i.name, inputUuid: i.id, inputMuted: muted }, 8); return ok(requestType === 'ToggleInputMute' ? { inputMuted: muted } : null); }
        case 'GetInputVolume': { const i = inputOf(); return i?.audio ? ok({ inputVolumeMul: i.audio.volume, inputVolumeDb: i.audio.volume > 0 ? mulToDb(i.audio.volume) : -100 }) : fail(NOT_FOUND, 'input not found'); }
        case 'SetInputVolume': { const i = inputOf(); if (!i?.audio) return fail(NOT_FOUND, 'input not found'); const mul = requestData.inputVolumeMul ?? (requestData.inputVolumeDb != null ? 10 ** (requestData.inputVolumeDb / 20) : null); if (mul == null) return fail(MISSING, 'inputVolumeMul or inputVolumeDb'); s.setAudio(i.id, { volume: Math.max(0, Math.min(20, mul)) }); s.emit('changed', { label: 'volume' }); return ok(); }
        case 'TriggerMediaInputAction': { const i = inputOf(); if (!i) return fail(NOT_FOUND, 'input not found'); const a = String(requestData.mediaAction ?? '').replace(WIRE.mediaActionPrefix, '').toLowerCase(); s.engine.runtime(i.id)?.control(a); return ok(); }
        case 'GetTransitionKindList': return ok({ transitionKinds: c.transitions.map((x) => x.type) });
        case 'GetSceneTransitionList': return ok({ currentSceneTransitionName: M.transitionById(c, c.transition)?.name, currentSceneTransitionKind: M.transitionById(c, c.transition)?.type, transitions: c.transitions.map((x) => ({ transitionName: x.name, transitionUuid: x.id, transitionKind: x.type, transitionFixed: x.type === 'cut_transition', transitionConfigurable: x.type !== 'cut_transition' })) });
        case 'SetCurrentSceneTransition': { const tr = c.transitions.find((x) => x.name === requestData.transitionName); if (!tr) return fail(NOT_FOUND, 'transition not found'); s.setTransition(tr.id); return ok(); }
        case 'SetCurrentSceneTransitionDuration': s.setDuration(Number(requestData.transitionDuration) || c.duration); return ok();
        case 'GetStreamStatus': { const st = s.stats().stream; return ok({ outputActive: Boolean(st), outputReconnecting: st?.state === 'reconnecting', outputDuration: Math.round((st?.seconds ?? 0) * 1000), outputBytes: st?.bytes ?? 0, outputSkippedFrames: st?.dropped ?? 0 }); }
        case 'StartStream': case 'StopStream': case 'ToggleStream': {
          const live = Boolean(s.outputs.stream);
          if ((requestType === 'StartStream' && live) || (requestType === 'StopStream' && !live)) return fail(500, live ? 'already live' : 'not live');
          await this.run(live ? 'stopStream' : 'startStream', { confirmed: true });
          return ok(requestType === 'ToggleStream' ? { outputActive: !live } : null);
        }
        case 'GetRecordStatus': { const r = s.stats().recording; return ok({ outputActive: Boolean(r), outputPaused: Boolean(r?.paused), outputDuration: Math.round((r?.seconds ?? 0) * 1000), outputBytes: r?.bytes ?? 0 }); }
        case 'StartRecord': case 'StopRecord': case 'ToggleRecord': {
          const live = Boolean(s.outputs.recording);
          if ((requestType === 'StartRecord' && live) || (requestType === 'StopRecord' && !live)) return fail(500, live ? 'already recording' : 'not recording');
          await this.run(live ? 'stopRecording' : 'startRecording', { confirmed: true });
          return ok(requestType === 'StopRecord' ? { outputPath: s.lastRecording?.path ?? null } : requestType === 'ToggleRecord' ? { outputActive: !live } : null);
        }
        case 'PauseRecord': return s.pauseRecording() ? ok() : fail(501, 'not recording');
        case 'ResumeRecord': return s.resumeRecording() ? ok() : fail(501, 'not paused');
        case 'ToggleRecordPause': return (s.outputs.recording?.paused ? s.resumeRecording() : s.pauseRecording()) ? ok() : fail(501, 'not recording');
        case 'SplitRecordFile': if (!s.outputs.recording) return fail(501, 'not recording'); s.splitRecording(); return ok();
        case 'CreateRecordChapter': return s.addChapter(requestData.chapterName) ? ok() : fail(501, 'not recording');
        case 'GetReplayBufferStatus': return ok({ outputActive: Boolean(s.outputs.replay) });
        case 'StartReplayBuffer': case 'StopReplayBuffer': case 'ToggleReplayBuffer': await this.run(s.outputs.replay ? 'stopReplay' : 'startReplay'); return ok();
        case 'SaveReplayBuffer': if (!s.outputs.replay) return fail(501, 'replay buffer off'); await s.saveReplay(); return ok();
        case 'GetVirtualCamStatus': return ok({ outputActive: s.outputs.vcam });
        case 'StartVirtualCam': case 'StopVirtualCam': case 'ToggleVirtualCam': await this.run('toggleVirtualCam'); return ok();
        case 'GetSourceScreenshot': {
          const sc = c.scenes.find((x) => x.name === requestData.sourceName);
          const src = Object.values(c.sources).find((x) => x.name === requestData.sourceName);
          if (!sc && !src) return fail(NOT_FOUND, 'source not found');
          const fmt = String(requestData.imageFormat ?? 'png').replace('jpeg', 'jpg');
          const blob = await s.engine.screenshot(sc ? `scene:${sc.id}` : `source:${src.id}`, fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png');
          if (!blob) return fail(NOT_READY, 'no picture yet');
          const data = b64(await blob.arrayBuffer());
          return ok({ imageData: `data:${blob.type};base64,${data}` });
        }
        case 'GetProfileList': return ok({ currentProfileName: s.profiles.current, profiles: s.profiles.list.map((p) => p.name) });
        case 'SetCurrentProfile': return s.switchProfile(requestData.profileName) ? ok() : fail(NOT_FOUND, 'profile not found or outputs running');
        case 'GetSceneCollectionList': return ok({ currentSceneCollectionName: s.collections.current, sceneCollections: s.collections.names });
        case 'SetCurrentSceneCollection': return s.switchCollection(requestData.sceneCollectionName) ? ok() : fail(NOT_FOUND, 'collection not found');
        case 'Sleep': await new Promise((r) => setTimeout(r, Math.min(50000, requestData.sleepMillis ?? 0))); return ok();
        default: return fail(UNKNOWN, `unknown request ${requestType}`);
      }
    } catch (error) {
      return fail(FAILED, error?.message ?? String(error));
    }
  }
}

export const REQUESTS = ['GetVersion', 'GetStats', 'GetSceneList', 'GetCurrentProgramScene', 'SetCurrentProgramScene', 'GetCurrentPreviewScene', 'SetCurrentPreviewScene', 'CreateScene', 'RemoveScene', 'GetStudioModeEnabled', 'SetStudioModeEnabled', 'TriggerStudioModeTransition', 'GetSceneItemList', 'GetSceneItemId', 'GetSceneItemEnabled', 'SetSceneItemEnabled', 'SetSceneItemLocked', 'GetInputList', 'GetInputSettings', 'SetInputSettings', 'GetInputMute', 'SetInputMute', 'ToggleInputMute', 'GetInputVolume', 'SetInputVolume', 'TriggerMediaInputAction', 'GetTransitionKindList', 'GetSceneTransitionList', 'SetCurrentSceneTransition', 'SetCurrentSceneTransitionDuration', 'GetStreamStatus', 'StartStream', 'StopStream', 'ToggleStream', 'GetRecordStatus', 'StartRecord', 'StopRecord', 'ToggleRecord', 'PauseRecord', 'ResumeRecord', 'ToggleRecordPause', 'SplitRecordFile', 'CreateRecordChapter', 'GetReplayBufferStatus', 'StartReplayBuffer', 'StopReplayBuffer', 'ToggleReplayBuffer', 'SaveReplayBuffer', 'GetVirtualCamStatus', 'StartVirtualCam', 'StopVirtualCam', 'ToggleVirtualCam', 'GetSourceScreenshot', 'GetProfileList', 'SetCurrentProfile', 'GetSceneCollectionList', 'SetCurrentSceneCollection', 'Sleep'];
