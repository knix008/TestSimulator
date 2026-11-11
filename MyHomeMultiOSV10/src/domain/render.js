// A site as HTML and CSS: the same pages for the editor canvas (with data-* hooks for selecting
// and editing) and for publishing (clean). The CSS is made from the site's design: colours,
// fonts, corner radius, content width; it adapts to tablets (≤ 900 px) and phones (≤ 600 px).
import { esc, pageFile, renderBlock, safeUrl } from './blocks.js';
import { effectiveDesign, FONTS } from './designs.js';

const mixCss = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** The design's style sheet and, after it, the site's own CSS. A saved style.css replaces both. */
export function siteStyles(site) {
  const file = site?.files?.css;
  if (typeof file === 'string' && file.length) return file.endsWith('\n') ? file : `${file}\n`;
  const own = String(site?.code?.css ?? '').trim();
  return own ? `${siteCss(site.design)}\n/* ── site CSS (MyHomeMaker code editor) ── */\n${own}\n` : siteCss(site?.design);
}

/** The site's own JavaScript, safe inside an inline <script> (a literal "</script" would end it). */
export const inlineScript = (js) => String(js ?? '').replace(/<\/(script)/gi, '<\\/$1');

/** The site's style sheet. */
export function siteCss(designRef) {
  const d = effectiveDesign(designRef);
  const heading = FONTS[d.headingFont]?.css ?? FONTS.sans.css;
  const body = FONTS[d.bodyFont]?.css ?? FONTS.sans.css;
  return `:root{--primary:${d.primary};--on-primary:${d.primaryText};--accent:${d.accent};--bg:${d.bg};--surface:${d.surface};--text:${d.text};--muted:${d.muted};--border:${d.border};--header-bg:${d.headerBg};--header-text:${d.headerText};--footer-bg:${d.footerBg};--footer-text:${d.footerText};--radius:${d.radius}px;--width:${d.width}px;--font-heading:${heading};--font-body:${body};--base:${d.baseSize}px;color-scheme:${d.dark ? 'dark' : 'light'}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:var(--base);line-height:1.65;-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:anywhere}
img{max-width:100%;display:block}
a{color:var(--primary)}
h1,h2,h3,h4{font-family:var(--font-heading);line-height:1.25;margin:0 0 .5em;letter-spacing:-.01em}
h1{font-size:clamp(2rem,4.2vw,3.4rem)}
h2{font-size:clamp(1.6rem,3vw,2.4rem)}
h3{font-size:1.2rem}
p{margin:0 0 1em}
.hm-block{position:relative;background-color:var(--bg);padding-top:var(--pt,64px);padding-bottom:var(--pb,64px)}
.hm-wrap{max-width:var(--width);margin:0 auto;padding:0 24px}
.w-narrow>.hm-wrap{max-width:760px}
.w-wide>.hm-wrap{max-width:calc(var(--width) + 240px)}
.w-full>.hm-wrap{max-width:none}
.align-center{text-align:center}
.align-right{text-align:right}
.align-center .hm-actions,.align-center .hm-head{justify-content:center;margin-left:auto;margin-right:auto}
.align-right .hm-actions{justify-content:flex-end}
.tone-surface{background-color:var(--surface)}
.tone-primary{background-color:var(--primary);color:var(--on-primary)}
.tone-accent{background-color:var(--accent);color:${d.dark ? 'var(--bg)' : '#fff'}}
.tone-dark{background-color:${d.dark ? mixCss('var(--surface)', '#000', 70) : mixCss('var(--text)', '#000', 92)};color:#fff}
.tone-footer{background-color:var(--footer-bg);color:var(--footer-text)}
.has-image{color:#fff}
.tone-primary a:not(.hm-btn),.tone-dark a:not(.hm-btn),.tone-accent a:not(.hm-btn),.tone-footer a:not(.hm-btn),.has-image a:not(.hm-btn){color:inherit}
.hm-round-block{border-radius:var(--radius);margin:16px;overflow:hidden}
.hm-head{max-width:720px;margin-bottom:40px}
.hm-title{margin-bottom:.35em;white-space:normal}
.hm-subtitle,.hm-lead{font-size:1.12em;opacity:.8}
.hm-lead{font-size:1.2em;max-width:680px}
.align-center .hm-lead{margin-left:auto;margin-right:auto}
.hm-eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.8em;font-weight:700;color:var(--accent);margin-bottom:.8em}
.has-image .hm-eyebrow,.tone-primary .hm-eyebrow{color:inherit;opacity:.85}
.hm-center{text-align:center}
.hm-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.hm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:.75em 1.5em;border-radius:var(--radius);font-weight:600;text-decoration:none;border:2px solid var(--primary);transition:transform .15s,box-shadow .15s,background-color .15s;cursor:pointer;font:inherit;font-weight:600;line-height:1.2}
.hm-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.14)}
.hm-btn-primary{background:var(--primary);color:var(--on-primary)}
.hm-btn-outline{background:transparent;color:var(--primary)}
.hm-btn-link{border-color:transparent;background:transparent;color:var(--primary);padding-left:0;padding-right:0}
.hm-btn-light{background:#fff;color:#111;border-color:#fff}
.tone-primary .hm-btn-primary,.has-image .hm-btn-primary{background:#fff;color:${d.primary};border-color:#fff}
.tone-primary .hm-btn-outline,.has-image .hm-btn-outline,.tone-dark .hm-btn-outline{color:#fff;border-color:currentColor}
.hm-actions.large .hm-btn{font-size:1.15em;padding:.9em 2em}
.hm-btn-small{font-size:.86em;padding:.5em 1em}
.hm-btn-large{font-size:1.15em;padding:.9em 2em}
.hm-btn-square{border-radius:0}
.hm-btn-round{border-radius:calc(var(--radius) + 8px)}
.hm-btn-pill{border-radius:999px}
.hm-btn-full{display:flex;width:100%}
.hm-btn-icon{line-height:1}
[data-item-accent]{outline:2px solid var(--primary);outline-offset:3px}
.hm-grid{display:grid;gap:24px;grid-template-columns:repeat(3,minmax(0,1fr));text-align:left}
.hm-grid.cols-1{grid-template-columns:minmax(0,1fr)}
.hm-grid.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.hm-grid.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.align-center .hm-grid{text-align:center}
.hm-card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:28px;color:var(--text)}
.tone-surface .hm-card{background:var(--bg)}
.hm-feature .hm-icon{font-size:2.2em;line-height:1;margin-bottom:14px}
.hm-feature p,.hm-card p{color:var(--muted);margin:0}
.hm-media-card{padding:0;overflow:hidden;display:flex;flex-direction:column}
.hm-media-card .hm-card-img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:0}
.hm-card-body{padding:22px}
.hm-card-body h3 a{color:inherit;text-decoration:none}
.hm-more{display:inline-block;margin-top:12px;font-weight:600;text-decoration:none}
.hm-date{color:var(--muted);font-size:.85em}
.hm-rounded{border-radius:var(--radius)}
.hm-shadow{box-shadow:0 24px 60px rgba(0,0,0,.18)}
.hm-img-empty{display:grid;place-items:center;min-height:180px;border-radius:var(--radius);background:${mixCss('var(--primary)', 'transparent', 12)};border:2px dashed ${mixCss('var(--primary)', 'transparent', 40)};font-size:2.4em;color:var(--primary)}
.hm-split{display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:center;text-align:left}
.hm-split.reverse .hm-split-media{order:-1}
.hm-split.single{grid-template-columns:1fr}
.hm-split-media img{width:100%;object-fit:cover}
.hm-hero{min-height:540px;display:flex;align-items:center}
.hm-hero>.hm-wrap{width:100%}
.hm-hero h1{white-space:normal}
.hm-hero-inner{max-width:820px}
.align-center .hm-hero-inner{margin:0 auto}
.hm-prose{max-width:760px}
.align-center .hm-prose{margin:0 auto}
.hm-prose ul,.hm-prose ol{padding-left:1.3em}
.hm-prose li{margin:.25em 0}
.hm-prose code{background:var(--surface);padding:.1em .35em;border-radius:4px}
.hm-figure{margin:0 auto}
.hm-figure img{width:100%}
.hm-figure figcaption,.hm-caption{color:var(--muted);font-size:.9em;margin-top:10px;text-align:center}
.hm-divider{border:0;border-top:1px solid var(--border);margin:0}
.hm-divider-dots{border-top:4px dotted var(--border);width:120px;margin:0 auto}
.hm-divider-short{border-top:3px solid var(--primary);width:64px;margin:0 auto}
.align-left .hm-divider-short,.align-left .hm-divider-dots{margin-left:0}
.hm-quote{margin:0 auto;max-width:760px}
.hm-quote p{font-family:var(--font-heading);font-size:clamp(1.3rem,2.4vw,1.9rem);line-height:1.45;margin-bottom:.8em}
.hm-quote p::before{content:"“";display:block;font-size:3em;line-height:.6;color:var(--accent)}
.hm-quote cite{font-style:normal;color:var(--muted)}
.hm-check{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.hm-check li{display:flex;gap:12px;align-items:baseline}
.hm-mark{color:var(--primary);font-weight:700}
.hm-video{position:relative;aspect-ratio:16/9;border-radius:var(--radius);overflow:hidden;background:#000}
.hm-video iframe,.hm-video video{position:absolute;inset:0;width:100%;height:100%;border:0}
.hm-map{border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)}
.hm-map iframe{width:100%;height:100%;border:0;display:block}
.hm-map.small{height:220px;margin-top:20px}
.hm-steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px;counter-reset:step}
.hm-step-no{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--primary);color:var(--on-primary);font-weight:800;font-size:1.25em;margin-bottom:14px}
.hm-steps p{color:var(--muted)}
.hm-timeline{list-style:none;padding:0;margin:0;border-left:3px solid var(--border)}
.hm-timeline li{display:grid;grid-template-columns:110px 1fr;gap:18px;padding:0 0 28px 24px;position:relative}
.hm-timeline li::before{content:"";position:absolute;left:-9px;top:6px;width:15px;height:15px;border-radius:50%;background:var(--primary)}
.hm-timeline .hm-date{font-weight:700;color:var(--primary);font-size:1em}
.hm-timeline p{color:var(--muted);margin:0}
.hm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:24px}
.hm-stats b{display:block;font-family:var(--font-heading);font-size:clamp(2rem,4vw,3rem);line-height:1.1}
.hm-stats span{opacity:.8}
.hm-faq{display:grid;gap:12px;text-align:left}
.hm-faq details{border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;background:var(--bg)}
.hm-faq summary{font-weight:700;cursor:pointer;list-style-position:outside}
.hm-faq details p{margin:12px 0 0;color:var(--muted)}
.hm-board{text-align:left}
.hm-board-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}
.hm-board-cats{display:flex;flex-wrap:wrap;gap:6px}
.hm-board-cats button,.hm-board-pages button{font:inherit;font-size:.9em;padding:6px 14px;border:1px solid var(--border);border-radius:999px;background:var(--bg);color:var(--text);cursor:pointer}
.hm-board-cats button[aria-pressed="true"],.hm-board-pages button[aria-current]{background:var(--primary);border-color:var(--primary);color:var(--on-primary)}
.hm-board-tools{display:flex;gap:8px;align-items:center}
.hm-board-search{font:inherit;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text);min-width:220px}
.hm-board-table{width:100%;border-collapse:collapse;border-top:2px solid var(--text);font-size:.95em}
.hm-board-table th{font-weight:700;padding:10px 8px;border-bottom:1px solid var(--border);background:var(--surface);white-space:nowrap}
.hm-board-table td{padding:11px 8px;border-bottom:1px solid var(--border);vertical-align:middle}
.hm-board-table .no,.hm-board-table .cat,.hm-board-table .author,.hm-board-table .date,.hm-board-table .views{text-align:center;white-space:nowrap;color:var(--muted)}
.hm-board-table .no{width:64px}.hm-board-table .views{width:64px}.hm-board-table .date{width:110px}
.hm-board-table .subject a{color:var(--text);text-decoration:none;font-weight:600}
.hm-board-table .subject a:hover{color:var(--primary);text-decoration:underline}
.hm-board-table tr.notice td{background:color-mix(in srgb,var(--primary) 7%,transparent)}
.hm-board-badge{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--primary);color:var(--on-primary);font-size:.78em;font-weight:700}
.hm-board-empty{text-align:center;color:var(--muted);padding:24px 0}
.hm-board-pages{display:flex;justify-content:center;gap:6px;margin-top:18px}
.hm-post{margin-top:24px;padding:28px}
.hm-post:not(:target){display:none!important}
.hm-post:target{display:block}
.hm-post header{border-bottom:1px solid var(--border);padding-bottom:14px;margin-bottom:16px}
.hm-post h3{margin:10px 0 6px;font-size:1.4rem}
.hm-post-meta{color:var(--muted);font-size:.9em;margin:0}
.hm-post-body{min-height:80px}
.hm-post footer,.hm-board-actions{display:flex;gap:8px;margin-top:20px}
.hm-board-write label{display:grid;gap:6px}
.hm-board-write select{font:inherit;padding:.7em .9em;border:1px solid var(--border);border-radius:calc(var(--radius) * .7);background:var(--bg);color:var(--text)}
.hm-gallery{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}
.hm-gallery.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.hm-gallery.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.hm-gallery figure{margin:0}
.hm-gallery img,.hm-gallery .hm-img-empty{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius)}
.hm-gallery figcaption{font-size:.88em;color:var(--muted);margin-top:6px}
.hm-testimonial{text-align:left;margin:0;display:flex;flex-direction:column;justify-content:space-between;gap:20px}
.hm-testimonial blockquote{margin:0;font-size:1.05em}
.hm-testimonial figcaption{display:flex;gap:12px;align-items:center}
.hm-testimonial small{display:block;color:var(--muted)}
.hm-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;min-height:0;font-size:1em}
.hm-avatar.big{width:140px;height:140px;margin:0 auto 14px}
.hm-person .hm-role{color:var(--primary);font-weight:600;margin-bottom:.4em}
.hm-person p{color:var(--muted)}
.hm-logos{display:flex;flex-wrap:wrap;gap:28px 48px;justify-content:center;align-items:center}
.hm-logos span{font-weight:800;letter-spacing:.12em;opacity:.55;font-size:1.15em}
.hm-logos img{height:40px;width:auto;opacity:.7}
.hm-plan{display:flex;flex-direction:column;gap:12px;text-align:left}
.hm-plan.featured{border:2px solid var(--primary);box-shadow:0 18px 40px rgba(0,0,0,.12);transform:translateY(-6px)}
.hm-price b{font-family:var(--font-heading);font-size:2.2em}
.hm-price span{color:var(--muted)}
.hm-plan ul{list-style:none;padding:0;margin:0 0 12px;flex:1;display:grid;gap:6px}
.hm-plan li::before{content:"✓ ";color:var(--primary);font-weight:700}
.hm-menu{list-style:none;padding:0;margin:0;display:grid;gap:18px}
.hm-menu li{display:flex;align-items:flex-end;gap:10px}
.hm-menu small{display:block;color:var(--muted)}
.hm-dots{flex:1;border-bottom:2px dotted var(--border);margin-bottom:6px}
.hm-menu-price{font-weight:700;color:var(--primary)}
.hm-events{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.hm-events li{display:flex;gap:20px;align-items:center;border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;background:var(--bg)}
.hm-events h3{margin:0}
.hm-events p{margin:0;color:var(--muted)}
.hm-event-date{display:grid;place-items:center;min-width:84px;padding:10px;border-radius:var(--radius);background:var(--primary);color:var(--on-primary)}
.hm-event-date b{font-size:1.3em}
.hm-contact-info ul{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.hm-contact-info li{display:flex;gap:12px}
.hm-form{display:grid;gap:14px;text-align:left}
.hm-form label{display:grid;gap:6px;font-weight:600;font-size:.92em}
.hm-form input,.hm-form textarea,.hm-inline-form input{font:inherit;padding:.7em .9em;border:1px solid var(--border);border-radius:calc(var(--radius) * .7);background:var(--bg);color:var(--text)}
.hm-inline-form{display:flex;gap:10px;max-width:520px;margin:0 auto;flex-wrap:wrap}
.hm-inline-form input{flex:1;min-width:200px}
.hm-notice{margin:0;font-weight:600}
.hm-notice a{margin-left:8px}
.hm-social-pills{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.hm-social-pills a{padding:.55em 1.2em;border-radius:999px;border:1px solid var(--border);text-decoration:none;font-weight:600}
.hm-html{max-width:100%;overflow:auto}
/* header */
.hm-navbar{background:var(--header-bg);color:var(--header-text);z-index:50;border-bottom:1px solid var(--border)}
.hm-navbar.hm-sticky{position:sticky;top:0}
.hm-nav{display:flex;align-items:center;gap:24px}
.hm-nav-center .hm-nav{flex-direction:column;gap:10px}
.hm-brand{display:flex;align-items:center;gap:10px;font-family:var(--font-heading);font-weight:800;font-size:1.25em;color:inherit;text-decoration:none;white-space:nowrap}
.hm-logo{height:36px;width:auto}
.hm-links{display:flex;align-items:center;gap:22px;margin-left:auto;flex-wrap:wrap}
.hm-nav-center .hm-links{margin-left:0;justify-content:center}
.hm-links a:not(.hm-btn){color:inherit;text-decoration:none;opacity:.8;font-weight:500}
.hm-links a.active,.hm-links a:not(.hm-btn):hover{opacity:1;color:var(--primary)}
.hm-links .hm-btn{padding:.5em 1.1em}
.hm-nav-toggle,.hm-burger{display:none}
/* footer */
.hm-footer{background:var(--footer-bg);color:var(--footer-text)}
.hm-footer a{color:inherit;text-decoration:none;opacity:.85}
.hm-footer a:hover{opacity:1;text-decoration:underline}
.hm-footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1.2fr;gap:40px;text-align:left}
.hm-footer-brand{display:block;font-family:var(--font-heading);font-size:1.2em;margin-bottom:10px}
.hm-footer-grid p{margin:0 0 6px;opacity:.85}
.hm-footer-links{display:grid;gap:6px;align-content:start}
.hm-social{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px}
.hm-copy{margin:36px 0 0;padding-top:20px;border-top:1px solid ${mixCss('var(--footer-text)', 'transparent', 18)};font-size:.85em;opacity:.7}
.hm-hidden{opacity:.35}
@media (max-width:900px){
.hm-grid.cols-3,.hm-grid.cols-4,.hm-gallery.cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}
.hm-split{grid-template-columns:1fr;gap:32px}
.hm-split.reverse .hm-split-media{order:0}
.hm-footer-grid{grid-template-columns:1fr 1fr}
.hm-hero{min-height:440px}
}
@media (max-width:600px){
.hm-board-table .cat,.hm-board-table .author,.hm-board-table .views{display:none}.hm-board-search{min-width:0;width:100%}.hm-board-tools{width:100%}
body{font-size:calc(var(--base) - 1px)}
.hm-wrap{padding:0 18px}
.hm-grid,.hm-grid.cols-2,.hm-grid.cols-3,.hm-grid.cols-4,.hm-gallery,.hm-gallery.cols-2,.hm-gallery.cols-3,.hm-gallery.cols-4{grid-template-columns:minmax(0,1fr)}
.hm-footer-grid{grid-template-columns:1fr}
.hm-hide-mobile{display:none}
.hm-block{padding-top:min(var(--pt,64px),64px);padding-bottom:min(var(--pb,64px),64px)}
.hm-timeline li{grid-template-columns:1fr;gap:4px}
.hm-burger{display:grid;gap:5px;margin-left:auto;cursor:pointer;padding:6px}
.hm-burger i{display:block;width:24px;height:2px;background:currentColor;border-radius:2px}
.hm-links{display:none;width:100%;flex-direction:column;align-items:flex-start;gap:12px;padding:12px 0}
.hm-nav{flex-wrap:wrap}
.hm-nav-toggle:checked~.hm-links{display:flex}
.hm-nav-center .hm-nav{flex-direction:row}
.hm-hero{min-height:380px}
.hm-plan.featured{transform:none}
}`;
}

