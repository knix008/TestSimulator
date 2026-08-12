; Custom NSIS page: choose whether to enable the system tray icon.
; Also: if a previous MyTerminal is installed, fully uninstall it before reinstall.
; Note: Do not use MUI_* macros here — electron-builder includes this
; file before MUI headers are fully available.
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var TrayDialog
Var TrayCheckbox
Var TrayLabel
Var EnableTray

; ---------- Clean reinstall helpers ----------

!macro killRunningMyTerminal
  ; Stop running instances so files/registry can be removed.
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 800
!macroend

!macro purgeAppDataFolders
  ; Electron userData / cache locations (current user).
  SetShellVarContext current
  !ifdef APP_FILENAME
    RMDir /r "$APPDATA\${APP_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
  !endif
  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
  !endif
  !ifdef APP_PACKAGE_NAME
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
  !endif
  ; Known product/package names as a fallback.
  RMDir /r "$APPDATA\MyTerminal"
  RMDir /r "$APPDATA\my-terminal-multios"
  RMDir /r "$LOCALAPPDATA\MyTerminal"
  RMDir /r "$LOCALAPPDATA\my-terminal-multios"
!macroend

!macro purgePreviousInstallForRoot ROOT_KEY
  ClearErrors
  ReadRegStr $R0 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  ReadRegStr $R1 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $R2 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" "InstallLocation"

  ${If} $R0 != ""
    ; Prefer quiet uninstall; force app-data deletion (no --updated).
    ExecWait '$R0 --delete-app-data' $R9
  ${ElseIf} $R1 != ""
    ExecWait '$R1 /S --delete-app-data' $R9
  ${EndIf}

  Sleep 400

  ${If} $R2 != ""
  ${AndIf} ${FileExists} "$R2\*.*"
    RMDir /r "$R2"
  ${EndIf}

  DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
!macroend

!macro purgePreviousInstall
  !insertmacro killRunningMyTerminal

  ; Cover both registry views and user/machine installs.
  SetRegView 64
  !insertmacro purgePreviousInstallForRoot HKCU
  !insertmacro purgePreviousInstallForRoot HKLM
  SetRegView 32
  !insertmacro purgePreviousInstallForRoot HKCU
  !insertmacro purgePreviousInstallForRoot HKLM
  SetRegView 64

  ; Remove leftover default install folders.
  RMDir /r "$LOCALAPPDATA\Programs\MyTerminal"
  RMDir /r "$LOCALAPPDATA\Programs\my-terminal-multios"
  RMDir /r "$PROGRAMFILES\MyTerminal"
  RMDir /r "$PROGRAMFILES64\MyTerminal"

  !insertmacro purgeAppDataFolders

  ; Stale shortcuts (best effort).
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !ifdef MENU_FILENAME
    RMDir /r "$SMPROGRAMS\${MENU_FILENAME}"
  !endif
!macroend

!macro customInit
  ; Always wipe any previous MyTerminal before this installer continues.
  !insertmacro purgePreviousInstall
!macroend

; When the uninstaller runs (Add/Remove Programs), wipe the whole install dir.
!macro customRemoveFiles
  RMDir /r "$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro killRunningMyTerminal
  !insertmacro purgeAppDataFolders
!macroend

; ---------- Tray options page ----------

Function trayOptionsPage
  nsDialogs::Create 1018
  Pop $TrayDialog

  ${If} $TrayDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 36u "Create a MyTerminal icon in the system tray after installation?$\r$\nYou can change this later in Settings."
  Pop $TrayLabel

  ${NSD_CreateCheckbox} 0 50u 100% 12u "Enable system tray icon"
  Pop $TrayCheckbox
  ${NSD_Check} $TrayCheckbox

  nsDialogs::Show
FunctionEnd

Function trayOptionsPageLeave
  ${NSD_GetState} $TrayCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $EnableTray "1"
  ${Else}
    StrCpy $EnableTray "0"
  ${EndIf}
FunctionEnd

!macro customPageAfterChangeDir
  Page custom trayOptionsPage trayOptionsPageLeave
!macroend

!macro customInstall
  ; Default if page was skipped
  ${If} $EnableTray == ""
    StrCpy $EnableTray "1"
  ${EndIf}

  CreateDirectory "$INSTDIR\resources"
  FileOpen $0 "$INSTDIR\resources\installer-options.json" w
  ${If} $EnableTray == "1"
    FileWrite $0 '{"showTrayIcon":true}'
  ${Else}
    FileWrite $0 '{"showTrayIcon":false}'
  ${EndIf}
  FileClose $0
!macroend
