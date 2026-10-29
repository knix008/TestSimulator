; MyArchitecture installer additions (read by the Tauri NSIS template).
;
; Installing
;   • An installed MyArchitecture (the earlier Electron build or a Tauri build) is
;     always removed completely before this one goes in. The user is told first.
;     It is removed the way that keeps user data (Electron --updated, Tauri /UPDATE).
;   • Then, if saved data is found (settings in %APPDATA%\MyArchitecture, the window's
;     storage in %LOCALAPPDATA%\com.shkwon.myarchitecture, which holds the autosave),
;     the user is asked whether to delete it.
;   • .myarch files get MyArchitecture's document icon.
; The language page comes first: 한국어 or English, asked on every install.
; Silent installs (/S) skip both messages: the old copy is removed, data stays.
;
; Uninstalling with "Delete the application data" ticked also removes
; %APPDATA%\MyArchitecture (Tauri itself only knows the folders named by the identifier).
;
; Tauri's hooks cannot add wizard pages, so the questions come before the first
; page (MUI's GUI init). This file is read near the top of the template, before
; its variables and defines exist: Functions spell the names out and use only
; the variables declared here. Hook macros expand later, inside Sections.
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

; The installer asks for its language (한국어 / English) every time, also after
; an earlier install saved the choice in the registry.
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_WINDOWTITLE "MyArchitecture"
!define MUI_LANGDLL_INFO "설치 언어를 선택하세요.$\r$\nPlease select the installer language."

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define MA_NAME "MyArchitecture"
!define MA_EXE "MyArchitecture.exe"
!define MA_DATA "$APPDATA\MyArchitecture"
!define MA_WEBVIEW "$LOCALAPPDATA\com.shkwon.myarchitecture"
!define MA_PROGID "MyArchitecture.Project"
; electron-builder's registration for appId com.shkwon.myarchitecture (UUIDv5 of the appId).
!define MA_EL_GUID "d6c97b2a-3549-5df5-9114-8eca8a621a4c"
!define MA_EL_KEY "Software\${MA_EL_GUID}"
!define MA_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MA_EL_GUID}"
!define MA_EL_UNINSTALLER "Uninstall MyArchitecture.exe"
; The Tauri template's UNINSTKEY for productName MyArchitecture.
!define MA_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyArchitecture"

; 1 once the earlier installation has been removed.
Var MaOldDone
; The Tauri copy's uninstaller and the Electron copy's folder; empty when absent.
Var MaTaUn
Var MaElDir
; 1 when the Electron copy was installed for all users (HKLM).
Var MaElMachine

!define MUI_CUSTOMFUNCTION_GUIINIT MaGuiInit

; "C:\x\uninstall.exe" → C:\x\uninstall.exe
Function MaUnquote
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

Function MaFindOld
  StrCpy $MaTaUn ""
  StrCpy $MaElDir ""
  StrCpy $MaElMachine 0
  ReadRegStr $0 HKCU "${MA_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call MaUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $MaTaUn $0
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${MA_EL_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${MA_EL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $MaElMachine 1
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MA_EL_UNINSTALLER}"
    StrCpy $MaElDir $0
  ${EndIf}
FunctionEnd

; Removes a folder that held MyArchitecture: whole when its name says so, else only our files.
Function MaSweepDir
  Exch $0
  Push $1
  StrCpy $1 $0 "" -14
  ${If} $1 == "${MA_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\${MA_EXE}"
    Delete "$0\uninstall.exe"
    Delete "$0\${MA_EL_UNINSTALLER}"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Silently removes the earlier copies; user data is not touched here.
; _?= runs the uninstaller in place, so ExecWait really waits for it.
Function MaRemoveOld
  StrCpy $MaOldDone 1
  ${If} $MaTaUn != ""
    ${GetParent} $MaTaUn $2
    DetailPrint "${MA_NAME}: $2"
    ExecWait '"$MaTaUn" /S /UPDATE _?=$2'
    Push $2
    Call MaSweepDir
  ${EndIf}
  ${If} $MaElDir != ""
    DetailPrint "${MA_NAME} (Electron): $MaElDir"
    ${If} $MaElMachine == 1
      ExecWait '"$MaElDir\${MA_EL_UNINSTALLER}" /S --updated /allusers _?=$MaElDir'
    ${Else}
      ExecWait '"$MaElDir\${MA_EL_UNINSTALLER}" /S --updated /currentuser _?=$MaElDir'
    ${EndIf}
    Push $MaElDir
    Call MaSweepDir
    DeleteRegKey HKCU "${MA_EL_UNKEY}"
    DeleteRegKey HKCU "${MA_EL_KEY}"
    ; Its shortcuts point at a program that is gone.
    Delete "$DESKTOP\${MA_NAME}.lnk"
    Delete "$SMPROGRAMS\${MA_NAME}.lnk"
    ; Chromium caches of the Electron build in the shared data folder: nothing reads them now.
    RMDir /r "${MA_DATA}\Cache"
    RMDir /r "${MA_DATA}\Code Cache"
    RMDir /r "${MA_DATA}\GPUCache"
    RMDir /r "${MA_DATA}\DawnCache"
    RMDir /r "${MA_DATA}\DawnGraphiteCache"
    RMDir /r "${MA_DATA}\DawnWebGPUCache"
    RMDir /r "${MA_DATA}\Crashpad"
    RMDir /r "${MA_DATA}\blob_storage"
    RMDir /r "${MA_DATA}\Shared Dictionary"
  ${EndIf}
FunctionEnd

; Before the first page; not in silent installs.
Function MaGuiInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ClearErrors
  Call MaFindOld
  ${If} $MaTaUn != ""
  ${OrIf} $MaElDir != ""
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치된 MyArchitecture 가 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다."
    ${Else}
      StrCpy $2 "An installed MyArchitecture was found.$\r$\n$\r$\nIt will be removed completely before this version is installed."
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$2" IDOK ma_remove
    Quit
    ma_remove:
    Call MaRemoveOld
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "${MA_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MA_WEBVIEW}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 1
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치한 프로그램에서 저장한 데이터(설정, 자동 저장)가 있습니다. 삭제하시겠습니까?"
    ${Else}
      StrCpy $2 "Saved data from the installed program was found (settings, autosave). Do you want to delete it?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$2" IDNO ma_keep
    RMDir /r "${MA_DATA}"
    RMDir /r "${MA_WEBVIEW}"
    ma_keep:
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs never saw MaGuiInit: the earlier copy still goes, its data stays.
  ${If} $UpdateMode <> 1
  ${AndIf} $MaOldDone <> 1
    Call MaFindOld
    Call MaRemoveOld
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; .myarch files show the document icon rather than the program icon.
  WriteRegStr SHCTX "Software\Classes\${MA_PROGID}\DefaultIcon" "" "$INSTDIR\file-icon.ico,0"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $DeleteAppDataCheckboxState = 1
    SetShellVarContext current
    RMDir /r "${MA_DATA}"
  ${EndIf}
!macroend
