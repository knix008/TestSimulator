; MyTerminal installer additions (read by the Tauri NSIS template).
;
; Installing
;   • An installed MyTerminal (the earlier Electron build or a Tauri build) is
;     always removed completely before this one goes in. The user is told first.
;     The Electron copy is removed by hand: its own uninstaller would also wipe
;     %APPDATA%\MyTerminal, which is the next question's to decide.
;   • Then, if saved data is found (settings, shell history, wallpapers in
;     %APPDATA%\MyTerminal; the window storage in %LOCALAPPDATA%\com.shkwon.myterminal),
;     the user is asked whether to delete it.
;   • The user is asked whether MyTerminal shows a system tray icon (the old
;     installer's tray page); the answer goes to installer-options.json next to
;     the program, which the first start copies into the settings.
; Silent installs (/S) skip the messages: the old copy is removed, data stays,
; the tray icon is on.
;
; Uninstalling with "Delete the application data" ticked also removes
; %APPDATA%\MyTerminal (Tauri itself only knows the folders named by the identifier).
;
; Tauri's hooks cannot add wizard pages, so the questions come before the first
; page (MUI's GUI init). This file is read near the top of the template, before
; its variables and defines exist: Functions spell the names out and use only
; the variables declared here. Hook macros expand later, inside Sections.
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define MT_NAME "MyTerminal"
!define MT_EXE "MyTerminal.exe"
!define MT_DATA "$APPDATA\MyTerminal"
!define MT_WEBVIEW "$LOCALAPPDATA\com.shkwon.myterminal"
; electron-builder's registration for appId com.shkwon.myterminal (UUIDv5 of the appId).
!define MT_EL_GUID "c5ee5598-2ec7-56fb-add6-d63dc74b4f01"
!define MT_EL_KEY "Software\${MT_EL_GUID}"
!define MT_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MT_EL_GUID}"
; The Tauri template's UNINSTKEY for productName MyTerminal.
!define MT_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyTerminal"

; 1 once the earlier installation has been removed.
Var MtOldDone
; The Tauri copy's uninstaller and the Electron copy's folder; empty when absent.
Var MtTaUn
Var MtElDir
; HKCU or HKLM: where the Electron copy registered itself.
Var MtElRoot
; "1" / "0": the tray icon answer ("" until asked).
Var MtTray

!define MUI_CUSTOMFUNCTION_GUIINIT MtGuiInit

; "C:\x\uninstall.exe" → C:\x\uninstall.exe
Function MtUnquote
  Exch $0
  Push $1
  StrCpy $1 $0 1
  ${If} $1 == '"'
    StrCpy $0 $0 "" 1
  ${EndIf}
  StrCpy $1 $0 1 -1
  ${If} $1 == '"'
    StrCpy $0 $0 -1
  ${EndIf}
  Pop $1
  Exch $0
FunctionEnd

Function MtFindOld
  StrCpy $MtTaUn ""
  StrCpy $MtElDir ""
  StrCpy $MtElRoot ""
  ReadRegStr $0 HKCU "${MT_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call MtUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $MtTaUn $0
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${MT_EL_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $MtElRoot "HKCU"
  ${Else}
    ReadRegStr $0 HKLM "${MT_EL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $MtElRoot "HKLM"
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MT_EXE}"
    StrCpy $MtElDir $0
  ${EndIf}
FunctionEnd

; Removes a folder that held MyTerminal: whole when its name says so, else only our files.
Function MtSweepDir
  Exch $0
  Push $1
  StrCpy $1 $0 "" -10
  ${If} $1 == "${MT_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\${MT_EXE}"
    Delete "$0\uninstall.exe"
    Delete "$0\Uninstall ${MT_NAME}.exe"
    Delete "$0\installer-options.json"
    RMDir /r "$0\sidecar"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Silently removes the earlier copies; user data is not touched here.
; _?= runs the uninstaller in place, so ExecWait really waits for it.
Function MtRemoveOld
  StrCpy $MtOldDone 1
  nsExec::Exec 'taskkill /F /T /IM "${MT_EXE}"'
  Pop $0
  Sleep 500
  ${If} $MtTaUn != ""
    ${GetParent} $MtTaUn $2
    DetailPrint "${MT_NAME}: $2"
    ExecWait '"$MtTaUn" /S /UPDATE _?=$2'
    Push $2
    Call MtSweepDir
  ${EndIf}
  ${If} $MtElDir != ""
    DetailPrint "${MT_NAME} (Electron): $MtElDir"
    Push $MtElDir
    Call MtSweepDir
    ${If} $MtElRoot == "HKLM"
      DeleteRegKey HKLM "${MT_EL_UNKEY}"
      DeleteRegKey HKLM "${MT_EL_KEY}"
    ${Else}
      DeleteRegKey HKCU "${MT_EL_UNKEY}"
      DeleteRegKey HKCU "${MT_EL_KEY}"
    ${EndIf}
    ; Its shortcuts point at a program that is gone.
    Delete "$DESKTOP\${MT_NAME}.lnk"
    Delete "$SMPROGRAMS\${MT_NAME}.lnk"
    ; Chromium caches of the Electron build in the shared data folder: nothing reads them now.
    RMDir /r "${MT_DATA}\Cache"
    RMDir /r "${MT_DATA}\Code Cache"
    RMDir /r "${MT_DATA}\GPUCache"
    RMDir /r "${MT_DATA}\DawnCache"
    RMDir /r "${MT_DATA}\DawnGraphiteCache"
    RMDir /r "${MT_DATA}\DawnWebGPUCache"
    RMDir /r "${MT_DATA}\Crashpad"
    RMDir /r "${MT_DATA}\blob_storage"
    RMDir /r "${MT_DATA}\Local Storage"
    RMDir /r "${MT_DATA}\Session Storage"
    RMDir /r "${MT_DATA}\Shared Dictionary"
    RMDir /r "$LOCALAPPDATA\my-terminal-multios-updater"
  ${EndIf}
FunctionEnd

; Before the first page; not in silent installs.
Function MtGuiInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ClearErrors
  Call MtFindOld
  ${If} $MtTaUn != ""
  ${OrIf} $MtElDir != ""
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치된 MyTerminal 이 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다. (실행 중이면 종료됩니다.)"
    ${Else}
      StrCpy $2 "An installed MyTerminal was found.$\r$\n$\r$\nIt will be removed completely before this version is installed. (A running copy is closed.)"
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$2" IDOK mt_remove
    Quit
    mt_remove:
    Call MtRemoveOld
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "${MT_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MT_WEBVIEW}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 1
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치한 프로그램에서 저장한 데이터(설정, 명령 기록, 배경 이미지)가 있습니다. 삭제하시겠습니까?"
    ${Else}
      StrCpy $2 "Saved data from the installed program was found (settings, command history, wallpapers). Do you want to delete it?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$2" IDNO mt_keep
    RMDir /r "${MT_DATA}"
    RMDir /r "${MT_WEBVIEW}"
    mt_keep:
  ${EndIf}

  ${If} $LANGUAGE == 1042
    StrCpy $2 "설치 후 시스템 트레이에 MyTerminal 아이콘을 만드시겠습니까?$\r$\n$\r$\n나중에 설정에서 바꿀 수 있습니다."
  ${Else}
    StrCpy $2 "Create a MyTerminal icon in the system tray after installation?$\r$\n$\r$\nYou can change this later in Settings."
  ${EndIf}
  StrCpy $MtTray "1"
  MessageBox MB_YESNO|MB_ICONQUESTION "$2" IDYES mt_tray_done
  StrCpy $MtTray "0"
  mt_tray_done:
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs never saw MtGuiInit: the earlier copy still goes, its data stays.
  ${If} $UpdateMode <> 1
  ${AndIf} $MtOldDone <> 1
    Call MtFindOld
    Call MtRemoveOld
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MtTray == ""
    StrCpy $MtTray "1"
  ${EndIf}
  FileOpen $0 "$INSTDIR\installer-options.json" w
  ${If} $MtTray == "1"
    FileWrite $0 '{"showTrayIcon":true}'
  ${Else}
    FileWrite $0 '{"showTrayIcon":false}'
  ${EndIf}
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM "${MT_EXE}"'
  Pop $0
  Delete "$INSTDIR\installer-options.json"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $DeleteAppDataCheckboxState = 1
    SetShellVarContext current
    RMDir /r "${MT_DATA}"
  ${EndIf}
!macroend
