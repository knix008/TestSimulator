// Drives one LVGL WebAssembly engine: replays a project's operations, renders frames and
// passes pointer input. Runs in the app and, with a different loader, in the Node tests.
import { ACTION_IDS, PROP_IDS, STR_IDS, TRIGGERS, TYPE_IDS } from "./schema.js";
import { colorValue, emit } from "./emit.js";
import { imageData } from "./images.js";
import { fontBytesForFace, fontData } from "./fonts.js";

export class Engine {
  constructor(module, version) {
    this.m = module;
    this.version = version;
    this.width = 0;
    this.height = 0;
    this.ids = new Map();
    this.scratch = module._malloc(16);
    this.errors = [];
    this.imagePixels = new Map();
    this.fontSlots = new Map();
  }

  /** Copies a font's file into engine memory once per face, and gives it a slot. */
  fontSlot(project, name) {
    const font = (project.fonts ?? []).find((item) => item.name === name);
    const data = font ? fontData(font.name) : null;
    if (!data) return -1;
    const known = this.fontSlots.get(data.bytes);
    if (known?.has(font.face)) return known.get(font.face);
    const bytes = fontBytesForFace(data.bytes, font.face);
    const memory = this.m._malloc(bytes.length);
    this.m.HEAPU8.set(bytes, memory);
    const slot = [...this.fontSlots.values()].reduce((sum, faces) => sum + faces.size, 0);
    if (this.m._ml_font_load(slot, memory, bytes.length) !== 0) {
      this.m._free(memory);
      return -1;
    }
    if (!known) this.fontSlots.set(data.bytes, new Map());
    this.fontSlots.get(data.bytes).set(font.face, slot);
    return slot;
  }

  /** Copies an image's pixels into engine memory once, and registers it under its index. */
  loadImages(project) {
    (project.images ?? []).forEach((image, index) => {
      const data = imageData(image.name);
      if (!data) return;
      let pixels = this.imagePixels.get(data.bgra);
      if (!pixels) {
        pixels = this.m._malloc(data.bgra.length);
        this.m.HEAPU8.set(data.bgra, pixels);
        this.imagePixels.set(data.bgra, pixels);
      }
      this.m._ml_image_load(index, data.w, data.h, pixels);
    });
  }

  withString(text, use) {
    const size = this.m.lengthBytesUTF8(text) + 1;
    const pointer = this.m._malloc(size);
    this.m.stringToUTF8(text, pointer, size);
    const result = use(pointer);
    this.m._free(pointer);
    return result;
  }

  /** Rebuilds every screen from the project and shows `activeId` (a node id). */
  load(project, activeId, { events = false } = {}) {
    const { w, h } = project.device;
    if (w !== this.width || h !== this.height) {
      this.m._ml_setup(w, h);
      this.width = w;
      this.height = h;
    } else {
      this.m._ml_clear();
    }
    const standard = project.defaultFont ? this.fontSlot(project, project.defaultFont.font) : -1;
    this.m._ml_default_font(standard, project.defaultFont?.size ?? 0);
    this.m._ml_theme(project.theme.dark ? 1 : 0, colorValue(project.theme.primary), colorValue(project.theme.secondary));
    this.loadImages(project);
    const { ops, ids } = emit(project);
    this.ids = ids;
    this.errors = [];
    const check = (code, op) => {
      if (code !== 0) this.errors.push(op);
    };
    for (const op of ops) {
      switch (op.op) {
        case "create":
          if (op.type === "qrcode") this.m._ml_qr_size(Number(op.node.props.qrSize) || 100);
          check(this.m._ml_create(op.id, TYPE_IDS[op.type], op.parent), op);
          break;
        case "canvas": check(this.m._ml_canvas(op.id, op.w, op.h, op.color), op); break;
        case "frames": check(this.withString(op.value, (p) => this.m._ml_set_s(op.id, STR_IDS.frames, p)), op); break;
        case "grid": check(this.withString(op.columns, (c) => this.withString(op.rows, (r) => this.m._ml_grid(op.id, c, r))), op); break;
        case "cell": check(this.m._ml_cell(op.id, op.column, op.columnSpan, op.row, op.rowSpan), op); break;
        case "range": check(this.m._ml_range(op.id, op.min, op.max), op); break;
        // The design holds still; animations start when the screen runs.
        case "int": if (events || op.prop !== "animate") check(this.m._ml_set_i(op.id, PROP_IDS[op.prop], op.value), op); break;
        case "str": check(this.withString(op.value, (p) => this.m._ml_set_s(op.id, STR_IDS[op.prop], p)), op); break;
        case "digits": check(this.m._ml_digits(op.id, op.count, op.separator), op); break;
        case "date": check(this.m._ml_date(op.id, op.year, op.month, op.day), op); break;
        case "link": check(this.m._ml_link(op.id, op.target), op); break;
        case "font": {
          const slot = this.fontSlot(project, op.name);
          if (slot >= 0) check(this.m._ml_set_i(op.id, PROP_IDS.font, ((slot + 1) << 16) | op.size), op);
          break;
        }
        case "image":
          if (imageData(op.name)) check(this.m._ml_set_i(op.id, PROP_IDS.image, op.index), op);
          break;
        case "event":
          if (events) {
            check(this.withString(op.text, (p) => this.m._ml_event(op.id, TRIGGERS.indexOf(op.trigger), ACTION_IDS[op.action], op.target, p)), op);
          }
          break;
        default: break;
      }
    }
    const start = ids.has(activeId) ? ids.get(activeId) : ids.get(project.screens[0].id);
    this.m._ml_show(start);
    this.m._ml_render();
    this.m._ml_tick(0);
  }

