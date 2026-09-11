; Custom hooks for the Windows installer, pulled in by electron-builder through
; build.nsis.include in package.json.
;
; Installing over an existing DBTools must be a clean reinstall: electron-builder
; already runs the previous uninstaller before copying the new files, but it does
; so as an "update", which keeps per-user data. These hooks wipe that data too,
; so nothing from an old version survives. They also cover the app's real
; userData folder (%APPDATA%\<package name>), which the stock uninstaller misses
; because it only knows the product name.

; Only the installer half uses this; the uninstaller is compiled from the same
; script and NSIS treats an unreferenced variable as an error.
!ifndef BUILD_UNINSTALLER
  Var hadPreviousInstall
!endif

; Remove every per-user data folder the app may have written. Electron keeps
; userData under the roaming profile, so always look there even for a
; per-machine install.
!macro removeAppData
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  RMDir /r "$APPDATA\${APP_FILENAME}"
  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
  !endif
  RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

; Runs in .onInit, before the stock uninstall-old-version step: note whether a
; previous copy is registered (per-user or per-machine) or simply sitting in the
; target directory.
!macro customInit
  StrCpy $hadPreviousInstall "0"
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${if} $0 != ""
    StrCpy $hadPreviousInstall "1"
  ${endif}
  ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${if} $0 != ""
    StrCpy $hadPreviousInstall "1"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $hadPreviousInstall "1"
  ${endif}
!macroend

; Runs after the new files, registry entries and shortcuts are in place. The old
; program directory has already been emptied by the stock flow; finish the clean
; slate by dropping the old settings.
!macro customInstall
  ${if} $hadPreviousInstall == "1"
    !insertmacro removeAppData
  ${endif}
!macroend

; Standalone uninstall (Settings > Apps): honour deleteAppDataOnUninstall for the
; real userData folder as well. Skipped when an installer drives the uninstall
; as an update, exactly like the stock behaviour.
!macro customUnInstall
  ${ifNot} ${isUpdated}
  ${orIf} ${isDeleteAppData}
    !insertmacro removeAppData
  ${endif}
  ; The stock unregister step deletes our ProgId but leaves the bare ".mdprj"
  ; extension key pointing at it. Drop that too, as long as it is still ours.
  ; (Extension and class name mirror build.fileAssociations in package.json.)
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.mdprj" ""
  ${if} $0 == "DBTools Project"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\.mdprj"
  ${endif}
!macroend
