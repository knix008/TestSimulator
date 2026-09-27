'use strict';

// 로그인할 때 스스로 켜지기.
//
// 설치하고 시스템을 다시 켜면 MyDeskBox 가 알아서 돌아와 있어야 한다.
// 박스는 트레이에만 있으므로, 사람이 시작 메뉴를 찾아 누를 일을 만들지 않는다.
//
// Windows 와 macOS 는 Electron 이 운영체제에 맡길 길을 준다.
// Linux 에는 그 길이 없어 ~/.config/autostart 에 .desktop 파일을 하나 둔다.
//
// 설정(openAtLogin)과 운영체제에 적힌 것이 어긋날 수 있다. 다시 설치했거나,
// 다른 자리에 설치했거나, 사람이 시작프로그램 목록에서 지운 경우다.
// 그래서 켤 때마다 설정을 보고 운영체제 쪽을 다시 맞춘다(sync).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

// Linux 에서 쓸 파일 이름. 앱마다 하나면 된다.
const DESKTOP_FILE = 'mydeskbox.desktop';

// 개발 중에 띄운 것은 등록하지 않는다.
//
// npm start 로 띄우면 실행 파일이 node_modules 안의 electron 이다.
// 그것을 시작프로그램에 적어 두면, 나중에 그 폴더를 지운 뒤에도
// 시스템이 켜질 때마다 없어진 자리를 부른다. 설정 값은 그대로 두고
// 운영체제에만 알리지 않는다.
function registrable() {
  try {
    return !!(app && app.isPackaged);
  } catch (_err) {
    return false;
  }
}

// 시작할 때 부를 실행 파일.
// AppImage 는 껍데기 경로가 따로 있다. 안쪽 실행 파일은 켤 때마다 자리가 바뀐다.
function exePath() {
  return process.env.APPIMAGE || process.execPath || '';
}

// ── Linux ────────────────────────────────────────────────────────────────

function autostartDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'autostart');
}

function desktopFile() {
  return path.join(autostartDir(), DESKTOP_FILE);
}

// .desktop 안에서 Exec 에 넣을 경로. 빈칸이 든 자리는 따옴표로 감싼다.
function quoted(value) {
  const text = String(value || '');
  return /[ \t"']/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function linuxBody(name) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${name}`,
    `Exec=${quoted(exePath())}`,
    'Terminal=false',
    'NoDisplay=true',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function linuxEnabled() {
  try {
    return fs.existsSync(desktopFile());
  } catch (_err) {
    return false;
  }
}

function linuxApply(on, name) {
  const file = desktopFile();
  if (!on) {
    try {
      fs.rmSync(file, { force: true });
      return true;
    } catch (_err) {
      return false;
    }
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, linuxBody(name), 'utf8');
    return true;
  } catch (_err) {
    return false;
  }
}

// ── Windows · macOS ──────────────────────────────────────────────────────

// Windows 는 이 이름으로 레지스트리 Run 키에 적는다.
// 적어 주지 않으면 앱의 AppUserModelId 가 쓰여, 작업 관리자의 시작프로그램 목록에
// 'com.suhokwon.mydeskbox' 처럼 보인다. 사람이 읽을 이름으로 적어 둔다.
// 지울 때 제거 프로그램이 찾아야 하는 이름이기도 하다(build/installer.nsh).
function registryName(name) {
  return String(name || 'MyDeskBox');
}

function loginEnabled(name) {
  try {
    const found = app.getLoginItemSettings({ path: exePath(), name: registryName(name) });
    return !!(found && (found.openAtLogin || found.executableWillLaunchAtLogin));
  } catch (_err) {
    return false;
  }
}

function loginApply(on, name) {
  const wanted = { openAtLogin: !!on, path: exePath(), args: [], name: registryName(name) };
  // macOS 는 로그인 항목을 감춰 둘 수 있다. 박스는 트레이에서 시작하므로 그렇게 둔다.
  if (on && process.platform === 'darwin') wanted.openAsHidden = true;
  try {
    app.setLoginItemSettings(wanted);
    return true;
  } catch (_err) {
    // 설치본이 아니거나 운영체제가 거절한 경우. 설정 값은 그대로 둔다.
    return false;
  }
}

// ── 바깥으로 내는 길 ─────────────────────────────────────────────────────

// 지금 운영체제에 등록돼 있는가.
function enabled(name) {
  if (process.platform === 'linux') return linuxEnabled();
  return loginEnabled(name);
}

// 사람이 설정에서 켜고 끌 때. 운영체제에 실제로 적었으면 참을 준다.
function apply(on, name) {
  const want = !!on;
  if (!registrable()) return false;
  const label = String(name || 'MyDeskBox');
  if (process.platform === 'linux') return linuxApply(want, label);
  return loginApply(want, label);
}

// 켤 때마다 한 번. 설정 쪽을 참으로 보고 운영체제를 거기에 맞춘다.
//
// 설치 자리가 바뀌었거나 사람이 시작프로그램에서 지웠어도 이 길로 다시 적힌다.
// 끄기로 해 둔 경우에는 남아 있을 때만 지운다. 없는 것을 또 지우지 않는다.
function sync(on, name) {
  const want = !!on;
  if (!registrable()) return false;
  if (!want && !enabled(name)) return false;
  return apply(want, name);
}

module.exports = { apply, enabled, sync, desktopFile, DESKTOP_FILE };
