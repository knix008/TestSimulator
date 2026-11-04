// Stroke icons in the My Git Master manner: 24-unit paths, one hue per icon (icons.css),
// the first shape carrying a light wash of the same colour.
import { PATHS } from "./icons-names.js";

/** The country whose language a click switches to. */
export function Flag({ country }) {
  return (
    <span className="flag-slot" data-flag={country}>
      {country === "gb" ? (
        <svg className="flag" viewBox="0 0 60 30" width="18" height="12" aria-hidden="true">
          <defs>
            <clipPath id="flag-gb-bounds"><rect width="60" height="30" /></clipPath>
            <clipPath id="flag-gb-offset"><path d="M30 15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
          </defs>
          <g clipPath="url(#flag-gb-bounds)">
            <path d="M0 0v30h60V0z" fill="#012169" />
            <path d="M0 0 60 30M60 0 0 30" stroke="#fff" strokeWidth="6" />
            <path d="M0 0 60 30M60 0 0 30" clipPath="url(#flag-gb-offset)" stroke="#C8102E" strokeWidth="4" />
            <path d="M-1 11h27v-12h8v12h27v8H34v12h-8V19H-1z" fill="#C8102E" stroke="#FFF" strokeWidth="2" />
          </g>
        </svg>
      ) : (
        <svg className="flag" viewBox="-72 -48 144 96" width="18" height="12" aria-hidden="true">
          <path fill="#fff" d="M-72-48v96H72v-96z" />
          <g stroke="#000" strokeWidth="4" fill="none">
            <path transform="rotate(33.69006752598)" d="M-50-12v24m6 0v-24m6 0v24m76 0V1m0-2v-11m6 0v11m0 2v11m6 0V1m0-2v-11" />
            <path transform="rotate(-33.69006752598)" d="M-50-12v24m6 0V1m0-2v-11m6 0v24m76 0V1m0-2v-11m6 0v24m6 0V1m0-2v-11" />
          </g>
          <g transform="rotate(33.69006752598)">
            <path fill="#cd2e3a" d="M12 0a18 18 0 11-36 0 24 24 0 1148 0" />
            <path fill="#0047a0" d="M-24 0a24 24 0 1048 0A12 12 0 100 0a12 12 0 11-24 0" />
          </g>
        </svg>
      )}
    </span>
  );
}

export function Icon({ name, size }) {
  const [[tone, body]] = PATHS[name] ?? PATHS.about;
  return (
    <svg
      className="icon"
      data-tone={tone}
      data-icon={name}
      data-duo=""
      viewBox="0 0 24 24"
      style={size ? { width: size, height: size, minWidth: size, minHeight: size, flexBasis: size } : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

