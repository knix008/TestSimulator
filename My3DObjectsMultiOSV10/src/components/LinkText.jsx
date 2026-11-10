import React from 'react';
import { splitLinks } from '../lib/links.js';
import { openExternal } from '../lib/platform.js';

// A message with its web addresses clickable: each opens in the system's web
// browser (desktop: the host's opener; web: a new tab), never inside the app.
export default function LinkText({ text, className }) {
  const parts = splitLinks(text);
  return (
    <>
      {parts.map((p, i) => (p.url ? (
        <a
          key={i}
          className={`text-link${className ? ` ${className}` : ''}`}
          href={p.url}
          title={p.url}
          data-external-link
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternal(p.url).catch?.(() => {});
          }}
        >
          {p.url}
        </a>
      ) : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </>
  );
}
