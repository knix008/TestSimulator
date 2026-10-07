import { useEffect, useState } from "react";
import {
  BACKGROUND_IMAGE_EVENT,
  BACKGROUND_IMAGE_KEY,
  readBackgroundImage,
  type BackgroundWindow,
} from "../domain/backgroundImage";
import type { Settings } from "../domain/settings";

/** The stored image as a data URL, following changes made in any window. */
export function useBackgroundImage(): string | null {
  const [image, setImage] = useState(readBackgroundImage);
  useEffect(() => {
    const refresh = () => setImage(readBackgroundImage());
    const onStorage = (event: StorageEvent) => {
      if (event.key === BACKGROUND_IMAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener(BACKGROUND_IMAGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BACKGROUND_IMAGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return image;
}

/** A blob URL keeps the multi-megabyte data URL out of every style comparison. */
function useImageUrl(image: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) {
      setUrl(null);
      return;
    }
    if (typeof URL.createObjectURL !== "function") {
      setUrl(image);
      return;
    }
    const [head, body] = image.split(",", 2);
    const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: head.slice(5, head.indexOf(";")) }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);
  return url;
}

/** Sits behind the panel's content and above its themed background. */
export function PanelBackdrop({ settings, target }: { settings: Settings; target: BackgroundWindow }) {
  const image = useBackgroundImage();
  const enabled = Boolean(image) && settings.backgroundImageWindows[target] && settings.backgroundImageOpacity > 0;
  const url = useImageUrl(enabled ? image : null);
  if (!enabled || !url) return null;
  return (
    <div
      className="panel-backdrop"
      aria-hidden="true"
      data-testid="panel-backdrop"
      style={{ backgroundImage: `url("${url}")`, opacity: settings.backgroundImageOpacity }}
    />
  );
}

const MAX_EDGE = 2560;
/** About 3.6 MB of base64, which leaves room in the 5 MB localStorage of WebView2 and browsers. */
const MAX_LENGTH = 3_600_000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable image"));
    };
    image.src = url;
  });
}

/** Shrinks a picked file to a JPEG data URL small enough to keep in localStorage. */
export async function prepareBackgroundImage(file: Blob): Promise<string> {
  const image = await loadImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error("unreadable image");
  let scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  let quality = 0.86;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_LENGTH) return dataUrl;
    scale *= 0.75;
    quality = Math.max(0.7, quality - 0.05);
  }
  throw new Error("image too large");
}
