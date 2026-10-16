'use strict';

/** 알람 / 타이머 팝업 — 확인을 누르거나 창을 닫을 때까지 알람음을 반복한다. */

const api = window.myclock;
const player = new AlarmSoundPlayer();

const headerEl = document.getElementById('alarmHeader');
const iconEl = document.getElementById('alarmIcon');
const timeEl = document.getElementById('alarmTime');
const labelEl = document.getElementById('alarmLabel');
const confirmEl = document.getElementById('alarmConfirm');

api.settings.load().then((settings) => {
  setCustomTheme(settings.customThemeColor, settings.customThemeLight);
  applyTheme(settings.theme);
});

api.alarm.onShow((payload) => {
  headerEl.textContent = payload.header || '알람';
  // 제목 줄의 그림 — 알람·타이머·일정을 한눈에 구분한다.
  iconEl.textContent = /타이머/.test(headerEl.textContent)
    ? '⏳'
    : /일정/.test(headerEl.textContent)
      ? '🗓'
      : '⏰';
  timeEl.textContent = payload.time || '';
  labelEl.textContent = payload.label || '';
  player.play(payload.soundId, payload.volume, true);
  window.requestAnimationFrame(fitToContent);
});

/**
 * 내용이 창보다 크면 (긴 메모, 큰 글꼴 배율) 창을 그만큼 늘린다 — 확인 단추가 잘리지 않게.
 * 카드는 창 높이를 채우므로, 잠깐 높이를 풀어 내용만의 높이를 잰다.
 */
function fitToContent() {
  const card = document.querySelector('.alarm-card');
  if (!card) return;
  const saved = card.style.height;
  card.style.height = 'auto';
  const needed = Math.ceil(card.getBoundingClientRect().height + 4);
  card.style.height = saved;
  if (needed > window.innerHeight) api.window.setSize({ width: window.innerWidth, height: needed });
}

function dismiss() {
  player.stop();
  api.alarm.dismiss();
}

confirmEl.addEventListener('click', dismiss);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter') dismiss();
});
window.addEventListener('beforeunload', () => player.stop());
