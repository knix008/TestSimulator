// Recording session lifecycle:
//   idle → starting → recording ⇄ paused → stopping → idle
// A failure from any phase returns to idle and keeps the message.

export const initialSession = Object.freeze({
  phase: 'idle',
  outputPath: null,
  startedAt: null,
  pausedAt: null,
  pausedTotal: 0,
  stoppedAt: null,
  error: null,
});

const transitions = {
  START_REQUEST: (state) =>
    state.phase === 'idle' ? { ...initialSession, phase: 'starting' } : state,
  STARTED: (state, action) =>
    state.phase === 'starting'
      ? { ...state, phase: 'recording', outputPath: action.outputPath, startedAt: action.at }
      : state,
  PAUSE: (state, action) =>
    state.phase === 'recording' ? { ...state, phase: 'paused', pausedAt: action.at } : state,
  RESUME: (state, action) =>
    state.phase === 'paused'
      ? { ...state, phase: 'recording', pausedAt: null, pausedTotal: state.pausedTotal + (action.at - state.pausedAt) }
      : state,
  STOP_REQUEST: (state, action) => {
    if (state.phase !== 'recording' && state.phase !== 'paused') return state;
    const pausedTotal = state.phase === 'paused' ? state.pausedTotal + (action.at - state.pausedAt) : state.pausedTotal;
    return { ...state, phase: 'stopping', pausedAt: null, pausedTotal, stoppedAt: action.at };
  },
  FINISHED: (state) => (state.phase === 'stopping' ? initialSession : state),
  FAIL: (state, action) => ({ ...initialSession, error: action.error ?? '알 수 없는 오류' }),
  CANCEL: (state) => (state.phase === 'starting' ? initialSession : state),
};

export function sessionReducer(state = initialSession, action) {
  return transitions[action.type]?.(state, action) ?? state;
}

export const isActive = (state) => ['starting', 'recording', 'paused', 'stopping'].includes(state.phase);

/** Recorded time excluding pauses, in milliseconds. */
export function elapsedMs(state, now) {
  if (state.startedAt == null) return 0;
  const end = state.stoppedAt ?? (state.phase === 'paused' ? state.pausedAt : now);
  return Math.max(0, end - state.startedAt - state.pausedTotal);
}
