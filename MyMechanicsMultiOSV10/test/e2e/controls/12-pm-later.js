//@step {"name": "pm: feature types added after this file was written — each opens and every control applies", "expect": "^ok"}
return (async () => {
  const known = new Set(__KNOWN_TYPES__);
  const out = [];
  for (const t of window.__featureTypes.filter((x) => !known.has(x))) { out.push(await window.__pmCheck(t, 'num')); out.push(await window.__pmCheck(t, 'opts')); }
  const bad = out.filter((x) => !/^\S+ ok/.test(x));
  return bad.length ? bad.join(' || ') : `ok ${out.length / 2} more types`;
})()
