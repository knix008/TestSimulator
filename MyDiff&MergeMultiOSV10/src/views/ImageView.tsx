/**
 * Picture comparison.
 *
 * Two images are not usefully compared as a hex dump, so a pair of pictures opens
 * here instead: side by side, blended with a slider, or as a difference map where
 * every pixel that changed lights up and everything else goes dark.
 *
 * Three things make the difference findable rather than merely computed. The pair is
 * drawn at one scale, which can be taken from fit-the-window up to sixteen times
 * life size with the pixel grid left unsmoothed, because a one-pixel shift in a
 * screenshot is invisible at any smaller magnification. The two panes share a scroll
 * position, so what is under the cursor on the left is the same part of the picture
 * on the right. And the regions that changed are boxed on both sides, so finding
 * them is not a hunt across an image that is mostly identical.
 *
 * The comparison is computed on a canvas in the renderer — the images are already
 * being fetched to display, so nothing extra crosses the wire — and it is computed
 * once per pair, not once per mode: the same pass feeds the difference map, the
 * boxes and the count of differing pixels.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isImagePath } from "../../core/images.js";
import { formatBytes } from "../../core/text.js";
import { api } from "../api.js";
import { paneHeaderStyle } from "../../core/themes.js";
import { Icon } from "../icons.js";
import { PathBar } from "../PathBar.js";
import { useApp, type CompareTab } from "../state.js";

export { IMAGE_EXTENSIONS, isImagePath } from "../../core/images.js";

/** True when both sides are pictures, so the picture view is the right one. */
export function isImagePair(tab: CompareTab): boolean {
  return isImagePath(tab.summary.left.path) && isImagePath(tab.summary.right.path);
}

type Mode = "sideBySide" | "blend" | "difference";

type Size = { width: number; height: number };

type Rect = { x: number; y: number; width: number; height: number };

type Diff = {
  /** The union of the two pictures: what the comparison is done over. */
  width: number;
  height: number;
  different: number;
  total: number;
  /** The difference picture, ready to put on a canvas. */
  map: ImageData;
  /** The changed regions, as boxes over the union, for marking both sides. */
  areas: Rect[];
};

