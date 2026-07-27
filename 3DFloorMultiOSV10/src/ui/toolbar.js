import { icons } from './icons.js';
import { t } from '../i18n/index.js';

const TOOLBAR_ACTIONS = [
  { id: 'tbImage', labelKey: 'tb.image', titleKey: 'tb.imageTitle', icon: 'image' },
  { id: 'tbModel', labelKey: 'tb.model', titleKey: 'tb.modelTitle', icon: 'model' },
  { id: 'tbConvert', labelKey: 'tb.convert', titleKey: 'tb.convertTitle', icon: 'convert', primary: true },
  { id: 'tbSave', labelKey: 'tb.save', titleKey: 'tb.saveTitle', icon: 'save' },
  { type: 'sep' },
  { id: 'tbRotate', labelKey: 'tb.rotate', titleKey: 'tb.rotateTitle', icon: 'rotate', group: 'transform', value: 'rotate' },
  { id: 'tbScale', labelKey: 'tb.scale', titleKey: 'tb.scaleTitle', icon: 'scale', group: 'transform', value: 'scale' },
  { type: 'sep' },
  { id: 'tbAxes', labelKey: 'tb.axes', titleKey: 'tb.axesTitle', icon: 'axes', toggle: true },
  { id: 'tbGrid', labelKey: 'tb.grid', titleKey: 'tb.gridTitle', icon: 'grid', toggle: true },
  { id: 'tbLight', labelKey: 'tb.light', titleKey: 'tb.lightTitle', icon: 'light', toggle: true },
  { id: 'tbReset', labelKey: 'tb.reset', titleKey: 'tb.resetTitle', icon: 'reset' },
  { type: 'sep' },
  { id: 'tbTheme', labelKey: 'tb.theme', titleKey: 'tb.themeTitle', icon: 'moon' },
  { id: 'tbLang', labelKey: 'tb.lang', titleKey: 'tb.langTitle', icon: 'lang' },
  { type: 'grow' },
  { id: 'tbInfo', labelKey: 'tb.info', titleKey: 'tb.infoTitle', icon: 'info' },
];

export function mountToolbar(root) {
  const bar = document.createElement('header');
  bar.className = 'toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.dataset.i18nAria = 'toolbar.aria';
  bar.setAttribute('aria-label', t('toolbar.aria'));

  const group = document.createElement('div');
  group.className = 'toolbar-actions';

  for (const item of TOOLBAR_ACTIONS) {
    if (item.type === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'toolbar-sep';
      sep.setAttribute('role', 'separator');
      group.appendChild(sep);
      continue;
    }
    if (item.type === 'grow') {
      const grow = document.createElement('div');
      grow.className = 'toolbar-grow';
      grow.setAttribute('aria-hidden', 'true');
      group.appendChild(grow);
      continue;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = item.id;
    btn.className = `toolbar-btn${item.primary ? ' primary' : ''}`;
    btn.dataset.labelKey = item.labelKey;
    btn.dataset.titleKey = item.titleKey;
    btn.dataset.icon = item.icon;
    btn.title = t(item.titleKey);
    btn.dataset.action = item.id;
    if (item.group) btn.dataset.group = item.group;
    if (item.value) btn.dataset.value = item.value;
    if (item.toggle) btn.dataset.toggle = 'true';
    btn.innerHTML = `${icons[item.icon]}<span data-i18n="${item.labelKey}">${t(item.labelKey)}</span>`;
    group.appendChild(btn);
  }

  bar.appendChild(group);
  root.prepend(bar);
  return bar;
}

export function setToolbarActive(group, value) {
  document.querySelectorAll(`.toolbar-btn[data-group="${group}"]`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

export function setToolbarToggle(id, on) {
  const btn = document.getElementById(id);
  if (btn) btn.classList.toggle('active', Boolean(on));
}

export function updateThemeToolbarButton(theme) {
  const btn = document.getElementById('tbTheme');
  if (!btn) return;
  // Show the theme you can switch TO (not the current one)
  const toLight = theme !== 'light';
  const label = t(toLight ? 'tb.themeLight' : 'tb.themeDark');
  btn.innerHTML = `${icons[toLight ? 'sun' : 'moon']}<span>${label}</span>`;
  btn.title = t(toLight ? 'tb.themeToLight' : 'tb.themeToDark');
  btn.classList.toggle('active', false);
}

export function updateLangToolbarButton(locale) {
  const btn = document.getElementById('tbLang');
  if (!btn) return;
  // Show the language you can switch TO (not the current one)
  const toEnglish = locale !== 'en';
  const label = toEnglish ? t('tb.langToEn') : t('tb.langToKo');
  btn.innerHTML = `${icons.lang}<span>${label}</span>`;
  btn.title = toEnglish ? t('tb.langToEnTitle') : t('tb.langToKoTitle');
  btn.classList.toggle('active', false);
}

export function refreshToolbarLabels() {
  document.querySelectorAll('.toolbar-btn[data-label-key]').forEach((btn) => {
    if (btn.id === 'tbTheme' || btn.id === 'tbLang') return;
    const iconName = btn.dataset.icon;
    const labelKey = btn.dataset.labelKey;
    const titleKey = btn.dataset.titleKey;
    const active = btn.classList.contains('active');
    const primary = btn.classList.contains('primary');
    btn.innerHTML = `${icons[iconName]}<span>${t(labelKey)}</span>`;
    btn.title = t(titleKey);
    btn.classList.toggle('active', active);
    btn.classList.toggle('primary', primary);
  });
  const bar = document.querySelector('.toolbar');
  if (bar) bar.setAttribute('aria-label', t('toolbar.aria'));
}
