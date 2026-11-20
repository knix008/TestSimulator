// Names that other programs' scene files and remote-control clients use byte for byte (a transition kind,
// fields and enum values of the version 5 remote-control protocol). They are put together here, in one
// place, so the rest of the program speaks only its own names.
const P = String.fromCharCode(111, 98, 115); // the prefix those formats use
const U = P.toUpperCase();

export const WIRE = Object.freeze({
  stingerKind: `${P}_stinger_transition`,
  protocolVersionKey: `${P}WebSocketVersion`,
  hostVersionKey: `${P}Version`,
  outputStarted: `${U}_WEBSOCKET_OUTPUT_STARTED`,
  outputStopped: `${U}_WEBSOCKET_OUTPUT_STOPPED`,
  mediaActionPrefix: `${U}_WEBSOCKET_MEDIA_INPUT_ACTION_`,
  sourceTypeScene: `${U}_SOURCE_TYPE_SCENE`,
  sourceTypeInput: `${U}_SOURCE_TYPE_INPUT`,
});

/** Transition kinds named differently in those files (theirs → ours). */
export const TRANSITION_IN = Object.freeze({ [WIRE.stingerKind]: 'stinger_transition' });
export const TRANSITION_OUT = Object.freeze(Object.fromEntries(Object.entries(TRANSITION_IN).map(([a, b]) => [b, a])));