/** The scales the buttons step through. Sixteen times is where single pixels read. */
const ZOOMS = [0.1, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

/** How far a channel has to move to count as a change, past encoder noise. */
const THRESHOLD = 8;

/** The grid the changed areas are reported on: fine enough to point, coarse enough to see. */
const BLOCK = 12;

export function ImageView({ tab }: {
  tab: CompareTab;
}) {
  const app = useApp();
  const { t, settings } = app;

  /*
   * A pane title bar's colours. The swatch a user picks is blended into the theme,
   * so the bar follows light and dark instead of staying a pastel in both.
   */
  const tint = (pane: "base" | "local" | "remote" | "result") =>
    paneHeaderStyle(settings.headerColors[pane], settings.theme, settings.customTheme);

  const summary = tab.summary;
  const [mode, setMode] = useState<Mode>("sideBySide");
  const [blend, setBlend] = useState(50);
  const [marks, setMarks] = useState(true);
  /** null is "fit the window"; a number is that many times life size. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [sizes, setSizes] = useState<{ left: Size | null; right: Size | null }>({ left: null, right: null });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [diff, setDiff] = useState<Diff | null>(null);

  /*
   * The two addresses, held still.
   *
   * `api.imageUrl` stamps the current time onto the query so that a file compared
   * again after it changed is fetched again rather than taken from the cache. Called
   * during the render that uses it, that stamp is a new address on every render: the
   * browser throws away the picture it had half-loaded and starts again, the effect
   * below sees new inputs and runs again, and the pair never finishes loading. So the
   * address is pinned to what it actually depends on — the path, and when the file
   * was last written.
   */
  const leftUrl = useMemo(
    () => (summary.left.path ? api.imageUrl(summary.left.path) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stamp is the point
    [summary.left.path, summary.left.modified],
  );
  const rightUrl = useMemo(
    () => (summary.right.path ? api.imageUrl(summary.right.path) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stamp is the point
    [summary.right.path, summary.right.modified],
  );

  /* ------------------------------------------------------ the comparison */

  useEffect(() => {
    setSizes({ left: null, right: null });
    setDiff(null);
    if (!leftUrl || !rightUrl) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        const [left, right] = await Promise.all([load(leftUrl), load(rightUrl)]);
        if (cancelled) return;
        setSizes({
          left: { width: left.naturalWidth, height: left.naturalHeight },
          right: { width: right.naturalWidth, height: right.naturalHeight },
        });
        if (left.naturalWidth > 0 && right.naturalWidth > 0) setDiff(compare(left, right));
      } catch {
        // A format this build cannot decode; `Picture` says so in the pane.
      }
    })();
    return () => { cancelled = true; };
  }, [leftUrl, rightUrl]);

  /*
   * One geometry for both panes — the union of the two pictures — so that a point in
   * the left pane is the same point in the right one even when the two files are not
   * the same size. Scaling each side to its own pane instead would put two different
   * magnifications side by side and call it a comparison.
   */
  const frame: Size = useMemo(() => ({
    width: Math.max(sizes.left?.width ?? 0, sizes.right?.width ?? 0),
    height: Math.max(sizes.left?.height ?? 0, sizes.right?.height ?? 0),
  }), [sizes]);

  const fitScale = frame.width && viewport.width
    ? Math.min(viewport.width / frame.width, viewport.height / frame.height, 1)
    : 1;
  const scale = zoom ?? fitScale;

  /* ------------------------------------------------- panning and zooming */

  const scrollers = useRef(new Set<HTMLDivElement>());
  const syncing = useRef(false);

  /*
   * A pane joins the group while it is on screen, and the stage measures itself from
   * the first one: both panes are the same size, so one is the answer for both.
   *
   * The wheel is bound here rather than through React because the zoom gesture has
   * to stop the pane scrolling as well, and React's own wheel listener is passive.
   */
  const stepRef = useRef<(direction: 1 | -1) => void>(() => undefined);
  const paneRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return undefined;
    scrollers.current.add(node);
    const observer = new ResizeObserver(() => {
      setViewport({ width: node.clientWidth, height: node.clientHeight });
    });
    observer.observe(node);
    setViewport({ width: node.clientWidth, height: node.clientHeight });

    const onWheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      event.preventDefault();
      stepRef.current(event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      observer.disconnect();
      scrollers.current.delete(node);
      node.removeEventListener("wheel", onWheel);
    };
  }, []);

  const syncFrom = useCallback((source: HTMLDivElement) => {
    if (syncing.current) return;
    syncing.current = true;
    for (const other of scrollers.current) {
      if (other === source) continue;
      other.scrollLeft = source.scrollLeft;
      other.scrollTop = source.scrollTop;
    }
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  /*
   * Zooming keeps the middle of the view where it was. Without it, every press of
   * the button throws away the place the user had found and sends them back to the
   * top-left corner of the picture.
   */
  const centre = useRef<{ x: number; y: number } | null>(null);
  const changeZoom = useCallback((next: number | null) => {
    const [pane] = scrollers.current;
    if (pane && pane.scrollWidth > 0) {
      centre.current = {
        x: (pane.scrollLeft + pane.clientWidth / 2) / pane.scrollWidth,
        y: (pane.scrollTop + pane.clientHeight / 2) / pane.scrollHeight,
      };
    }
    setZoom(next);
  }, []);

  useLayoutEffect(() => {
    const anchor = centre.current;
    if (!anchor) return;
    centre.current = null;
    for (const pane of scrollers.current) {
      pane.scrollLeft = anchor.x * pane.scrollWidth - pane.clientWidth / 2;
      pane.scrollTop = anchor.y * pane.scrollHeight - pane.clientHeight / 2;
    }
  }, [scale, mode]);

  const step = useCallback((direction: 1 | -1) => {
    const current = zoom ?? fitScale;
    const next = direction > 0
      ? ZOOMS.find((value) => value > current + 0.001)
      : [...ZOOMS].reverse().find((value) => value < current - 0.001);
    if (next !== undefined) changeZoom(next);
  }, [changeZoom, fitScale, zoom]);

  stepRef.current = step;

  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const pane = event.currentTarget;
    drag.current = { x: event.clientX, y: event.clientY, left: pane.scrollLeft, top: pane.scrollTop };
    pane.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = drag.current;
    if (!origin) return;
    const pane = event.currentTarget;
    pane.scrollLeft = origin.left - (event.clientX - origin.x);
    pane.scrollTop = origin.top - (event.clientY - origin.y);
    syncFrom(pane);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const paneProps = {
    ref: paneRef,
    onScroll: (event: React.UIEvent<HTMLDivElement>) => syncFrom(event.currentTarget),
    /* The gesture every picture viewer has: in to life size, out to the window. */
    onDoubleClick: () => changeZoom(zoom === null ? 1 : null),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    title: t("image.pan"),
  };

  /* ----------------------------------------------------------- the stage */

  const mismatch = sizes.left && sizes.right
    && (sizes.left.width !== sizes.right.width || sizes.left.height !== sizes.right.height);
  const percent = Math.round(scale * 100);
  const areas = marks && diff && diff.different > 0 ? diff.areas : null;

  return (
    <div className="image-view">
      <div className="pane-headers two-up">
        <PathBar
          side="left"
          kind="file"
          value={summary.left.path ?? summary.left.label}
          tint={tint("local")}
          onApply={(next) => void app.setCompareSide(tab, "left", next)}
        />
        <PathBar
          side="right"
          kind="file"
          value={summary.right.path ?? summary.right.label}
          tint={tint("remote")}
          onApply={(next) => void app.setCompareSide(tab, "right", next)}
        />
      </div>

      <div className="tree-toolbar">
        {(["sideBySide", "blend", "difference"] as Mode[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`chip${mode === item ? " checked" : ""}`}
            data-command={`image.${item}`}
            title={t(`image.${item}` as Parameters<typeof t>[0])}
            onClick={() => setMode(item)}
          >
            <Icon name={item === "difference" ? "modified" : item === "blend" ? "image" : "columns"} size={14} />
            <span>{t(`image.${item}` as Parameters<typeof t>[0])}</span>
          </button>
        ))}

        <span className="tree-divider" />

        <button
          type="button"
          className="chip icon-only"
          data-command="image.zoomOut"
          title={t("image.zoomOut")}
          aria-label={t("image.zoomOut")}
          disabled={scale <= ZOOMS[0]}
          onClick={() => step(-1)}
        >
          <Icon name="zoomOut" size={14} />
        </button>
        <span className="slider-value" data-testid="image-zoom">{percent}%</span>
        <button
          type="button"
          className="chip icon-only"
          data-command="image.zoomIn"
          title={t("image.zoomIn")}
          aria-label={t("image.zoomIn")}
          disabled={scale >= ZOOMS[ZOOMS.length - 1]}
          onClick={() => step(1)}
        >
          <Icon name="zoomIn" size={14} />
        </button>
        <button
          type="button"
          className={`chip${zoom === null ? " checked" : ""}`}
          data-command="image.fit"
          title={t("image.fit")}
          onClick={() => changeZoom(null)}
        >
          <Icon name="preview" size={14} />
          <span>{t("image.fit")}</span>
        </button>
        <button
          type="button"
          className={`chip${zoom === 1 ? " checked" : ""}`}
          data-command="image.actual"
          title={t("image.actual")}
          onClick={() => changeZoom(1)}
        >
          <Icon name="zoomReset" size={14} />
          <span>{t("image.actual")}</span>
        </button>

        {mode === "difference" ? null : (
          <button
            type="button"
            className={`chip${marks ? " checked" : ""}`}
            data-command="image.marks"
            title={t("image.marks")}
            aria-pressed={marks}
            onClick={() => setMarks(!marks)}
          >
            <Icon name="find" size={14} />
            <span>{t("image.marks")}</span>
          </button>
        )}

        {mode === "blend" ? (
          <span className="blend-slider">
            <input
              type="range"
              min={0}
              max={100}
              value={blend}
              aria-label={t("image.blend")}
              onChange={(event) => setBlend(Number(event.target.value))}
            />
            <span className="slider-value">{blend}%</span>
          </span>
        ) : null}

        <span className="tree-spacer" />
        <span className="tree-hint">
          {formatBytes(summary.left.size)} / {formatBytes(summary.right.size)}
          {frame.width ? ` — ${frame.width}×${frame.height}` : ""}
          {diff ? ` — ${diff.different === 0
            ? t("image.identicalPixels")
            : t("image.differentPixels", diff.different.toLocaleString(), share(diff))}` : ""}
        </span>
      </div>

      {mismatch && sizes.left && sizes.right ? (
        <div className="diff-banner warn">
          {t("image.sizeMismatch", `${sizes.left.width}×${sizes.left.height}`, `${sizes.right.width}×${sizes.right.height}`)}
        </div>
      ) : null}

      <div
        className={`image-stage mode-${mode}${scale >= 2 ? " pixelated" : ""}`}
        data-testid="image-stage"
      >
        {mode === "sideBySide" ? (
          <>
            <div className="image-pane" {...paneProps}>
              <Stage frame={frame} scale={scale}>
                <Picture url={leftUrl} side="left" size={sizes.left} scale={scale} />
                {areas ? <Marks width={frame.width} height={frame.height} areas={areas} /> : null}
              </Stage>
            </div>
            <div className="image-pane" {...paneProps}>
              <Stage frame={frame} scale={scale}>
                <Picture url={rightUrl} side="right" size={sizes.right} scale={scale} />
                {areas ? <Marks width={frame.width} height={frame.height} areas={areas} /> : null}
              </Stage>
            </div>
          </>
        ) : null}

        {mode === "blend" ? (
          <div className="image-pane" {...paneProps}>
            <Stage frame={frame} scale={scale}>
              <Picture url={leftUrl} side="left" size={sizes.left} scale={scale} />
              <Picture url={rightUrl} side="right" size={sizes.right} scale={scale} opacity={blend / 100} />
              {areas ? <Marks width={frame.width} height={frame.height} areas={areas} /> : null}
            </Stage>
          </div>
        ) : null}

        {mode === "difference" ? (
          <div className="image-pane dark" {...paneProps}>
            <Stage frame={frame} scale={scale}>
              {diff ? <Difference diff={diff} /> : null}
            </Stage>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The stage
 * ------------------------------------------------------------------ */

/**
 * The box both pictures are laid into, at the scale in force.
 *
 * Everything inside is positioned from its top-left corner at the same scale, which
 * is what keeps the two sides — and the boxes drawn over them — on the same pixel.
 */
function Stage({ frame, scale, children }: {
  frame: Size;
  scale: number;
  children: React.ReactNode;
}) {
  if (!frame.width || !frame.height) return <>{children}</>;
  return (
    <div
      className="image-frame"
      style={{ width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) }}
    >
      {children}
    </div>
  );
}

/**
 * One picture, or a plain statement of why it is not here.
 *
 * A format the build cannot decode — HEIC, which is an HEVC frame in a box — would
 * otherwise show as a broken-image icon, which tells the user nothing. The server
 * says why in its refusal; this shows that the file is a picture and that this build
 * will not open it, which is the honest answer.
 */
function Picture({ url, side, size, scale, opacity }: {
  url: string;
  side: "left" | "right";
  size: Size | null;
  scale: number;
  opacity?: number;
}) {
  const app = useApp();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (!url) return null;
  if (failed) {
    return (
      <p className="image-missing">
        <Icon name="warning" size={18} />
        {app.t("image.cannotShow")}
      </p>
    );
  }
  return (
    <img
      src={url}
      alt={side}
      className={`image-layer side-${side}`}
      style={{
        opacity,
        ...(size ? { width: Math.round(size.width * scale), height: Math.round(size.height * scale) } : {}),
      }}
      onError={() => setFailed(true)}
    />
  );
}

/** The difference picture, drawn once per comparison. */
function Difference({ diff }: { diff: Diff }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    node.width = diff.width;
    node.height = diff.height;
    node.getContext("2d")?.putImageData(diff.map, 0, 0);
  }, [diff]);
  return <canvas ref={canvas} className="image-layer image-stretch" />;
}

/**
 * The changed regions, boxed on top of the picture.
 *
 * Drawn on a canvas at the picture's own resolution and stretched with it, so the
 * boxes stay on their pixels at every magnification. This is the part that answers
 * "where", which a count of differing pixels never does.
 */
function Marks({ width, height, areas }: { width: number; height: number; areas: Rect[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    node.width = width;
    node.height = height;
    const context = node.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(239, 68, 68, 0.22)";
    context.strokeStyle = "rgba(239, 68, 68, 0.95)";
    context.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 400));
    for (const area of areas) {
      context.fillRect(area.x, area.y, area.width, area.height);
      context.strokeRect(area.x + 0.5, area.y + 0.5, area.width - 1, area.height - 1);
    }
  }, [areas, height, width]);
  return <canvas ref={canvas} className="image-layer image-stretch image-marks" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ *
 * The pixels
 * ------------------------------------------------------------------ */

