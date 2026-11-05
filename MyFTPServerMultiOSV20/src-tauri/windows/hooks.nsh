; My FTP Server installer additions (read by the Tauri NSIS template).
;
; Installing
;   • An installed My FTP Server (the earlier Electron build or a Tauri build)
;     is always removed completely before this one goes in. The user is told
;     first; a running copy is closed. The Electron copy is removed by hand:
;     its own uninstaller could also wipe %APPDATA%\My FTP Server, which is
;     the next question's to decide.
;   • Then, if saved data is found (server settings, profiles, SSL certificate,
;     SSH host key, log, theme / language in %APPDATA%\My FTP Server; the window
;     storage in %LOCALAPPDATA%\com.shkwon.myftpserver), the user is asked
;     whether to delete it.
; Silent installs (/S) skip the messages: the old copy is removed, data stays.
;
; Uninstalling with "Delete the application data" ticked also removes
; %APPDATA%\My FTP Server (Tauri itself only knows the folders named by the identifier).
;
; Tauri's hooks cannot add wizard pages, so the questions come before the first
; page (MUI's GUI init). This file is read near the top of the template, before
; its variables and defines exist: Functions spell the names out and use only
; the variables declared here. Hook macros expand later, inside Sections.
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; Ask for the language on every install (the last choice stays preselected).
!define MUI_LANGDLL_ALWAYSSHOW

!define MF_NAME "My FTP Server"
!define MF_EXE "MyFTPServer.exe"
!define MF_DATA "$APPDATA\My FTP Server"
!define MF_WEBVIEW "$LOCALAPPDATA\com.shkwon.myftpserver"
; electron-builder's registration for appId com.shkwon.myftpserver (UUIDv5 of the appId).
!define MF_EL_GUID "593df79e-7780-5303-98a8-066fe7a1f335"
!define MF_EL_KEY "Software\${MF_EL_GUID}"
!define MF_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MF_EL_GUID}"
; The Tauri template's UNINSTKEY for productName "My FTP Server".
!define MF_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\My FTP Server"

; 1 once the earlier installation has been removed.
Var MfOldDone
; The Tauri copy's uninstaller and the Electron copy's folder; empty when absent.
Var MfTaUn
Var MfElDir
; HKCU or HKLM: where the Electron copy registered itself.
Var MfElRoot

!define MUI_CUSTOMFUNCTION_GUIINIT MfGuiInit

; "C:\x\uninstall.exe" → C:\x\uninstall.exe
Function MfUnquote
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

Function MfFindOld
  StrCpy $MfTaUn ""
  StrCpy $MfElDir ""
  StrCpy $MfElRoot ""
  ReadRegStr $0 HKCU "${MF_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call MfUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $MfTaUn $0
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${MF_EL_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $MfElRoot "HKCU"
  ${Else}
    ReadRegStr $0 HKLM "${MF_EL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $MfElRoot "HKLM"
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MF_EXE}"
    StrCpy $MfElDir $0
  ${EndIf}
FunctionEnd

