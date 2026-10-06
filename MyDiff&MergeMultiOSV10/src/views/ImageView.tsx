/**
 * Picture comparison.
 *
 * Two images are not usefully compared as a hex dump, so a pair of pictures opens
 * here instead: side by side, blended with a slider, or as a difference map where
 * every pixel that changed lights up and everything else goes dark.
 *
 * The difference map is computed on a canvas in the renderer — the images are already
 * being fetched to display, so nothing extra crosses the wire — and reports how many
 * pixels differ, which is the number a person actually wants.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "../../core/text.js";
import { api } from "../api.js";
import { paneHeaderStyle } from "../../core/themes.js";
import { Icon } from "../icons.js";
import { PathBar } from "../PathBar.js";
import { useApp, type CompareTab } from "../state.js";

/*
 * Everything the picture comparison will take on. The browser draws most of these
 * itself; a TIFF is decoded by the server and arrives as a PNG, and a HEIC is
 * recognised so that it opens here and gets a clear message rather than being
 * compared as a hex dump.
 */
export const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "jfif", "gif", "webp", "bmp", "dib",
  "ico", "cur", "avif", "svg", "tif", "tiff", "heic", "heif",
]);

export function isImagePath(target: string | null): boolean {
  if (!target) return false;
  const extension = target.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
}

/** True when both sides are pictures, so the picture view is the right one. */
export function isImagePair(tab: CompareTab): boolean {
  return isImagePath(tab.summary.left.path) && isImagePath(tab.summary.right.path);
}

type Mode = "sideBySide" | "blend" | "difference";

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
  const [stats, setStats] = useState<{ width: number; height: number; different: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const leftUrl = summary.left.path ? api.imageUrl(summary.left.path) : "";
  const rightUrl = summary.right.path ? api.imageUrl(summary.right.path) : "";

  /* ------------------------------------------------- difference map */

  const renderDifference = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !leftUrl || !rightUrl) return;
    const [left, right] = await Promise.all([load(leftUrl), load(rightUrl)]).catch(() => [null, null]);
    if (!left || !right) return;

    const width = Math.max(left.naturalWidth, right.naturalWidth);
    const height = Math.max(left.naturalHeight, right.naturalHeight);
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const pixelsOf = (image: HTMLImageElement) => {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height);
    };
    const a = pixelsOf(left);
    const b = pixelsOf(right);

    const out = context.createImageData(width, height);
    let different = 0;
    for (let index = 0; index < out.data.length; index += 4) {
      const delta = Math.max(
        Math.abs(a.data[index] - b.data[index]),
        Math.abs(a.data[index + 1] - b.data[index + 1]),
        Math.abs(a.data[index + 2] - b.data[index + 2]),
        Math.abs(a.data[index + 3] - b.data[index + 3]),
      );
      if (delta > 8) {
        different += 1;
        // Changed pixels in red, at the strength of the change.
        out.data[index] = 255;
        out.data[index + 1] = 60;
        out.data[index + 2] = 60;
        out.data[index + 3] = Math.min(255, 90 + delta);
      } else {
        // Unchanged pixels as a dim grey ghost, so the shape is still readable.
        const grey = (a.data[index] + a.data[index + 1] + a.data[index + 2]) / 3;
        out.data[index] = grey * 0.3;
        out.data[index + 1] = grey * 0.3;
        out.data[index + 2] = grey * 0.3;
        out.data[index + 3] = a.data[index + 3] ? 90 : 0;
      }
    }
    context.putImageData(out, 0, 0);
    setStats({ width, height, different });
  }, [leftUrl, rightUrl]);

  useEffect(() => {
    if (mode === "difference") void renderDifference();
  }, [mode, renderDifference]);

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
            title={t(`image.${item === "sideBySide" ? "sideBySide" : item}` as Parameters<typeof t>[0])}
            onClick={() => setMode(item)}
          >
            <Icon name={item === "difference" ? "modified" : item === "blend" ? "image" : "columns"} size={14} />
            <span>{t(`image.${item}` as Parameters<typeof t>[0])}</span>
          </button>
        ))}

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
          {stats ? ` — ${stats.width}×${stats.height}, ${stats.different.toLocaleString()} px` : ""}
        </span>
      </div>

      <div className={`image-stage mode-${mode}`} data-testid="image-stage">
        {mode === "sideBySide" ? (
          <>
            <div className="image-pane"><Picture url={leftUrl} side="left" /></div>
            <div className="image-pane"><Picture url={rightUrl} side="right" /></div>
          </>
        ) : null}

        {mode === "blend" ? (
          <div className="image-blend">
            {leftUrl ? <img src={leftUrl} alt="left" /> : null}
            {rightUrl ? <img src={rightUrl} alt="right" style={{ opacity: blend / 100 }} /> : null}
          </div>
        ) : null}

        {mode === "difference" ? (
          <div className="image-blend">
            <canvas ref={canvasRef} />
          </div>
        ) : null}
      </div>
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
function Picture({ url, side }: { url: string; side: "left" | "right" }) {
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
  return <img src={url} alt={side} onError={() => setFailed(true)} />;
}
function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}