/**
 * The whole comparison in one pass over the union of the two pictures.
 *
 * Both sides are drawn into their own canvas at the union size so that a file which
 * is only present, or only large, on one side still has something to compare: the
 * area the other picture does not cover is transparent, and transparent against a
 * colour is a difference.
 */
function compare(left: HTMLImageElement, right: HTMLImageElement): Diff {
  const width = Math.max(left.naturalWidth, right.naturalWidth);
  const height = Math.max(left.naturalHeight, right.naturalHeight);
  const a = pixels(left, width, height);
  const b = pixels(right, width, height);

  const map = new ImageData(width, height);
  const columns = Math.ceil(width / BLOCK);
  const rows = Math.ceil(height / BLOCK);
  const changed = new Uint8Array(columns * rows);
  let different = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(a[at] - b[at]),
        Math.abs(a[at + 1] - b[at + 1]),
        Math.abs(a[at + 2] - b[at + 2]),
        Math.abs(a[at + 3] - b[at + 3]),
      );
      if (delta > THRESHOLD) {
        different += 1;
        changed[Math.floor(y / BLOCK) * columns + Math.floor(x / BLOCK)] = 1;
        // Changed pixels in red, at the strength of the change.
        map.data[at] = 255;
        map.data[at + 1] = 60;
        map.data[at + 2] = 60;
        map.data[at + 3] = Math.min(255, 90 + delta);
      } else {
        // Unchanged pixels as a dim grey ghost, so the shape is still readable.
        const grey = ((a[at] + a[at + 1] + a[at + 2]) / 3) * 0.3;
        map.data[at] = grey;
        map.data[at + 1] = grey;
        map.data[at + 2] = grey;
        map.data[at + 3] = a[at + 3] ? 90 : 0;
      }
    }
  }

  return { width, height, different, total: width * height, map, areas: boxes(changed, columns, rows, width, height) };
}

