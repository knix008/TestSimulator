/* A document's picture effects: a look, four adjustments, a border and a drop shadow.
 *
 * They are values kept with the document (doc.effects), never written into its pixels. The screen
 * previews them with CSS; a picture format gets them burnt in here, in plain pixel arithmetic and
 * canvas shadows, because ctx.filter does not exist in the web views of macOS and Linux. The
 * colour operations use the same matrices as the CSS filter functions, so what is saved is what
 * was shown. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintEffects = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /* Each look is a list of [operation, amount], in the order they are applied. */
  const LOOKS = {
    none: [],
    grayscale: [["grayscale", 1]],
    sepia: [["sepia", 1]],
    invert: [["invert", 1]],
    warm: [["sepia", 0.3], ["saturate", 1.25]],
    cool: [["hue-rotate", 18], ["saturate", 0.9], ["brightness", 1.03]],
    vivid: [["saturate", 1.5], ["contrast", 1.1]],
    faded: [["contrast", 0.8], ["brightness", 1.1], ["saturate", 0.7]],
  };
  const LOOK_IDS = Object.keys(LOOKS);

  const LIMITS = {
    brightness: [0, 200],
    contrast: [0, 200],
    saturate: [0, 200],
    blur: [0, 50],
    border: [0, 500],
    offset: [-200, 200],
    shadowBlur: [0, 200],
    opacity: [0, 100],
  };

  function defaults() {
    return {
      look: "none",
      brightness: 100,
      contrast: 100,
      saturate: 100,
      blur: 0,
      border: { top: 0, bottom: 0, left: 0, right: 0, color: "#ffffff" },
      shadow: { on: false, x: 8, y: 8, blur: 16, opacity: 50, color: "#000000", backdrop: "#ffffff", transparent: false },
    };
  }

  const number = (value, range, fallback) => {
    const parsed = Number(value);
    if (value === "" || value === null || value === undefined || !Number.isFinite(parsed)) return fallback;
    return Math.max(range[0], Math.min(range[1], Math.round(parsed)));
  };
  const colour = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback);

  /* Anything stored, made valid. */
  function normalize(raw) {
    const base = defaults();
    const value = raw && typeof raw === "object" ? raw : {};
    const border = value.border && typeof value.border === "object" ? value.border : {};
    const shadow = value.shadow && typeof value.shadow === "object" ? value.shadow : {};
    return {
      look: LOOK_IDS.indexOf(value.look) >= 0 ? value.look : "none",
      brightness: number(value.brightness, LIMITS.brightness, base.brightness),
      contrast: number(value.contrast, LIMITS.contrast, base.contrast),
      saturate: number(value.saturate, LIMITS.saturate, base.saturate),
      blur: number(value.blur, LIMITS.blur, base.blur),
      border: {
        top: number(border.top, LIMITS.border, 0),
        bottom: number(border.bottom, LIMITS.border, 0),
        left: number(border.left, LIMITS.border, 0),
        right: number(border.right, LIMITS.border, 0),
        color: colour(border.color, base.border.color),
      },
      shadow: {
        on: Boolean(shadow.on),
        x: number(shadow.x, LIMITS.offset, base.shadow.x),
        y: number(shadow.y, LIMITS.offset, base.shadow.y),
        blur: number(shadow.blur, LIMITS.shadowBlur, base.shadow.blur),
        opacity: number(shadow.opacity, LIMITS.opacity, base.shadow.opacity),
        color: colour(shadow.color, base.shadow.color),
        backdrop: colour(shadow.backdrop, base.shadow.backdrop),
        transparent: Boolean(shadow.transparent),
      },
    };
  }

  const hasColour = (fx) => fx.look !== "none" || fx.brightness !== 100 || fx.contrast !== 100 || fx.saturate !== 100;
  const hasBorder = (fx) => Boolean(fx.border.top || fx.border.bottom || fx.border.left || fx.border.right);
  const hasFrame = (fx) => hasBorder(fx) || fx.shadow.on;
  const isPlain = (fx) => !hasColour(fx) && !fx.blur && !hasFrame(fx);

  /* The operations of a set of effects, look first. */
  function operations(fx) {
    const list = (LOOKS[fx.look] || []).slice();
    if (fx.brightness !== 100) list.push(["brightness", fx.brightness / 100]);
    if (fx.contrast !== 100) list.push(["contrast", fx.contrast / 100]);
    if (fx.saturate !== 100) list.push(["saturate", fx.saturate / 100]);
    return list;
  }

  const cssOf = (op) => (op[0] === "hue-rotate" ? "hue-rotate(" + op[1] + "deg)" : op[0] + "(" + op[1] + ")");

  /* The CSS filter that previews them; zoom scales the blur with the picture. */
  function cssFilter(fx, zoom) {
    const parts = operations(fx).map(cssOf);
    if (fx.blur) parts.push("blur(" + (fx.blur * (zoom || 1)) + "px)");
    return parts.join(" ");
  }

  function lookFilter(id) {
    return (LOOKS[id] || []).map(cssOf).join(" ");
  }

  /* A 3 x 4 matrix (last column is the offset, on a 0..1 scale), as the filter spec defines them. */
  function matrixOf(op) {
    const name = op[0];
    const a = op[1];
    if (name === "brightness") return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
    if (name === "contrast") { const c = 0.5 - 0.5 * a; return [a, 0, 0, c, 0, a, 0, c, 0, 0, a, c]; }
    if (name === "invert") { const k = 1 - 2 * a; return [k, 0, 0, a, 0, k, 0, a, 0, 0, k, a]; }
    if (name === "saturate") {
      return [
        0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a, 0,
      ];
    }
    if (name === "grayscale") {
      const k = 1 - a;
      return [
        0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0,
        0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0,
        0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k, 0,
      ];
    }
    if (name === "sepia") {
      const k = 1 - a;
      return [
        0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0,
        0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0,
        0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0,
      ];
    }
    // hue-rotate
    const angle = (a * Math.PI) / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
    ];
  }

  /* Runs the operations over RGBA bytes in place. */
  function applyColour(data, list) {
    const matrices = list.map(matrixOf);
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      for (let n = 0; n < matrices.length; n += 1) {
        const m = matrices[n];
        const nr = m[0] * r + m[1] * g + m[2] * b + m[3];
        const ng = m[4] * r + m[5] * g + m[6] * b + m[7];
        const nb = m[8] * r + m[9] * g + m[10] * b + m[11];
        r = nr < 0 ? 0 : nr > 1 ? 1 : nr;
        g = ng < 0 ? 0 : ng > 1 ? 1 : ng;
        b = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      }
      data[i] = r * 255 + 0.5;
      data[i + 1] = g * 255 + 0.5;
      data[i + 2] = b * 255 + 0.5;
    }
    return data;
  }

  /* One running-sum pass along a line of every channel. */
  function boxPass(from, to, width, height, radius, horizontal) {
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const stride = horizontal ? 4 : width * 4;
    const jump = horizontal ? width * 4 : 4;
    const size = radius * 2 + 1;
    for (let line = 0; line < lines; line += 1) {
      const start = line * jump;
      for (let channel = 0; channel < 4; channel += 1) {
        const at = (n) => from[start + Math.max(0, Math.min(length - 1, n)) * stride + channel];
        let sum = 0;
        for (let n = -radius; n <= radius; n += 1) sum += at(n);
        for (let n = 0; n < length; n += 1) {
          to[start + n * stride + channel] = sum / size + 0.5;
          sum += at(n + radius + 1) - at(n - radius);
        }
      }
    }
  }

  /* Three box blurs stand in for the Gaussian of blur(sigma), as the spec itself suggests. */
  function applyBlur(data, width, height, sigma) {
    const radius = Math.max(1, Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5) >> 1);
    let a = data;
    let b = new Uint8ClampedArray(data.length);
    for (let pass = 0; pass < 3; pass += 1) {
      boxPass(a, b, width, height, radius, true);
      boxPass(b, a, width, height, radius, false);
    }
    return a;
  }

  /* How far the frame reaches past the picture on each side: the border, then the shadow beyond it. */
  function extents(fx) {
    const out = {
      top: fx.border.top,
      bottom: fx.border.bottom,
      left: fx.border.left,
      right: fx.border.right,
    };
    if (fx.shadow.on) {
      out.top += Math.max(0, fx.shadow.blur - fx.shadow.y);
      out.bottom += Math.max(0, fx.shadow.blur + fx.shadow.y);
      out.left += Math.max(0, fx.shadow.blur - fx.shadow.x);
      out.right += Math.max(0, fx.shadow.blur + fx.shadow.x);
    }
    return out;
  }

  function shadowColour(fx) {
    const hex = fx.shadow.color;
    return "rgba(" + parseInt(hex.slice(1, 3), 16) + "," + parseInt(hex.slice(3, 5), 16) + "," + parseInt(hex.slice(5, 7), 16) + "," + fx.shadow.opacity / 100 + ")";
  }

  function outputSize(width, height, fx) {
    const reach = extents(fx);
    return { width: width + reach.left + reach.right, height: height + reach.top + reach.bottom };
  }

  /* The colours and blur of the effects on a copy, or the source itself when there are none. */
  function filtered(source, fx) {
    if (!hasColour(fx) && !fx.blur) return source;
    const picture = (source.ownerDocument || document).createElement("canvas");
    picture.width = source.width;
    picture.height = source.height;
    const ctx = picture.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, picture.width, picture.height);
    applyColour(image.data, operations(fx));
    if (fx.blur) applyBlur(image.data, picture.width, picture.height, fx.blur);
    ctx.putImageData(image, 0, 0);
    return picture;
  }

  /* One shape's effects, on a see-through layer holding it with inset pixels of room around it. A
   * shadow follows the shape's own outline; a border is a band around its box. Returns the new
   * canvas, and how far right and down of its corner the layer's corner now sits. */
  function applyLayer(layer, raw, inset) {
    const fx = normalize(raw);
    const doc = layer.ownerDocument || document;
    const picture = filtered(layer, fx);
    if (!hasFrame(fx)) return { canvas: picture, left: 0, top: 0 };
    const reach = extents(fx);
    const out = doc.createElement("canvas");
    out.width = layer.width + reach.left + reach.right;
    out.height = layer.height + reach.top + reach.bottom;
    const ctx = out.getContext("2d");
    const shadow = () => {
      if (!fx.shadow.on) return;
      ctx.shadowColor = shadowColour(fx);
      ctx.shadowOffsetX = fx.shadow.x;
      ctx.shadowOffsetY = fx.shadow.y;
      ctx.shadowBlur = fx.shadow.blur;
    };
    if (hasBorder(fx)) {
      shadow();
      ctx.fillStyle = fx.border.color;
      ctx.fillRect(reach.left + inset - fx.border.left, reach.top + inset - fx.border.top, layer.width - inset * 2 + fx.border.left + fx.border.right, layer.height - inset * 2 + fx.border.top + fx.border.bottom);
      ctx.shadowColor = "transparent";
    } else {
      shadow();
    }
    ctx.drawImage(picture, reach.left, reach.top);
    return { canvas: out, left: reach.left, top: reach.top };
  }

  /* The picture with its effects burnt in: the source itself when there are none. flatten paints
   * the backdrop even if it was asked to be transparent, for formats with no transparency. */
  function apply(source, raw, options) {
    const fx = normalize(raw);
    if (isPlain(fx)) return source;
    const opts = options || {};
    const doc = source.ownerDocument || document;
    const picture = filtered(source, fx);
    if (!hasFrame(fx)) return picture;
    const reach = extents(fx);
    const size = outputSize(source.width, source.height, fx);
    const out = doc.createElement("canvas");
    out.width = size.width;
    out.height = size.height;
    const ctx = out.getContext("2d");
    if (fx.shadow.on && (!fx.shadow.transparent || opts.flatten)) {
      ctx.fillStyle = fx.shadow.backdrop;
      ctx.fillRect(0, 0, size.width, size.height);
    }
    const x = reach.left - fx.border.left;
    const y = reach.top - fx.border.top;
    const w = source.width + fx.border.left + fx.border.right;
    const h = source.height + fx.border.top + fx.border.bottom;
    if (fx.shadow.on) {
      ctx.shadowColor = shadowColour(fx);
      ctx.shadowOffsetX = fx.shadow.x;
      ctx.shadowOffsetY = fx.shadow.y;
      ctx.shadowBlur = fx.shadow.blur;
    }
    ctx.fillStyle = fx.border.color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = "transparent";
    // printing without the background: the paper shows through the picture, not the frame's colour
    if (opts.clearBehind) ctx.clearRect(reach.left, reach.top, source.width, source.height);
    ctx.drawImage(picture, reach.left, reach.top);
    return out;
  }

  return {
    LOOK_IDS: LOOK_IDS,
    LIMITS: LIMITS,
    defaults: defaults,
    normalize: normalize,
    isPlain: isPlain,
    hasFrame: hasFrame,
    hasBorder: hasBorder,
    cssFilter: cssFilter,
    lookFilter: lookFilter,
    extents: extents,
    shadowColour: shadowColour,
    outputSize: outputSize,
    apply: apply,
    applyLayer: applyLayer,
    applyColour: applyColour,
    operations: operations,
    matrixOf: matrixOf,
    hasColour: hasColour,
  };
});
