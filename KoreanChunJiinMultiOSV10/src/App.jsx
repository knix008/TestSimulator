/*
 * App.jsx - 화면 전체를 엮는다.
 *
 * 원본 main.c 가 하던 일 - 키보드 처리, 툴바 · 상태줄 · 키패드 그리기,
 * 파일 · 클립보드 · 설정 - 을 그대로 옮겼다. 조합 자체는 손대지 않고
 * src/engine 의 오토마타에 맡긴다.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  KEY_COUNT,
  MODE,
  chunjiinBackspace,
  chunjiinBreakMultitap,
  chunjiinClear,
  chunjiinCommit,
  chunjiinCompositionText,
  chunjiinCycleMode,
  chunjiinInsertChar,
  chunjiinKeyLabel,
  chunjiinModeName,
  chunjiinMoveCursor,
  chunjiinProcessInput,
  chunjiinSetCursor,
  chunjiinSetMode,
  chunjiinSpace,
  createState,
} from './engine/input.js';

import { THEMES, THEME_COUNT, themeVars } from './themes.js';
import { loadSettings, saveSettings } from './settings.js';
import {
  copyToClipboard, isElectron, isMac, openTextFile, platformName,
  readClipboard, saveTextFile,
} from './platform.js';

import Toolbar from './ui/Toolbar.jsx';
import Editor from './ui/Editor.jsx';
import StatusBar from './ui/StatusBar.jsx';
import Keypad from './ui/Keypad.jsx';
import SettingsDialog from './ui/SettingsDialog.jsx';
import HelpDialog from './ui/HelpDialog.jsx';
import AboutDialog from './ui/AboutDialog.jsx';
import ErrorDialog from './ui/ErrorDialog.jsx';
import Tooltip from './ui/Tooltip.jsx';
import ResizeGrip from './ui/ResizeGrip.jsx';
import { APP_NAME, APP_VERSION } from './version.js';

/* 한글 모드에서 숫자열을 키패드에 대응시킨다. 없으면 -1. */
function codeToKeyHangul(code) {
  const table = {
    Digit1: 0, Digit2: 1, Digit3: 2,
    Digit4: 3, Digit5: 4, Digit6: 5,
    Digit7: 6, Digit8: 7, Digit9: 8,
    Minus: 9, Digit0: 10, Equal: 11,
  };
  return code in table ? table[code] : -1;
}

/* 숫자패드는 모든 모드에서 키패드로 쓴다. 없으면 -1. */
function codeToKeyNumpad(code) {
  const table = {
    Numpad7: 0, Numpad8: 1, Numpad9: 2,
    Numpad4: 3, Numpad5: 4, Numpad6: 5,
    Numpad1: 6, Numpad2: 7, Numpad3: 8,
    NumpadDivide: 9, Numpad0: 10, NumpadMultiply: 11,
  };
  return code in table ? table[code] : -1;
}

