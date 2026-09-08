/*
 * SettingsDialog.jsx - 설정 창 (F4)
 *
 * 원본과 같이 고르는 즉시 화면에 적용되고, 확인을 누르면 저장,
 * 취소하면 열기 전 상태로 되돌린다.
 */
import { useRef } from 'react';
import Modal from './Modal.jsx';
import { FONT_CHOICES, TAP_CHOICES, DEFAULTS } from '../settings.js';
import { THEMES } from '../themes.js';
import { MODE } from '../engine/input.js';

const MODE_NAMES = ['한글', '영문 abc', '영문 ABC', '숫자 123', '기호 !@#'];

export default function SettingsDialog({ settings, onPreview, onAccept, onCancel }) {
  /* 취소했을 때 되돌릴 값 */
  const original = useRef(settings);

  const set = (patch) => onPreview({ ...settings, ...patch });

  const cancel = () => {
    onPreview(original.current);
    onCancel();
  };

  return (
    <Modal
      title="설정"
      onClose={cancel}
      footer={(
        <>
          <button type="button" className="btn dlg-btn" onClick={cancel}>취소</button>
          <button type="button" className="btn dlg-btn dlg-primary" onClick={() => onAccept(settings)}>
            확인
          </button>
        </>
      )}
    >
      <div className="form">
        <label className="form-row">
          <span>테마</span>
          <select value={settings.theme} onChange={(e) => set({ theme: Number(e.target.value) })}>
            {THEMES.map((t, i) => <option key={t.id} value={i}>{t.name}</option>)}
          </select>
        </label>

        <label className="form-row">
          <span>글꼴 크기</span>
          <select value={settings.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })}>
            {FONT_CHOICES.map((v) => (
              <option key={v} value={v}>{`${v} px${v === DEFAULTS.fontSize ? '  (기본)' : ''}`}</option>
            ))}
          </select>
        </label>

        <label className="form-row">
          <span>연타 유지 시간</span>
          <select value={settings.multitapMs} onChange={(e) => set({ multitapMs: Number(e.target.value) })}>
            {TAP_CHOICES.map((v) => (
              <option key={v} value={v}>
                {`${(v / 1000).toFixed(1)} 초${v === DEFAULTS.multitapMs ? '  (기본)' : ''}`}
              </option>
            ))}
          </select>
        </label>

        <label className="form-row">
          <span>시작 입력 모드</span>
          <select value={settings.startMode} onChange={(e) => set({ startMode: Number(e.target.value) })}>
            {MODE_NAMES.slice(0, MODE.COUNT).map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </label>

        <label className="form-row form-check">
          <input
            type="checkbox"
            checked={settings.showToolbar}
            onChange={(e) => set({ showToolbar: e.target.checked })}
          />
          <span>툴바 보이기</span>
        </label>

        <label className="form-row form-check">
          <input
            type="checkbox"
            checked={settings.showStatus}
            onChange={(e) => set({ showStatus: e.target.checked })}
          />
          <span>상태줄 보이기</span>
        </label>
      </div>
    </Modal>
  );
}