function pixels(image: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray(width * height * 4);
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, width, height).data;
}

/**
 * The changed blocks, joined into as few boxes as possible.
 *
 * A run of neighbouring blocks across a row becomes one box, and a box is then
 * grown downward while the row below changes in exactly the same columns. A
 * one-word edit in a screenshot comes out as one box rather than forty.
 */
function boxes(changed: Uint8Array, columns: number, rows: number, width: number, height: number): Rect[] {
  const used = new Uint8Array(changed.length);
  const out: Rect[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const at = row * columns + column;
      if (!changed[at] || used[at]) continue;

      let end = column;
      while (end + 1 < columns && changed[row * columns + end + 1] && !used[row * columns + end + 1]) end += 1;

      let last = row;
      const matches = (candidate: number) => {
        if (candidate >= rows) return false;
        for (let x = column; x <= end; x += 1) {
          if (!changed[candidate * columns + x] || used[candidate * columns + x]) return false;
        }
        // Not wider than the run we started with, or the box would claim untouched blocks.
        if (column > 0 && changed[candidate * columns + column - 1]) return false;
        if (end + 1 < columns && changed[candidate * columns + end + 1]) return false;
        return true;
      };
      while (matches(last + 1)) last += 1;

      for (let y = row; y <= last; y += 1) {
        for (let x = column; x <= end; x += 1) used[y * columns + x] = 1;
      }

      out.push({
        x: column * BLOCK,
        y: row * BLOCK,
        width: Math.min(width, (end + 1) * BLOCK) - column * BLOCK,
        height: Math.min(height, (last + 1) * BLOCK) - row * BLOCK,
      });
    }
  }

  return out;
}

/** The share of the picture that differs, to one decimal place. */
function share(diff: Diff): string {
  const value = (diff.different / Math.max(1, diff.total)) * 100;
  return value >= 0.1 ? value.toFixed(1) : "<0.1";
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}
