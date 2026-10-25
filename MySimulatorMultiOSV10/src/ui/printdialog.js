// The print window: page settings on the left (paper, orientation, margins, what to print, header and footer,
// colour, font size), a live preview of the pages on the right. Printing writes the same HTML into a hidden
// frame with the matching @page rule and opens the system print dialog (printer and copies are chosen there).
import { h, replace, numberField } from './dom.js';
import { getLanguage } from '../core/i18n.js';
import { popup, reportHtml } from './dialogs.js';

export const PAPERS = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
};
export const MARGIN_PRESETS = { none: 0, narrow: 6.35, normal: 15, wide: 25 };

const STR = {
  ko: {
    title: '인쇄', page: '용지', paper: '용지 크기', orientation: '방향', portrait: '세로', landscape: '가로',
    margins: '여백', marginPreset: '여백 크기', none: '없음', narrow: '좁게', normal: '보통', wide: '넓게', custom: '사용자 지정',
    top: '위', bottom: '아래', left: '왼쪽', right: '오른쪽',
    content: '인쇄할 내용', docTitle: '제목과 설명', viewport: '현재 보기 그림', legend: '색 범례', chart: '결과 차트', model: '파이프라인 (노드·연결·설정)',
    results: '결과 값·차트·표', log: '실행 기록 (경고·오류)', imageSize: '그림 폭',
    headerFooter: '머리글·바닥글', header: '머리글', footerDate: '바닥글에 날짜', pageNumbers: '쪽 번호',
    appearance: '모양', color: '색', colorFull: '컬러', gray: '흑백', fontSize: '글자 크기',
    preview: '미리보기', pages: (n) => `${n}쪽`, print: '인쇄', cancel: '취소',
    note: '프린터와 매수는 다음에 열리는 시스템 인쇄 창에서 고릅니다.',
  },
  en: {
    title: 'Print', page: 'Paper', paper: 'Paper size', orientation: 'Orientation', portrait: 'Portrait', landscape: 'Landscape',
    margins: 'Margins', marginPreset: 'Margin size', none: 'None', narrow: 'Narrow', normal: 'Normal', wide: 'Wide', custom: 'Custom',
    top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right',
    content: 'What to print', docTitle: 'Title and description', viewport: 'Current view picture', legend: 'Colour legend', chart: 'Result chart', model: 'Pipeline (nodes, links, settings)',
    results: 'Result values, charts, tables', log: 'Run log (warnings, errors)', imageSize: 'Picture width',
    headerFooter: 'Header and footer', header: 'Header', footerDate: 'Date in the footer', pageNumbers: 'Page numbers',
    appearance: 'Appearance', color: 'Colour', colorFull: 'Colour', gray: 'Greyscale', fontSize: 'Font size',
    preview: 'Preview', pages: (n) => `${n} page${n === 1 ? '' : 's'}`, print: 'Print', cancel: 'Cancel',
    note: 'The printer and the number of copies are chosen in the system print dialog that opens next.',
  },
};

export const DEFAULT_PRINT = {
  paper: 'A4', orientation: 'portrait', marginPreset: 'normal', margins: { top: 15, right: 15, bottom: 15, left: 15 },
  title: true, viewport: true, legend: false, chart: true, model: true, results: true, log: true, imageSize: 100,
  header: '', footerDate: true, pageNumbers: true, grayscale: false, fontSize: 10,
};

let last = null;

