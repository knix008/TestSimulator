export const PROGRAM_ICON = {
  win32: "assets/icon.ico",
  darwin: "assets/icon.icns",
  linux: "assets/icon.png",
};

export const INSTALL_STRINGS = {
  en: {
    languagePrompt: "Choose the installer language: 1) English  2) Korean",
    deleteData: "Saved data from the previous installation was found. Do you want to delete it?",
    reinstall: "An existing installation was found. It will be removed completely and installed again.",
    desktopShortcut: "Create a desktop shortcut?",
    startMenuShortcut: "Create a Start menu shortcut?",
  },
  ko: {
    languagePrompt: "설치 언어를 선택하세요: 1) English  2) 한국어",
    deleteData: "이전에 설치한 프로그램의 저장 데이터가 있습니다. 삭제하시겠습니까?",
    reinstall: "이미 설치된 프로그램이 있습니다. 완전히 삭제한 뒤 다시 설치합니다.",
    desktopShortcut: "바탕화면 바로가기를 만드시겠습니까?",
    startMenuShortcut: "시작 메뉴 바로가기를 만드시겠습니까?",
  },
};

export function programIconFor(platform) {
  return PROGRAM_ICON[platform] || PROGRAM_ICON.linux;
}

export function planInstall(input) {
  const language = input.language === "en" ? "en" : input.language === "ko" ? "ko" : "";
  if (!language) {
    throw new Error("A language must be selected.");
  }
  const icon = input.programIcon || programIconFor(input.platform);
  const steps = [];
  if (input.existingInstall) {
    steps.push({ action: "announce-reinstall", language });
    if (input.userDataExists) {
      steps.push({ action: "ask-delete-data", language, deleteData: Boolean(input.deleteData) });
      if (input.deleteData) steps.push({ action: "delete-user-data", path: input.userDataPath });
    }
    steps.push({ action: "uninstall-existing", path: input.installPath, shortcuts: input.shortcuts || [] });
  }
  steps.push({ action: "install", path: input.installPath, language, icon });
  if (input.desktopShortcut) steps.push({ action: "shortcut-desktop", icon });
  if (input.startMenuShortcut) steps.push({ action: "shortcut-start-menu", icon });
  steps.push({ action: "register-app-icon", icon });
  steps.push({ action: "register-file-icon", ext: "myweather", icon: "assets/file.ico" });
  return { language, steps };
}

export function applyPlan(vfs, plan) {
  const next = {
    install: { ...(vfs.install || {}) },
    data: { ...(vfs.data || {}) },
    registry: { ...(vfs.registry || {}) },
    shortcuts: { ...(vfs.shortcuts || {}) },
    links: { ...(vfs.links || {}) },
    log: [...(vfs.log || [])],
  };
  for (const step of plan.steps) {
    next.log.push(step.action);
    if (step.action === "delete-user-data") delete next.data[step.path];
    if (step.action === "uninstall-existing") {
      delete next.install[step.path];
      next.shortcuts = {};
      for (const link of step.shortcuts || []) delete next.links[link];
    }
    if (step.action === "install") {
      next.install[step.path] = {
        language: step.language,
        appIcon: step.icon,
        version: "1.0.0",
      };
    }
    if (step.action === "shortcut-desktop") next.shortcuts.desktop = step.icon;
    if (step.action === "shortcut-start-menu") next.shortcuts.startMenu = step.icon;
    if (step.action === "register-app-icon") next.registry.appIcon = step.icon;
    if (step.action === "register-file-icon") {
      next.registry.fileExt = step.ext;
      next.registry.fileIcon = step.icon;
    }
  }
  return next;
}

export async function runInstaller(io, env) {
  const language = await io.chooseLanguage(INSTALL_STRINGS);
  const existing = await env.detectExisting();
  const strings = INSTALL_STRINGS[language];
  let deleteData = false;
  if (existing.installed) await io.notify(strings.reinstall);
  if (existing.installed && existing.userDataExists) {
    deleteData = await io.confirm(strings.deleteData);
  }
  const desktopShortcut = await io.confirm(strings.desktopShortcut);
  const startMenuShortcut = await io.confirm(strings.startMenuShortcut);
  const plan = planInstall({
    language,
    existingInstall: existing.installed,
    userDataExists: existing.userDataExists,
    deleteData,
    userDataPath: existing.userDataPath,
    installPath: existing.installPath,
    shortcuts: existing.shortcuts || [],
    programIcon: existing.programIcon,
    platform: existing.platform,
    desktopShortcut,
    startMenuShortcut,
  });
  for (const step of plan.steps) await env.exec(step);
  return plan;
}