/** Extra rules on the editor canvas only: links do nothing, frames and forms do not take the mouse, hidden blocks show faded. */
export const EDITOR_CSS = `
[data-item-hidden]{opacity:.35;outline:1px dashed currentColor;outline-offset:2px}
html,body{min-height:100%}
body.hm-editor{cursor:default}
body.hm-editor a{cursor:default}
body.hm-editor iframe,body.hm-editor video,body.hm-editor input,body.hm-editor textarea,body.hm-editor select,body.hm-editor .hm-nav-toggle{pointer-events:none}
body.hm-editor [data-edit]{cursor:text}
body.hm-editor [data-edit]:hover{outline:1px dashed color-mix(in srgb,#3b82f6 60%,transparent);outline-offset:2px}
::highlight(hm-spell){text-decoration:underline wavy #e5484d;text-decoration-thickness:1.5px;text-underline-offset:3px}
::highlight(hm-problem){background-color:rgba(255,190,0,.55);color:inherit}
.hm-problem-flash{outline:3px solid #f59f00 !important;outline-offset:3px;animation:hm-problem-pulse .45s ease-in-out 3}
@keyframes hm-problem-pulse{50%{outline-color:transparent}}
body.hm-editor [data-edit][contenteditable="true"]{outline:2px solid #3b82f6;outline-offset:3px;cursor:text;user-select:text;-webkit-user-select:text;background:color-mix(in srgb,#3b82f6 8%,transparent)}
body.hm-editor [data-edit-image]{cursor:pointer}
body.hm-editor .hm-sticky{position:relative}
.hm-empty-page{padding:120px 24px;text-align:center;color:#8a94a6;font-family:system-ui,sans-serif;border:2px dashed #c4cbd8;margin:24px;border-radius:16px}
.hm-empty-page b{display:block;font-size:22px;color:#4b5565;margin-bottom:8px}
.hm-hidden{opacity:.35;filter:grayscale(1)}
`;

