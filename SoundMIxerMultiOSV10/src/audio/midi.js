function readVarUint(view, offset) {
  let value = 0;
  let pos = offset;
  for (let i = 0; i < 4; i++) {
    const byte = view.getUint8(pos++);
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, next: pos };
    }
  }
  throw new Error('Invalid MIDI variable-length integer');
}

function readChunkHeader(view, offset) {
  if (offset + 8 > view.byteLength) throw new Error('Unexpected end of MIDI file');
  const id = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
  const length = view.getUint32(offset + 4, false);
  return { id, length, dataOffset: offset + 8, next: offset + 8 + length };
}

function parseMidi(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const header = readChunkHeader(view, offset);
  if (header.id !== 'MThd' || header.length < 6) {
    throw new Error('Invalid MIDI header');
  }

  const format = view.getUint16(header.dataOffset, false);
  const trackCount = view.getUint16(header.dataOffset + 2, false);
  const division = view.getUint16(header.dataOffset + 4, false);
  if (division & 0x8000) {
    throw new Error('SMPTE MIDI timing is not supported');
  }

  const ticksPerQuarter = division;
  offset = header.next;

  const notes = [];
  const tempoEvents = [{ tick: 0, microsPerQuarter: 500000 }];

  for (let t = 0; t < trackCount; t++) {
    const chunk = readChunkHeader(view, offset);
    offset = chunk.next;
    if (chunk.id !== 'MTrk') continue;

    let pos = chunk.dataOffset;
    const end = chunk.next;
    let absoluteTick = 0;
    let runningStatus = 0;
    const activeNotes = new Map();

    while (pos < end) {
      const delta = readVarUint(view, pos);
      absoluteTick += delta.value;
      pos = delta.next;
      if (pos >= end) break;

      let status = view.getUint8(pos);
      if (status < 0x80) {
        if (!runningStatus) throw new Error('Missing running status in MIDI stream');
        status = runningStatus;
      } else {
        pos += 1;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = view.getUint8(pos++);
        const metaLen = readVarUint(view, pos);
        pos = metaLen.next;

        if (metaType === 0x51 && metaLen.value === 3) {
          const microsPerQuarter =
            (view.getUint8(pos) << 16) | (view.getUint8(pos + 1) << 8) | view.getUint8(pos + 2);
          tempoEvents.push({ tick: absoluteTick, microsPerQuarter });
        }
        pos += metaLen.value;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const sysexLen = readVarUint(view, pos);
        pos = sysexLen.next + sysexLen.value;
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;

      const readData1 = () => {
        const d1 = view.getUint8(pos);
        pos += 1;
        return d1;
      };
      const readData2 = () => {
        const d2 = view.getUint8(pos);
        pos += 1;
        return d2;
      };

      if (command === 0x80 || command === 0x90) {
        const note = readData1();
        const velocity = readData2();
        const key = `${channel}:${note}`;

        if (command === 0x90 && velocity > 0) {
          const stack = activeNotes.get(key) || [];
          stack.push({ startTick: absoluteTick, velocity: velocity / 127, channel, note });
          activeNotes.set(key, stack);
        } else {
          const stack = activeNotes.get(key);
          if (stack && stack.length) {
            const started = stack.pop();
            notes.push({
              channel: started.channel,
              note: started.note,
              velocity: started.velocity,
              startTick: started.startTick,
              endTick: absoluteTick
            });
            if (!stack.length) activeNotes.delete(key);
          }
        }
      } else if (command === 0xa0 || command === 0xb0 || command === 0xe0) {
        readData1();
        readData2();
      } else if (command === 0xc0 || command === 0xd0) {
        readData1();
      } else {
        throw new Error(`Unsupported MIDI status byte: 0x${status.toString(16)}`);
      }
    }

    for (const stack of activeNotes.values()) {
      for (const started of stack) {
        notes.push({
          channel: started.channel,
          note: started.note,
          velocity: started.velocity,
          startTick: started.startTick,
          endTick: started.startTick + ticksPerQuarter / 2
        });
      }
    }
  }

  tempoEvents.sort((a, b) => a.tick - b.tick);

  return { format, ticksPerQuarter, notes, tempoEvents };
}

function buildTempoSegments(tempoEvents, ticksPerQuarter) {
  const events = [];
  for (const evt of tempoEvents) {
    if (!events.length || events[events.length - 1].tick !== evt.tick) {
      events.push(evt);
    } else {
      events[events.length - 1] = evt;
    }
  }

  const segments = [];
  let accumulatedSec = 0;
  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const next = events[i + 1];
    segments.push({
      startTick: current.tick,
      startSec: accumulatedSec,
      microsPerQuarter: current.microsPerQuarter,
      endTick: next ? next.tick : Infinity
    });

    if (next) {
      const deltaTicks = next.tick - current.tick;
      const secPerTick = current.microsPerQuarter / 1000000 / ticksPerQuarter;
      accumulatedSec += deltaTicks * secPerTick;
    }
  }
  return segments;
}

function tickToSeconds(tick, segments) {
  if (!Number.isFinite(tick) || tick < 0) return 0;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (tick >= seg.startTick) {
      const secPerTick = seg.microsPerQuarter / 1000000 / seg.ticksPerQuarter;
      return seg.startSec + (tick - seg.startTick) * secPerTick;
    }
  }
  return 0;
}

function midiNoteToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export async function midiArrayBufferToAudioBuffer(arrayBuffer, options = {}) {
  const parsed = parseMidi(arrayBuffer);
  if (!parsed.notes.length) {
    throw new Error('MIDI has no note events');
  }

  const sampleRate = Math.max(22050, Number(options.sampleRate) || 44100);
  const channels = 2;
  const tempoSegments = buildTempoSegments(parsed.tempoEvents, parsed.ticksPerQuarter)
    .map((s) => ({ ...s, ticksPerQuarter: parsed.ticksPerQuarter }));

  let maxEndSec = 0;
  const timedNotes = parsed.notes
    .filter((n) => n.endTick > n.startTick)
    .map((note) => {
      const startSec = tickToSeconds(note.startTick, tempoSegments);
      const endSec = tickToSeconds(note.endTick, tempoSegments);
      if (endSec > maxEndSec) maxEndSec = endSec;
      return { ...note, startSec, endSec };
    });

  const tailSec = 0.25;
  const totalDuration = Math.max(0.5, maxEndSec + tailSec);
  const offline = new OfflineAudioContext(channels, Math.ceil(totalDuration * sampleRate), sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.75;
  master.connect(offline.destination);

  for (const note of timedNotes) {
    const duration = Math.max(0.03, note.endSec - note.startSec);
    const osc = offline.createOscillator();
    const gain = offline.createGain();

    // Channel 10 (index 9) is percussion in General MIDI, use brighter sound.
    if (note.channel === 9) {
      osc.type = 'square';
    } else if (note.note < 48) {
      osc.type = 'triangle';
    } else {
      osc.type = 'sine';
    }

    osc.frequency.value = midiNoteToFreq(note.note);

    const peak = Math.min(0.8, Math.max(0.07, note.velocity * 0.5));
    const attack = 0.005;
    const release = Math.min(0.18, duration * 0.45);
    const sustainEnd = Math.max(note.startSec + attack, note.startSec + duration - release);

    gain.gain.setValueAtTime(0.0001, note.startSec);
    gain.gain.exponentialRampToValueAtTime(peak, note.startSec + attack);
    gain.gain.setValueAtTime(peak, sustainEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, note.startSec + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(note.startSec);
    osc.stop(note.startSec + duration + 0.02);
  }

  return offline.startRendering();
}