; Removes a folder that held My FTP Server: whole when its name says so, else only our files.
Function MfSweepDir
  Exch $0
  Push $1
  StrCpy $1 $0 "" -13
  ${If} $1 == "${MF_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\${MF_EXE}"
    Delete "$0\uninstall.exe"
    Delete "$0\Uninstall ${MF_NAME}.exe"
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
Function MfRemoveOld
  StrCpy $MfOldDone 1
  nsExec::Exec 'taskkill /F /T /IM "${MF_EXE}"'
  Pop $0
  Sleep 500
  ${If} $MfTaUn != ""
    ${GetParent} $MfTaUn $2
    DetailPrint "${MF_NAME}: $2"
    ExecWait '"$MfTaUn" /S /UPDATE _?=$2'
    Delete "$MfTaUn"
    Push $2
    Call MfSweepDir
  ${EndIf}
  ${If} $MfElDir != ""
    DetailPrint "${MF_NAME} (Electron): $MfElDir"
    Push $MfElDir
    Call MfSweepDir
    ${If} $MfElRoot == "HKLM"
      DeleteRegKey HKLM "${MF_EL_UNKEY}"
      DeleteRegKey HKLM "${MF_EL_KEY}"
    ${Else}
      DeleteRegKey HKCU "${MF_EL_UNKEY}"
      DeleteRegKey HKCU "${MF_EL_KEY}"
    ${EndIf}
    ; Its shortcuts point at a program that is gone.
    Delete "$DESKTOP\${MF_NAME}.lnk"
    Delete "$SMPROGRAMS\${MF_NAME}.lnk"
    DeleteRegKey HKCU "Software\Classes\Applications\${MF_EXE}"
    ; Chromium caches of the Electron build in the shared data folder: nothing reads them now.
    RMDir /r "${MF_DATA}\Cache"
    RMDir /r "${MF_DATA}\Code Cache"
    RMDir /r "${MF_DATA}\GPUCache"
    RMDir /r "${MF_DATA}\DawnCache"
    RMDir /r "${MF_DATA}\DawnGraphiteCache"
    RMDir /r "${MF_DATA}\DawnWebGPUCache"
    RMDir /r "${MF_DATA}\Crashpad"
    RMDir /r "${MF_DATA}\blob_storage"
    RMDir /r "${MF_DATA}\Local Storage"
    RMDir /r "${MF_DATA}\Session Storage"
    RMDir /r "${MF_DATA}\Shared Dictionary"
    RMDir /r "${MF_DATA}\Network"
    Delete "${MF_DATA}\Preferences"
    Delete "${MF_DATA}\Local State"
    Delete "${MF_DATA}\SingletonLock"
    RMDir /r "$LOCALAPPDATA\myftpserver-updater"
  ${EndIf}
FunctionEnd

; Before the first page; not in silent installs.
Function MfGuiInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ClearErrors
  Call MfFindOld
  ${If} $MfTaUn != ""
  ${OrIf} $MfElDir != ""
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치된 My FTP Server 가 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다. (실행 중이면 종료되고, 실행 중인 FTP 서버도 멈춥니다.)"
    ${Else}
      StrCpy $2 "An installed My FTP Server was found.$\r$\n$\r$\nIt will be removed completely before this version is installed. (A running copy is closed, which stops its FTP servers.)"
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$2" IDOK mf_remove
    Quit
    mf_remove:
    Call MfRemoveOld
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "${MF_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MF_WEBVIEW}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 1
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치한 프로그램에서 저장한 데이터가 있습니다.$\r$\n(서버 설정, 프로파일, SSL 인증서, SSH 호스트 키, 로그, 테마·언어 설정)$\r$\n$\r$\n삭제하시겠습니까?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다.$\r$\n(호스트 키를 삭제하면 SFTP 클라이언트에 키 변경 경고가 표시됩니다.)"
    ${Else}
      StrCpy $2 "Saved data from the installed program was found.$\r$\n(server settings, profiles, SSL certificate, SSH host key, log, theme / language)$\r$\n$\r$\nDo you want to delete it?$\r$\nChoose No to carry your existing settings over.$\r$\n(Deleting the host key makes SFTP clients warn about a changed key.)"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$2" IDNO mf_keep
    RMDir /r "${MF_DATA}"
    RMDir /r "${MF_WEBVIEW}"
    mf_keep:
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs never saw MfGuiInit: the earlier copy still goes, its data stays.
  ${If} $UpdateMode <> 1
  ${AndIf} $MfOldDone <> 1
    Call MfFindOld
    Call MfRemoveOld
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM "${MF_EXE}"'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $DeleteAppDataCheckboxState = 1
    SetShellVarContext current
    RMDir /r "${MF_DATA}"
  ${EndIf}
!macroend