/** The parts of a page's <body>: header, its blocks, footer. */
export function pageBody(site, page, { editor = false, L = site.meta?.language ?? 'ko', emptyText = null } = {}) {
  const ctx = { editor, site, page, pages: site.pages, L };
  const header = site.layout?.header ? renderBlock(site.layout.header, ctx) : '';
  const footer = site.layout?.footer ? renderBlock(site.layout.footer, ctx) : '';
  const blocks = page.blocks.map((block) => renderBlock(block, ctx)).join('\n');
  const empty = editor && !page.blocks.length && emptyText ? `<div class="hm-empty-page" data-empty-page><b>${esc(emptyText[0])}</b>${esc(emptyText[1])}</div>` : '';
  return `${header}\n<main>\n${blocks}${empty}\n</main>\n${footer}`;
}

/** A complete page for publishing. `css`: the style sheet's file name (linked) or null (inline). */
export function pageHtml(site, page, { css = 'style.css', generator = 'MyHomeMaker' } = {}) {
  const meta = site.meta ?? {};
  const siteTitle = meta.title || site.name || '';
  const isHome = page.slug === 'index';
  const title = page.title || (isHome ? siteTitle : `${page.name} | ${siteTitle}`);
  const description = page.description || meta.description || '';
  const style = css ? `<link rel="stylesheet" href="${esc(css)}" />` : `<style>${siteStyles(site)}</style>`;
  const head = String(site.code?.head ?? '').trim();
  const js = String(site.code?.js ?? '').trim();
  const script = js ? (css ? '<script src="script.js"></script>\n' : `<script>\n${inlineScript(js)}\n</script>\n`) : '';
  const icon = meta.favicon ? `<link rel="icon" href="${esc(safeUrl(meta.favicon))}" />` : '';
  return `<!doctype html>
<html lang="${esc(meta.language === 'en' ? 'en' : 'ko')}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}" />\n` : ''}${meta.keywords ? `<meta name="keywords" content="${esc(meta.keywords)}" />\n` : ''}${meta.author ? `<meta name="author" content="${esc(meta.author)}" />\n` : ''}<meta property="og:title" content="${esc(title)}" />
${description ? `<meta property="og:description" content="${esc(description)}" />\n` : ''}<meta name="generator" content="${esc(generator)}" />
${icon}${style}
${head ? `${head}\n` : ''}</head>
<body>
${pageBody(site, page)}
${script}</body>
</html>
`;
}

export { pageFile };
