; TTS Multi OS installer additions (read by the Tauri NSIS template).
;
; Installing
;   • An installed TTS Multi OS (the earlier Electron build or a Tauri build) is always
;     removed completely before this one goes in. The user is told first. The Electron copy
;     is removed by hand: its own uninstaller asks about %APPDATA%\TTSMultiOSV10, which is
;     the next question's to decide. Its Chromium folders there (user-data, session-data)
;     are deleted: the Tauri build does not read them.
;   • Then, if saved data is found (downloaded voice models, logs in %APPDATA%\TTSMultiOSV10;
;     the window storage in %LOCALAPPDATA%\com.shkwon.tts-multios), the user is asked whether
;     to delete it. "No" is the default: the models are large to download again.
; Silent installs (/S) skip the messages: the old copy is removed, data stays.
;
; Uninstalling with "Delete the application data" ticked also removes %APPDATA%\TTSMultiOSV10
; (Tauri itself only knows the folders named by the identifier).
;
; Tauri's hooks cannot add wizard pages, so the questions come before the first page (MUI's
; GUI init). This file is read near the top of the template, before its variables and
; defines exist: Functions spell the names out and use only the variables declared here.
; Hook macros expand later, inside Sections.
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; Ask for the language every time (otherwise only on the very first install).
!define MUI_LANGDLL_ALWAYSSHOW

!define TTS_NAME "TTS Multi OS"
!define TTS_EXE "TTSMultiOS.exe"
!define TTS_EL_EXE "TTS Multi OS.exe"
!define TTS_DATA "$APPDATA\TTSMultiOSV10"
!define TTS_WEBVIEW "$LOCALAPPDATA\com.shkwon.tts-multios"
; electron-builder's registration for appId com.shkwon.tts-multios (UUIDv5 of the appId).
!define TTS_EL_GUID "165339ef-a635-5930-bf7c-6fb52652c027"
!define TTS_EL_KEY "Software\${TTS_EL_GUID}"
!define TTS_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${TTS_EL_GUID}"
; The Tauri template's UNINSTKEY for productName "TTS Multi OS".
!define TTS_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\TTS Multi OS"

; 1 once the earlier installation has been removed.
Var TtsOldDone
; The Tauri copy's uninstaller and the Electron copy's folder; empty when absent.
Var TtsTaUn
Var TtsElDir
; HKCU or HKLM: where the Electron copy registered itself.
Var TtsElRoot

!define MUI_CUSTOMFUNCTION_GUIINIT TtsGuiInit

; "C:\x\uninstall.exe" → C:\x\uninstall.exe
Function TtsUnquote
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

Function TtsFindOld
  StrCpy $TtsTaUn ""
  StrCpy $TtsElDir ""
  StrCpy $TtsElRoot ""
  ReadRegStr $0 HKCU "${TTS_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call TtsUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $TtsTaUn $0
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${TTS_EL_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $TtsElRoot "HKCU"
  ${Else}
    ReadRegStr $0 HKLM "${TTS_EL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $TtsElRoot "HKLM"
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${TTS_EL_EXE}"
    StrCpy $TtsElDir $0
  ${EndIf}
FunctionEnd

; Removes a folder that held TTS Multi OS: whole when its name says so, else only our files.
Function TtsSweepDir
  Exch $0
  Push $1
  StrCpy $1 $0 "" -12
  ${If} $1 == "${TTS_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\${TTS_EXE}"
    Delete "$0\${TTS_EL_EXE}"
    Delete "$0\uninstall.exe"
    Delete "$0\Uninstall ${TTS_NAME}.exe"
    RMDir /r "$0\sidecar"
    RMDir /r "$0\resources"
    RMDir /r "$0\locales"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Silently removes the earlier copies; user data is not touched here.
; _?= runs the uninstaller in place, so ExecWait really waits for it.
Function TtsRemoveOld
  StrCpy $TtsOldDone 1
  nsExec::Exec 'taskkill /F /T /IM "${TTS_EXE}"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "${TTS_EL_EXE}"'
  Pop $0
  Sleep 500
  ${If} $TtsTaUn != ""
    ${GetParent} $TtsTaUn $2
    DetailPrint "${TTS_NAME}: $2"
    ExecWait '"$TtsTaUn" /S /UPDATE _?=$2'
    Push $2
    Call TtsSweepDir
  ${EndIf}
  ${If} $TtsElDir != ""
    DetailPrint "${TTS_NAME} (Electron): $TtsElDir"
    Push $TtsElDir
    Call TtsSweepDir
    ${If} $TtsElRoot == "HKLM"
      DeleteRegKey HKLM "${TTS_EL_UNKEY}"
      DeleteRegKey HKLM "${TTS_EL_KEY}"
    ${Else}
      DeleteRegKey HKCU "${TTS_EL_UNKEY}"
      DeleteRegKey HKCU "${TTS_EL_KEY}"
    ${EndIf}
    ; Its shortcuts point at a program that is gone.
    Delete "$DESKTOP\${TTS_NAME}.lnk"
    Delete "$SMPROGRAMS\${TTS_NAME}.lnk"
    ; The Electron build's Chromium profile in the shared data folder: nothing reads it now.
    RMDir /r "${TTS_DATA}\user-data"
    RMDir /r "${TTS_DATA}\session-data"
    RMDir /r "$LOCALAPPDATA\tts-multios-v10-updater"
  ${EndIf}
FunctionEnd

; Before the first page; not in silent installs.
Function TtsGuiInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ClearErrors
  Call TtsFindOld
  ${If} $TtsTaUn != ""
  ${OrIf} $TtsElDir != ""
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치된 TTS Multi OS 가 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다. (실행 중이면 종료됩니다.)"
    ${Else}
      StrCpy $2 "An installed TTS Multi OS was found.$\r$\n$\r$\nIt will be removed completely before this version is installed. (A running copy is closed.)"
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$2" IDOK tts_remove
    Quit
    tts_remove:
    Call TtsRemoveOld
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "${TTS_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${TTS_WEBVIEW}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 1
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이전에 저장한 사용자 데이터가 있습니다. 삭제하시겠습니까?$\r$\n$\r$\n위치: ${TTS_DATA}$\r$\n내용: 다운로드한 음성 모델, 설정, 로그$\r$\n$\r$\n[예] 삭제합니다. 음성 모델을 다시 다운로드해야 합니다.$\r$\n[아니요] 그대로 유지합니다."
    ${Else}
      StrCpy $2 "Saved user data was found. Do you want to delete it?$\r$\n$\r$\nLocation: ${TTS_DATA}$\r$\nContents: downloaded voice models, settings, logs$\r$\n$\r$\n[Yes] Delete it. Voice models must be downloaded again.$\r$\n[No] Keep it."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$2" IDNO tts_keep
    RMDir /r "${TTS_DATA}"
    RMDir /r "${TTS_WEBVIEW}"
    tts_keep:
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs never saw TtsGuiInit: the earlier copy still goes, its data stays.
  ${If} $UpdateMode <> 1
  ${AndIf} $TtsOldDone <> 1
    Call TtsFindOld
    Call TtsRemoveOld
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; The program and its Node host (and the ORT worker it started) must not hold files.
  nsExec::Exec 'taskkill /F /T /IM "${TTS_EXE}"'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $DeleteAppDataCheckboxState = 1
    SetShellVarContext current
    RMDir /r "${TTS_DATA}"
  ${EndIf}
!macroend