/** Paper size in mm after the orientation: [width, height]. */
export function pageSize(opts) {
  const [w, hgt] = PAPERS[opts.paper] ?? PAPERS.A4;
  return opts.orientation === 'landscape' ? [hgt, w] : [w, hgt];
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The printable document. sources: { doc, image, legend: { lo, hi, unit, stops, ticks } | null, chart }.
 * preview: no @page margin boxes (the preview draws its own page frames), the margins become padding.
 */
export function printHtml(app, sources, opts, preview = false) {
  const [pw, ph] = pageSize(opts);
  const m = opts.margins;
  const { doc } = sources;
  const legend = opts.legend && sources.legend
    ? `<div class="legend"><div class="lt">${esc(sources.legend.unit)}</div><div class="lb"><div class="bar" style="background:linear-gradient(0deg, ${sources.legend.stops.join(', ')})"></div><div class="ticks">${sources.legend.ticks.map((tk) => `<span style="bottom:${tk.at}%">${esc(tk.text)}</span>`).join('')}</div></div></div>`
    : '';
  const figure = opts.viewport && sources.image
    ? `<div class="figure"><img src="${sources.image}" style="width:${opts.imageSize}%">${legend}</div>` : legend ? `<div class="figure">${legend}</div>` : '';
  const chart = opts.chart && sources.chart ? `<div class="chart"><img src="${sources.chart}"></div>` : '';
  const report = reportHtml(app, doc, { title: false, model: opts.model, results: opts.results, log: opts.log });
  const title = opts.title ? `<h1>${esc(doc.model.name)}</h1>${doc.model.description ? `<p class="desc">${esc(doc.model.description)}</p>` : ''}` : '';
  const header = opts.header.trim();
  const footer = [opts.footerDate ? new Date().toLocaleString(getLanguage() === 'en' ? 'en-GB' : 'ko-KR') : '', 'MySimulator'].filter(Boolean).join(' · ');
  const marginBoxes = preview ? '' : `
    ${header ? `@top-center { content: "${header.replace(/"/g, '\\"')}"; font: 9pt "Segoe UI", sans-serif; color: #556; }` : ''}
    @bottom-left { content: "${footer.replace(/"/g, '\\"')}"; font: 8pt "Segoe UI", sans-serif; color: #889; }
    ${opts.pageNumbers ? '@bottom-right { content: counter(page) " / " counter(pages); font: 8pt "Segoe UI", sans-serif; color: #889; }' : ''}`;
  const css = `
    @page { size: ${pw}mm ${ph}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; ${marginBoxes} }
    html, body { margin: 0; background: #fff; }
    body { font: ${opts.fontSize}pt "Segoe UI", "Malgun Gothic", sans-serif; color: #1c2833; ${opts.grayscale ? 'filter: grayscale(1);' : ''}
      ${preview ? `width: ${pw}mm; box-sizing: border-box; padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;` : ''}
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { font-size: 1.7em; margin: 0 0 2mm; } h2 { font-size: 1.15em; color: #1478b8; margin: 4mm 0 1.5mm; break-after: avoid; }
    p { margin: 1mm 0; } .desc { color: #445; }
    table { border-collapse: collapse; margin: 1.5mm 0; width: 100%; break-inside: auto; } tr { break-inside: avoid; }
    th, td { border: 1px solid #d5dee8; padding: 0.6mm 2mm; text-align: left; } td.num { text-align: right; } th { background: #eef3f8; }
    .figure { display: flex; gap: 4mm; align-items: stretch; margin: 2mm 0; break-inside: avoid; }
    .figure img { flex: 0 1 auto; min-width: 0; height: auto; max-height: ${Math.round((ph - m.top - m.bottom) * 0.62)}mm; object-fit: contain; border: 1px solid #c9d3de; }
    .legend { flex: 0 0 auto; display: flex; flex-direction: column; gap: 1mm; font-size: 0.85em; }
    .legend .lb { position: relative; display: flex; gap: 1.5mm; flex: 1; min-height: 40mm; }
    .legend .bar { width: 5mm; border: 1px solid #889; }
    .legend .ticks { position: relative; width: 14mm; } .legend .ticks span { position: absolute; left: 0; transform: translateY(50%); white-space: nowrap; }
    .chart { margin: 2mm 0; break-inside: avoid; } .chart img { max-width: 100%; border: 1px solid #c9d3de; }
    .run { display: none; }
    ${preview ? `.run { display: flex; justify-content: space-between; color: #889; font-size: 8pt; } html { overflow: hidden; }` : ''}`;
  const top = preview && header ? `<div class="run run-head" style="justify-content:center;margin-bottom:3mm">${esc(header)}</div>` : '';
  return `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><title>${esc(doc.model.name)}</title><style>${css}</style></head><body>${top}${title}${figure}${chart}${report}</body></html>`;
}

/** Opens the print window. sources() collects the pictures from the live views when the window opens. */
export function showPrint(app, sources) {
  const S = STR[getLanguage() === 'en' ? 'en' : 'ko'];
  const src = sources();
  if (!src) return;
  const opts = structuredClone(last ?? DEFAULT_PRINT);
  if (!opts.header) opts.header = src.doc.model.name ?? '';
  const settings = h('div', { className: 'print-settings scroll', dataset: { testid: 'print-settings' } });
  const pageCount = h('span', { className: 'muted', dataset: { testid: 'print-pages' } });
  const stage = h('div', { className: 'print-stage', dataset: { testid: 'print-preview' } });
  const MM = 96 / 25.4;
  let timer = 0;

  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(renderPreview, 60);
  };
  const renderPreview = () => {
    const [pw, ph] = pageSize(opts);
    const frame = h('iframe', { className: 'print-frame', title: S.preview, tabIndex: -1 });
    const pagePx = { w: pw * MM, h: ph * MM };
    const scale = Math.max(0.1, (stage.clientWidth - 28) / pagePx.w);
    frame.style.width = `${pagePx.w}px`;
    frame.style.height = `${pagePx.h}px`;
    frame.style.transform = `scale(${scale})`;
    const holder = h('div', { className: 'print-pages' });
    replace(stage, holder);
    const html = printHtml(app, src, opts, true);
    frame.addEventListener('load', () => {
      const body = frame.contentDocument?.body;
      if (!body) return;
      // The content flows over pages of the content height; draw a page frame for each. The measuring frame
      // stays hidden where it is (moving an iframe reloads it); every page gets its own copy, shifted up.
      const fullH = body.scrollHeight;
      const contentH = (ph - opts.margins.top - opts.margins.bottom) * MM;
      const flowH = fullH - (opts.margins.top + opts.margins.bottom) * MM;
      const count = Math.max(1, Math.ceil((flowH - 1) / Math.max(1, contentH)));
      pageCount.textContent = S.pages(count);
      replace(holder, frame, ...Array.from({ length: count }, (_, i) => {
        const copy = h('iframe', { className: 'print-copy', title: `${S.preview} ${i + 1}`, tabIndex: -1, srcdoc: html,
          style: { width: `${pagePx.w}px`, height: `${fullH}px`, marginTop: `${-(opts.margins.top * MM + i * contentH)}px` } });
        return h('div', { className: 'print-page', dataset: { testid: `print-page-${i + 1}` }, style: { width: `${pagePx.w * scale}px`, height: `${pagePx.h * scale}px` } },
          h('div', { className: 'print-sheet', style: { width: `${pagePx.w}px`, height: `${pagePx.h}px`, transform: `scale(${scale})` } },
            h('div', { className: 'print-clip', style: { top: `${opts.margins.top * MM}px`, left: '0', right: '0', height: `${contentH}px` } }, copy),
            h('div', { className: 'print-foot', style: { bottom: `${Math.max(2, opts.margins.bottom / 2 - 2) * MM}px`, left: `${opts.margins.left * MM}px`, right: `${opts.margins.right * MM}px` } },
              h('span', null, opts.footerDate ? new Date().toLocaleDateString() : ''), h('span', null, opts.pageNumbers ? `${i + 1} / ${count}` : ''))));
      }));
    }, { once: true });
    frame.srcdoc = html;
    holder.append(frame);
  };

  const patch = (p) => { Object.assign(opts, p); renderSettings(); refresh(); };
  const choice = (value, items, onChange, testid) => h('select', { value, dataset: testid ? { testid } : undefined, onChange: (e) => onChange(e.target.value) },
    ...items.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
  const check = (key, label) => h('label', { className: 'print-check' },
    h('input', { type: 'checkbox', checked: opts[key], dataset: { testid: `print-${key}` }, onChange: (e) => patch({ [key]: e.target.checked }) }), h('span', null, label));
  const row = (label, ...control) => h('div', { className: 'row print-row' }, h('label', null, label), ...control);
  const group = (title, ...children) => h('fieldset', { className: 'field-group' }, h('legend', null, title), ...children);
  const renderSettings = () => {
    const [pw, ph] = pageSize(opts);
    replace(settings,
      group(S.page,
        row(S.paper, choice(opts.paper, Object.keys(PAPERS).map((k) => [k, `${k} (${PAPERS[k][0]} × ${PAPERS[k][1]} mm)`]), (v) => patch({ paper: v }), 'print-paper')),
        row(S.orientation, h('div', { className: 'segmented' }, ...['portrait', 'landscape'].map((o) => h('button', {
          type: 'button', className: opts.orientation === o ? 'on' : null, dataset: { testid: `print-${o}` }, onClick: () => patch({ orientation: o }),
        }, o === 'portrait' ? '▯ ' : '▭ ', S[o])))),
        h('p', { className: 'part-help' }, `${Math.round(pw * 10) / 10} × ${Math.round(ph * 10) / 10} mm`)),
      group(S.margins,
        row(S.marginPreset, choice(opts.marginPreset, [...Object.keys(MARGIN_PRESETS).map((k) => [k, `${S[k]} (${MARGIN_PRESETS[k]} mm)`]), ['custom', S.custom]], (v) => {
          if (v === 'custom') patch({ marginPreset: v });
          else { const mm = MARGIN_PRESETS[v]; patch({ marginPreset: v, margins: { top: mm, right: mm, bottom: mm, left: mm } }); }
        }, 'print-margin-preset')),
        h('div', { className: 'print-margins' }, ...['top', 'bottom', 'left', 'right'].map((side) => row(S[side], numberField({
          value: opts.margins[side], min: 0, max: 60, step: 1, suffix: 'mm',
          onChange: (v) => patch({ marginPreset: 'custom', margins: { ...opts.margins, [side]: Math.max(0, Math.min(60, v)) } }),
        }))))),
      group(S.content,
        check('title', S.docTitle), check('viewport', S.viewport),
        opts.viewport ? row(S.imageSize, numberField({ value: opts.imageSize, min: 30, max: 100, step: 5, suffix: '%', onChange: (v) => patch({ imageSize: Math.max(30, Math.min(100, Math.round(v))) }) })) : null,
        check('legend', S.legend), check('chart', S.chart), check('model', S.model), check('results', S.results), check('log', S.log)),
      group(S.headerFooter,
        row(S.header, h('input', { type: 'text', value: opts.header, dataset: { testid: 'print-header' }, onChange: (e) => patch({ header: e.target.value }) })),
        check('footerDate', S.footerDate), check('pageNumbers', S.pageNumbers)),
      group(S.appearance,
        row(S.color, choice(opts.grayscale ? 'gray' : 'color', [['color', S.colorFull], ['gray', S.gray]], (v) => patch({ grayscale: v === 'gray' }), 'print-color')),
        row(S.fontSize, numberField({ value: opts.fontSize, min: 7, max: 16, step: 1, suffix: 'pt', onChange: (v) => patch({ fontSize: Math.max(7, Math.min(16, Math.round(v))) }) }))),
      h('p', { className: 'part-help' }, S.note));
  };

  const doPrint = (close) => {
    last = structuredClone(opts);
    const frame = h('iframe', { style: { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' } });
    document.body.append(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(printHtml(app, src, opts, false));
    frame.contentDocument.close();
    close();
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1000);
    }, 250);
  };

  renderSettings();
  const body = h('div', { className: 'print-layout' }, settings,
    h('div', { className: 'print-right' }, h('div', { className: 'print-bar' }, h('strong', null, S.preview), pageCount), stage));
  const width = Math.min(1100, window.innerWidth - 40);
  const height = Math.min(760, window.innerHeight - 40);
  popup({
    id: 'print', title: S.title, icon: '🖨️', width, height, body,
    actions: [
      { label: S.cancel, testid: 'print-cancel' },
      { label: `🖨️ ${S.print}`, primary: true, testid: 'print-go', onClick: doPrint },
    ],
  });
  requestAnimationFrame(renderPreview);
  return { opts, refresh };
}
