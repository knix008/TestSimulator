'use strict';

/** 알람 / 타이머 팝업 — 확인을 누르거나 창을 닫을 때까지 알람음을 반복한다. */

const api = window.myclock;
const player = new AlarmSoundPlayer();

const headerEl = document.getElementById('alarmHeader');
const timeEl = document.getElementById('alarmTime');
const labelEl = document.getElementById('alarmLabel');
const confirmEl = document.getElementById('alarmConfirm');

api.settings.load().then((settings) => applyTheme(settings.theme));

api.alarm.onShow((payload) => {
  headerEl.textContent = payload.header || '알람';
  timeEl.textContent = payload.time || '';
  labelEl.textContent = payload.label || '';
  player.play(payload.soundId, payload.volume, true);
});

function dismiss() {
  player.stop();
  api.alarm.dismiss();
}

confirmEl.addEventListener('click', dismiss);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter') dismiss();
});
window.addEventListener('beforeunload', () => player.stop());
