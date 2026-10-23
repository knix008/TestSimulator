; MyCircuit installer additions (read by the Tauri NSIS template).
;
; Installing
;   • An installed MyCircuit (the earlier Electron build or a Tauri build) is
;     always removed completely before this one goes in. The user is told first.
;     It is removed the way that keeps user data (Electron --updated, Tauri /UPDATE).
;   • Then, if saved data is found (settings in %APPDATA%\MyCircuit, the window's
;     storage in %LOCALAPPDATA%\com.shkwon.mycircuit, which holds the autosave),
;     the user is asked whether to delete it.
;   • .mycircuit files get MyCircuit's document icon.
; Silent installs (/S) skip both messages: the old copy is removed, data stays.
;
; Uninstalling with "Delete the application data" ticked also removes
; %APPDATA%\MyCircuit (Tauri itself only knows the folders named by the identifier).
;
; Tauri's hooks cannot add wizard pages, so the questions come before the first
; page (MUI's GUI init). This file is read near the top of the template, before
; its variables and defines exist: Functions spell the names out and use only
; the variables declared here. Hook macros expand later, inside Sections.
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define MC_NAME "MyCircuit"
!define MC_EXE "MyCircuit.exe"
!define MC_DATA "$APPDATA\MyCircuit"
!define MC_WEBVIEW "$LOCALAPPDATA\com.shkwon.mycircuit"
!define MC_PROGID "MyCircuit.Project"
; electron-builder's registration for appId com.shkwon.mycircuit (UUIDv5 of the appId).
!define MC_EL_GUID "087171fb-9c14-53cb-8c28-a3f3716d19af"
!define MC_EL_KEY "Software\${MC_EL_GUID}"
!define MC_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MC_EL_GUID}"
!define MC_EL_UNINSTALLER "Uninstall MyCircuit.exe"
; The Tauri template's UNINSTKEY for productName MyCircuit.
!define MC_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyCircuit"

; 1 once the earlier installation has been removed.
Var McOldDone
; The Tauri copy's uninstaller and the Electron copy's folder; empty when absent.
Var McTaUn
Var McElDir
; 1 when the Electron copy was installed for all users (HKLM).
Var McElMachine

!define MUI_CUSTOMFUNCTION_GUIINIT McGuiInit

; "C:\x\uninstall.exe" → C:\x\uninstall.exe
Function McUnquote
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

Function McFindOld
  StrCpy $McTaUn ""
  StrCpy $McElDir ""
  StrCpy $McElMachine 0
  ReadRegStr $0 HKCU "${MC_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call McUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $McTaUn $0
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${MC_EL_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${MC_EL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $McElMachine 1
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MC_EL_UNINSTALLER}"
    StrCpy $McElDir $0
  ${EndIf}
FunctionEnd

; Removes a folder that held MyCircuit: whole when its name says so, else only our files.
Function McSweepDir
  Exch $0
  Push $1
  StrCpy $1 $0 "" -9
  ${If} $1 == "${MC_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\${MC_EXE}"
    Delete "$0\uninstall.exe"
    Delete "$0\${MC_EL_UNINSTALLER}"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Silently removes the earlier copies; user data is not touched here.
; _?= runs the uninstaller in place, so ExecWait really waits for it.
Function McRemoveOld
  StrCpy $McOldDone 1
  ${If} $McTaUn != ""
    ${GetParent} $McTaUn $2
    DetailPrint "${MC_NAME}: $2"
    ExecWait '"$McTaUn" /S /UPDATE _?=$2'
    Push $2
    Call McSweepDir
  ${EndIf}
  ${If} $McElDir != ""
    DetailPrint "${MC_NAME} (Electron): $McElDir"
    ${If} $McElMachine == 1
      ExecWait '"$McElDir\${MC_EL_UNINSTALLER}" /S --updated /allusers _?=$McElDir'
    ${Else}
      ExecWait '"$McElDir\${MC_EL_UNINSTALLER}" /S --updated /currentuser _?=$McElDir'
    ${EndIf}
    Push $McElDir
    Call McSweepDir
    DeleteRegKey HKCU "${MC_EL_UNKEY}"
    DeleteRegKey HKCU "${MC_EL_KEY}"
    ; Its shortcuts point at a program that is gone.
    Delete "$DESKTOP\${MC_NAME}.lnk"
    Delete "$SMPROGRAMS\${MC_NAME}.lnk"
    ; Chromium caches of the Electron build in the shared data folder: nothing reads them now.
    RMDir /r "${MC_DATA}\Cache"
    RMDir /r "${MC_DATA}\Code Cache"
    RMDir /r "${MC_DATA}\GPUCache"
    RMDir /r "${MC_DATA}\DawnCache"
    RMDir /r "${MC_DATA}\DawnGraphiteCache"
    RMDir /r "${MC_DATA}\DawnWebGPUCache"
    RMDir /r "${MC_DATA}\Crashpad"
    RMDir /r "${MC_DATA}\blob_storage"
    RMDir /r "${MC_DATA}\Shared Dictionary"
  ${EndIf}
FunctionEnd

; Before the first page; not in silent installs.
Function McGuiInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ClearErrors
  Call McFindOld
  ${If} $McTaUn != ""
  ${OrIf} $McElDir != ""
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치된 MyCircuit 가 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다."
    ${Else}
      StrCpy $2 "An installed MyCircuit was found.$\r$\n$\r$\nIt will be removed completely before this version is installed."
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$2" IDOK mc_remove
    Quit
    mc_remove:
    Call McRemoveOld
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "${MC_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MC_WEBVIEW}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 1
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치한 프로그램에서 저장한 데이터(설정, 자동 저장)가 있습니다. 삭제하시겠습니까?"
    ${Else}
      StrCpy $2 "Saved data from the installed program was found (settings, autosave). Do you want to delete it?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$2" IDNO mc_keep
    RMDir /r "${MC_DATA}"
    RMDir /r "${MC_WEBVIEW}"
    mc_keep:
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs never saw McGuiInit: the earlier copy still goes, its data stays.
  ${If} $UpdateMode <> 1
  ${AndIf} $McOldDone <> 1
    Call McFindOld
    Call McRemoveOld
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; .mycircuit files show the document icon rather than the program icon.
  WriteRegStr SHCTX "Software\Classes\${MC_PROGID}\DefaultIcon" "" "$INSTDIR\file-icon.ico,0"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $DeleteAppDataCheckboxState = 1
    SetShellVarContext current
    RMDir /r "${MC_DATA}"
  ${EndIf}
!macroend
