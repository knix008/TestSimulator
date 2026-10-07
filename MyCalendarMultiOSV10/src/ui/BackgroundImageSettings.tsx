import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  BACKGROUND_WINDOWS,
  backgroundImageOpacityFromTransparency,
  backgroundImageTransparency,
  writeBackgroundImage,
  type BackgroundWindow,
} from "../domain/backgroundImage";
import type { Messages } from "../domain/messages";
import type { Settings } from "../domain/settings";
import { prepareBackgroundImage, useBackgroundImage } from "./BackgroundImage";
import { BellIcon, CalendarIcon, EventsIcon, ImageIcon, PrintIcon, TransparencyIcon, TrashIcon } from "./icons";
import { RangeField } from "./RangeField";

const WINDOW_ICONS: Record<BackgroundWindow, ReactNode> = {
  main: <CalendarIcon />,
  events: <EventsIcon />,
  print: <PrintIcon />,
  reminder: <BellIcon />,
};

export function BackgroundImageSettings({
  settings,
  update,
  t,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  t: Messages;
}) {
  const image = useBackgroundImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const transparency = backgroundImageTransparency(settings.backgroundImageOpacity);

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await prepareBackgroundImage(file);
    } catch (reason) {
      setError(reason instanceof Error && reason.message === "image too large" ? t.backgroundImageTooLarge : t.backgroundImageUnreadable);
      setBusy(false);
      return;
    }
    try {
      writeBackgroundImage(dataUrl);
    } catch {
      setError(t.backgroundImageTooLarge);
    }
    setBusy(false);
  };

  const onRemove = () => {
    setError(null);
    writeBackgroundImage(null);
  };

  return (
    <>
      <label className="field with-icon" htmlFor="background-image-file">
        <ImageIcon />
        {t.backgroundImage}
      </label>
      <div className="background-image-row">
        <span
          className="background-image-thumb"
          role="img"
          aria-label={image ? t.backgroundImage : t.noBackgroundImage}
          style={image ? { backgroundImage: `url("${image}")` } : undefined}
        >
          {!image && t.noBackgroundImage}
        </span>
        <div className="background-image-actions">
          <button type="button" className="text-btn solid" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImageIcon />
            <span>{image ? t.changeBackgroundImage : t.chooseBackgroundImage}</span>
          </button>
          {image && (
            <button type="button" className="text-btn solid danger" disabled={busy} onClick={onRemove}>
              <TrashIcon />
              <span>{t.removeBackgroundImage}</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          id="background-image-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          hidden
          onChange={(event) => void onPick(event)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <label className="field with-icon" htmlFor="background-image-transparency">
        <TransparencyIcon />
        {t.backgroundImageTransparency}
      </label>
      <RangeField
        id="background-image-transparency"
        name={t.backgroundImageTransparency}
        value={transparency}
        min={0}
        max={100}
        buttonStep={5}
        title={t.backgroundImageTransparencyHint}
        t={t}
        onChange={(value) => update({ backgroundImageOpacity: backgroundImageOpacityFromTransparency(value) })}
      />
      <p className="field">{t.backgroundImageWindows}</p>
      <div className="background-image-windows">
        {BACKGROUND_WINDOWS.map((name) => (
          <label key={name} className="check">
            <input
              type="checkbox"
              checked={settings.backgroundImageWindows[name]}
              onChange={(event) =>
                update({ backgroundImageWindows: { ...settings.backgroundImageWindows, [name]: event.target.checked } })
              }
            />
            {WINDOW_ICONS[name]}
            <span>{t.backgroundImageTargets[name]}</span>
          </label>
        ))}
      </div>
      <p className="hint">{t.backgroundImageHint}</p>
    </>
  );
}