export default function App() {
  const st = useRef(null);
  if (st.current === null) st.current = createState();

  const [, bump] = useReducer((n) => n + 1, 0);
  const [settings, setSettings] = useState(loadSettings);
  const [dialog, setDialog] = useState(null);   /* 'settings' | 'help' | 'about' */
  const [note, setNote] = useState(null);       /* { text, kind } - 상태줄 알림 */
  const [error, setError] = useState(null);     /* 오류 창에 띄울 내용 */
  const [tapLive, setTapLive] = useState(false); /* 연타 순환이 살아 있는지 */

  const editorRef = useRef(null);
  const tapTimer = useRef(null);
  const noteTimer = useRef(null);
  const startedRef = useRef(false);

  const theme = THEMES[settings.theme];
  const mod = isMac ? '⌘' : 'Ctrl';

  /* 시작 입력 모드는 한 번만 적용한다 */
  if (!startedRef.current) {
    startedRef.current = true;
    chunjiinSetMode(st.current, settings.startMode);
  }

  const refresh = useCallback(() => bump(), []);

  /* 상태줄 오른쪽에 잠깐 뜨는 알림 */
  const flash = useCallback((text) => {
    setNote({ text, kind: 'info' });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  }, []);

  /*
   * 오류를 알린다.
   * 상태줄에는 한 줄로 남겨 두고(눌러서 다시 열 수 있다), 창을 띄워
   * 무엇을 하다가 어디서 어떻게 틀어졌는지 통째로 복사할 수 있게 한다.
   */
  const showError = useCallback((what, cause) => {
    const detail = cause?.stack
      || (cause && typeof cause === 'object' ? JSON.stringify(cause, null, 2) : String(cause ?? ''));

    const info = {
      what,
      when: new Date().toLocaleString('ko-KR'),
      where: `${APP_NAME} ${APP_VERSION} · ${isElectron ? 'Electron' : '웹'} · ${platformName()}`,
      message: cause?.message || String(cause ?? '알 수 없는 오류'),
      detail: detail === cause?.message ? '' : detail,
    };

    setError(info);
    clearTimeout(noteTimer.current);
    setNote({ text: `${what} 실패`, kind: 'error', error: info });
  }, []);

  /*
   * 연타 순환 시계.
   * 정해진 시간이 지나면 다음 같은 키는 순환이 아니라 새 문자로 시작한다.
   */
  const armMultitap = useCallback(() => {
    clearTimeout(tapTimer.current);
    setTapLive(true);
    tapTimer.current = setTimeout(() => {
      chunjiinBreakMultitap(st.current);
      setTapLive(false);
      refresh();
    }, settings.multitapMs);
  }, [settings.multitapMs, refresh]);

  /* 커서 이동·모드 전환처럼 순환을 곧바로 끊는 자리에서 부른다 */
  const stopMultitap = useCallback(() => {
    clearTimeout(tapTimer.current);
    setTapLive(false);
  }, []);

  useEffect(() => () => {
    clearTimeout(tapTimer.current);
    clearTimeout(noteTimer.current);
  }, []);

  /* ---------------------------------------------------------------- */
  /* 편집 명령                                                         */
  /* ---------------------------------------------------------------- */

  const doKey = useCallback((key) => {
    chunjiinProcessInput(st.current, key);
    armMultitap();
    refresh();
  }, [armMultitap, refresh]);

  const doCopy = useCallback(async () => {
    if (st.current.text === '') { flash('복사할 글이 없습니다'); return; }
    try {
      if (await copyToClipboard(st.current.text)) flash('복사했습니다');
      else throw new Error('클립보드 쓰기를 브라우저가 막았습니다. 주소가 https 인지 확인해 보세요.');
    } catch (e) {
      showError('복사', e);
    }
  }, [flash, showError]);

  const doPaste = useCallback(async () => {
    const text = await readClipboard();
    if (text === null) { flash('붙여넣을 수 없습니다'); return; }

    chunjiinCommit(st.current);
    for (const ch of text) {
      if (ch === '\r') continue;
      chunjiinInsertChar(st.current, ch);
    }
    refresh();
  }, [flash, refresh]);

  const doOpen = useCallback(async () => {
    try {
      const file = await openTextFile();
      if (!file) return;

      chunjiinClear(st.current);
      for (const ch of file.text) {
        if (ch === '\r') continue;
        chunjiinInsertChar(st.current, ch);
      }
      stopMultitap();
      refresh();                       /* 커서는 원본과 같이 글 끝에 둔다 */
      flash(`${file.name} 을(를) 열었습니다`);
    } catch (e) {
      showError('파일 열기', e);
    }
  }, [flash, refresh, showError, stopMultitap]);

  const doSave = useCallback(async () => {
    try {
      chunjiinCommit(st.current);
      const name = await saveTextFile(st.current.text);
      refresh();
      if (name) flash(`${name} 에 저장했습니다`);
    } catch (e) {
      showError('파일 저장', e);
    }
  }, [flash, refresh, showError]);

  const cycleTheme = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, theme: (s.theme + 1) % THEME_COUNT };
      saveSettings(next);
      return next;
    });
  }, []);

  const command = useCallback((id) => {
    switch (id) {
      case 'new':
      case 'clear':
        chunjiinClear(st.current);
        refresh();
        break;
      case 'open': doOpen(); break;
      case 'save': doSave(); break;
      case 'copy': doCopy(); break;
      case 'paste': doPaste(); break;
      case 'mode':
        chunjiinCycleMode(st.current);
        stopMultitap();
        refresh();
        break;
      case 'theme': cycleTheme(); break;
      case 'settings': setDialog('settings'); break;
      case 'help': setDialog('help'); break;
      case 'about': setDialog('about'); break;
      default: break;
    }
  }, [cycleTheme, doCopy, doOpen, doPaste, doSave, refresh, stopMultitap]);

  const fnKey = useCallback((id) => {
    const state = st.current;
    switch (id) {
      case 'mode': command('mode'); return;
      case 'left': chunjiinMoveCursor(state, -1); break;
      case 'right':
        /* 오른쪽 화살표는 커서 이동과 함께 연타 순환을 끊는다 */
        chunjiinMoveCursor(state, 1);
        break;
      case 'space': chunjiinSpace(state); break;
      case 'enter': chunjiinInsertChar(state, '\n'); break;
      case 'backspace': chunjiinBackspace(state); break;
      default: return;
    }
    stopMultitap();
    refresh();
  }, [command, refresh, stopMultitap]);

  /* ---------------------------------------------------------------- */
  /* 물리 키보드                                                       */
  /* ---------------------------------------------------------------- */

  const onKeyDown = useCallback((e) => {
    if (dialog !== null) return;

    const state = st.current;
    const accel = isMac ? e.metaKey : e.ctrlKey;

    if (accel && !e.altKey) {
      const k = e.key.toLowerCase();
      if ('cvson'.includes(k) && k.length === 1) {
        e.preventDefault();
        if (k === 'c') doCopy();
        else if (k === 'v') doPaste();
        else if (k === 's') doSave();
        else if (k === 'o') doOpen();
        else if (k === 'n') { chunjiinClear(state); refresh(); }
        return;
      }
      return;
    }
    if (e.altKey || e.metaKey) return;

    /* 숫자패드는 모든 모드에서, 숫자열은 한글 모드에서만 키패드가 된다 */
    let key = codeToKeyNumpad(e.code);
    if (key < 0 && state.nowMode === MODE.HANGUL && !e.shiftKey) key = codeToKeyHangul(e.code);
    if (key >= 0 && key < KEY_COUNT) {
      e.preventDefault();
      doKey(key);
      return;
    }

    const done = () => { stopMultitap(); refresh(); };

    switch (e.key) {
      case ' ': e.preventDefault(); chunjiinSpace(state); done(); return;
      case 'Backspace': e.preventDefault(); chunjiinBackspace(state); done(); return;
      case 'Enter': e.preventDefault(); chunjiinInsertChar(state, '\n'); done(); return;
      case 'ArrowLeft': e.preventDefault(); chunjiinMoveCursor(state, -1); done(); return;
      case 'ArrowRight': e.preventDefault(); chunjiinMoveCursor(state, 1); done(); return;
      case 'Home': e.preventDefault(); chunjiinSetCursor(state, 0); done(); return;
      case 'End': e.preventDefault(); chunjiinSetCursor(state, state.text.length); done(); return;
      case 'Delete':
        e.preventDefault();
        if (state.cursorPos < state.text.length) {
          chunjiinMoveCursor(state, 1);
          chunjiinBackspace(state);
        }
        done();
        return;
      case 'Escape': e.preventDefault(); chunjiinCommit(state); done(); return;
      case 'F1': e.preventDefault(); setDialog('help'); return;
      case 'F2': e.preventDefault(); command('mode'); return;
      case 'F3': e.preventDefault(); cycleTheme(); return;
      case 'F4': e.preventDefault(); setDialog('settings'); return;
      default: break;
    }

    /* 영문 · 숫자 · 기호 모드에서는 키보드로 그냥 타이핑한다 */
    if (state.nowMode !== MODE.HANGUL && e.key.length === 1) {
      e.preventDefault();
      chunjiinInsertChar(state, e.key);
      done();
    }
  }, [command, cycleTheme, dialog, doCopy, doOpen, doPaste, doSave, doKey, refresh, stopMultitap]);

  /* 창 어디에 있든 키를 받는다 */
  useEffect(() => {
    const handler = (e) => onKeyDown(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKeyDown]);

  /* 웹에서 브라우저 붙여넣기(⌘/Ctrl+V) 가 문서로 올라오면 그것도 받는다 */
  useEffect(() => {
    const onPaste = (e) => {
      if (dialog !== null) return;
      const text = e.clipboardData?.getData('text');
      if (!text) return;
      e.preventDefault();
      chunjiinCommit(st.current);
      for (const ch of text) {
        if (ch === '\r') continue;
        chunjiinInsertChar(st.current, ch);
      }
      refresh();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [dialog, refresh, stopMultitap]);

  /*
   * 어디서도 붙잡지 못한 오류는 여기서 받는다.
   * 조용히 사라지는 것보다 무엇이 틀어졌는지 보여 주는 편이 낫다.
   */
  useEffect(() => {
    const onError = (e) => showError('실행', e.error || new Error(e.message));
    const onReject = (e) => showError('실행', e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, [showError]);

  /* ---------------------------------------------------------------- */
  /* 설정                                                              */
  /* ---------------------------------------------------------------- */

  const acceptSettings = useCallback((next) => {
    saveSettings(next);
    setSettings(next);
    setDialog(null);
  }, []);

  /* 테마 색을 CSS 사용자 지정 속성으로 내려 보낸다 */
  const vars = useMemo(() => themeVars(theme), [theme]);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
    document.title = `${APP_NAME} - ${theme.name}`;
  }, [theme]);

  /* ---------------------------------------------------------------- */

  const state = st.current;
  const labels = useMemo(
    () => Array.from({ length: KEY_COUNT }, (_, k) => chunjiinKeyLabel(state, k)),
    [state, state.nowMode],
  );
  const accelTips = {
    new: `${mod}+N`, open: `${mod}+O`, save: `${mod}+S`,
    copy: `${mod}+C`, paste: `${mod}+V`,
  };

  return (
    <div className={`app${theme.dark ? ' dark' : ''}`} style={vars}>
      {settings.showToolbar && <Toolbar onCommand={command} accel={accelTips} />}

      <div className="card">
        <Editor
          text={state.text}
          cursorPos={state.cursorPos}
          composeLen={state.composeLen}
          fontSize={settings.fontSize}
          containerRef={editorRef}
          onSetCursor={(at) => { chunjiinSetCursor(state, at); refresh(); }}
        />
      </div>

      {settings.showStatus && (
        <StatusBar
          modeName={chunjiinModeName(state)}
          composition={chunjiinCompositionText(state)}
          cursorPos={state.cursorPos}
          length={state.text.length}
          themeName={theme.name}
          fontSize={settings.fontSize}
          multitapMs={settings.multitapMs}
          multitapLive={tapLive}
          note={note?.text}
          noteKind={note?.kind}
          onNoteClick={() => { if (note?.error) setError(note.error); }}
        />
      )}

      <Keypad
        labels={labels}
        isHangul={state.nowMode === MODE.HANGUL}
        showHints={state.nowMode === MODE.HANGUL}
        onKey={doKey}
        onFn={fnKey}
      />

      {dialog === 'settings' && (
        <SettingsDialog
          settings={settings}
          onPreview={setSettings}
          onAccept={acceptSettings}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'help' && <HelpDialog mod={mod} onClose={() => setDialog(null)} />}
      {dialog === 'about' && (
        <AboutDialog
          themeName={theme.name}
          onClose={() => setDialog(null)}
          onHelp={() => setDialog('help')}
        />
      )}
      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}

      <Tooltip />
      <ResizeGrip />
    </div>
  );
}
