export const INSTALL_STRINGS = {
  en: {
    languagePrompt: "Choose the installer language: 1) English  2) Korean",
    deleteData: "Saved data from the previous installation was found. Do you want to delete it?",
    reinstall: "An existing installation was found. It will be removed completely and installed again.",
  },
  ko: {
    languagePrompt: "설치 언어를 선택하세요: 1) English  2) 한국어",
    deleteData: "이전에 설치한 프로그램의 저장 데이터가 있습니다. 삭제하시겠습니까?",
    reinstall: "이미 설치된 프로그램이 있습니다. 완전히 삭제한 뒤 다시 설치합니다.",
  },
};

export function planInstall(input) {
  const language = input.language === "en" ? "en" : input.language === "ko" ? "ko" : "";
  if (!language) {
    throw new Error("A language must be selected.");
  }
  const steps = [];
  if (input.existingInstall) {
    steps.push({ action: "announce-reinstall", language });
    if (input.userDataExists) {
      steps.push({ action: "ask-delete-data", language, deleteData: Boolean(input.deleteData) });
      if (input.deleteData) steps.push({ action: "delete-user-data", path: input.userDataPath });
    }
    steps.push({ action: "uninstall-existing", path: input.installPath });
  }
  steps.push({ action: "install", path: input.installPath, language });
  steps.push({ action: "register-app-icon", icon: "assets/icon.png" });
  steps.push({ action: "register-file-icon", ext: "myweather", icon: "assets/file.ico" });
  return { language, steps };
}

export function applyPlan(vfs, plan) {
  const next = {
    install: { ...(vfs.install || {}) },
    data: { ...(vfs.data || {}) },
    registry: { ...(vfs.registry || {}) },
    log: [...(vfs.log || [])],
  };
  for (const step of plan.steps) {
    next.log.push(step.action);
    if (step.action === "delete-user-data") delete next.data[step.path];
    if (step.action === "uninstall-existing") delete next.install[step.path];
    if (step.action === "install") {
      next.install[step.path] = {
        language: step.language,
        appIcon: "assets/icon.png",
        version: "1.0.0",
      };
    }
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
  let deleteData = false;
  if (existing.installed) await io.notify(INSTALL_STRINGS[language].reinstall);
  if (existing.installed && existing.userDataExists) {
    deleteData = await io.confirm(INSTALL_STRINGS[language].deleteData);
  }
  const plan = planInstall({
    language,
    existingInstall: existing.installed,
    userDataExists: existing.userDataExists,
    deleteData,
    userDataPath: existing.userDataPath,
    installPath: existing.installPath,
  });
  for (const step of plan.steps) await env.exec(step);
  return plan;
}