  tick(ms) {
    return this.m._ml_tick(ms) !== 0;
  }

  pointer(x, y, down) {
    this.m._ml_pointer(Math.round(x), Math.round(y), down ? 1 : 0);
  }

  /** The object's box on the display, or null. */
  /** A widget's value as it is now, while running. */
  valueOf(nodeId) {
    return this.ids.has(nodeId) ? this.m._ml_get_value(this.ids.get(nodeId)) : null;
  }

  coords(nodeId) {
    if (!this.ids.has(nodeId)) return null;
    if (this.m._ml_coords(this.ids.get(nodeId), this.scratch) !== 0) return null;
    const at = this.scratch >> 2;
    const heap = this.m.HEAP32;
    return { x: heap[at], y: heap[at + 1], w: heap[at + 2] - heap[at] + 1, h: heap[at + 3] - heap[at + 1] + 1 };
  }

  contentOrigin(nodeId) {
    if (!this.ids.has(nodeId)) return { x: 0, y: 0 };
    this.m._ml_content_origin(this.ids.get(nodeId), this.scratch);
    const at = this.scratch >> 2;
    return { x: this.m.HEAP32[at], y: this.m.HEAP32[at + 1] };
  }

  /** The BGRA frame buffer, as a view into engine memory. */
  frame() {
    const pointer = this.m._ml_framebuffer();
    return this.m.HEAPU8.subarray(pointer, pointer + this.width * this.height * 4);
  }

  /** Copies the frame into RGBA (the alpha channel is not meaningful on a display). */
  frameRGBA(target) {
    const source = this.frame();
    for (let i = 0; i < source.length; i += 4) {
      target[i] = source[i + 2];
      target[i + 1] = source[i + 1];
      target[i + 2] = source[i];
      target[i + 3] = 255;
    }
    return target;
  }

  /** Lines logged by "log" actions since the last call. */
  drainLog() {
    const lines = [];
    for (;;) {
      const pointer = this.m._ml_next_log();
      if (!pointer) return lines;
      lines.push(this.m.UTF8ToString(pointer));
    }
  }

  runtimeVersion() {
    const code = this.m._ml_version();
    return `${Math.floor(code / 10000)}.${Math.floor(code / 100) % 100}.${code % 100}`;
  }
}

const loaded = new Map();

/** Loads a bundled engine in the app; a second request for it returns the same one. */
export function loadEngine(version) {
  if (!loaded.has(version)) {
    const url = new URL(`engine/lvgl-${version}.js`, document.baseURI).href;
    loaded.set(version, import(/* @vite-ignore */ url).then(async ({ default: create }) => new Engine(await create(), version)));
  }
  return loaded.get(version);
}
