/*
 * AboutDialog.jsx - 프로그램 정보
 */
import Modal from './Modal.jsx';
import { APP_NAME, APP_VERSION, BUILD_STAMP } from '../version.js';
import { isElectron, platformName } from '../platform.js';

export default function AboutDialog({ themeName, onClose, onHelp }) {
  const rows = [
    ['만든이', 'SHKWON  (knix008@naver.com)'],
    ['판','' + APP_VERSION],
    ['빌드', BUILD_STAMP],
    ['실행 환경', isElectron ? `Electron · ${platformName()}` : `웹 브라우저 · ${platformName()}`],
    ['조합 엔진', 'src/engine/chunjiin.js · input.js (C 원본을 그대로 옮김)'],
    ['현재 테마', themeName],
    ['설정 저장 위치', 'localStorage · chunjiin.settings'],
  ];

  return (
    <Modal
      title="프로그램 정보"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn dlg-btn" onClick={onHelp}>사용법 (F1)</button>
          <button type="button" className="btn dlg-btn dlg-primary" onClick={onClose}>확인</button>
        </>
      )}
    >
      <p className="about-lead">
        <strong>{APP_NAME}</strong>
        <br />
        12키 천지인 자판으로 한글을 조합하는 프로그램입니다.
        <br />
        웹 · Windows · macOS · Linux 에서 같은 엔진으로 돕니다.
      </p>
      <dl className="about-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="about-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
