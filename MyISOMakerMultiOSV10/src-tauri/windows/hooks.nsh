; MyISOMaker installer additions (read by the Tauri NSIS template).
;
; Installing
;   • An installed MyISOMaker (Tauri) or the earlier Electron build ("ISO Maker")
;     is always removed completely before this one goes in. The user is told first.
;     The Electron copy is removed by hand (its own uninstaller would also wipe its
;     data, which is the next question's to decide).
;   • Then, if saved data is found (remembered folders in %APPDATA%\MyISOMaker or
;     %APPDATA%\ISO Maker, the window storage in %LOCALAPPDATA%\com.shkwon.myisomaker,
;     packages the program installed in %LOCALAPPDATA%\MyISOMaker), the user is asked
;     whether to delete it.
; Silent installs (/S) skip the messages: the old copy is removed, data stays.
;
; The installer's language (Korean / English, chosen in its first dialog) is written to
; installer-options.json; the program starts in that language once after installing.
;
; Uninstalling removes the packages the program installed (%LOCALAPPDATA%\MyISOMaker\tools);
; with "Delete the application data" ticked also %APPDATA%\MyISOMaker.
;
; Tauri's hooks cannot add wizard pages, so the questions come before the first
; page (MUI's GUI init). Functions spell names out and use only the variables
; declared here (this file is read before the template's own).
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define MI_NAME "MyISOMaker"
!define MI_EXE "MyISOMaker.exe"
!define MI_DATA "$APPDATA\MyISOMaker"
!define MI_OLD_DATA "$APPDATA\ISO Maker"
!define MI_LOCAL "$LOCALAPPDATA\MyISOMaker"
!define MI_WEBVIEW "$LOCALAPPDATA\com.shkwon.myisomaker"
; The Electron build: productName "ISO Maker", appId com.shkwon.isomaker (electron-builder's UUIDv5 of it).
!define MI_EL_NAME "ISO Maker"
!define MI_EL_EXE "ISO Maker.exe"
!define MI_EL_GUID "7531e4b2-a09b-51bc-9873-66421b4f39ff"
!define MI_EL_KEY "Software\${MI_EL_GUID}"
!define MI_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MI_EL_GUID}"
!define MI_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyISOMaker"

Var MiOldDone
Var MiTaUn
Var MiElDir
Var MiElRoot

!define MUI_CUSTOMFUNCTION_GUIINIT MiGuiInit

Function MiUnquote
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

Function MiFindOld
  StrCpy $MiTaUn ""
  StrCpy $MiElDir ""
  StrCpy $MiElRoot ""
  ReadRegStr $0 HKCU "${MI_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call MiUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $MiTaUn $0
    ${EndIf}
  ${EndIf}
  ReadRegStr $0 HKCU "${MI_EL_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $MiElRoot "HKCU"
  ${Else}
    ReadRegStr $0 HKLM "${MI_EL_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $MiElRoot "HKLM"
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MI_EL_EXE}"
    StrCpy $MiElDir $0
  ${EndIf}
FunctionEnd

; Removes a folder that held the program: whole when its name says so, else only our files.
Function MiSweepDir
  Exch $0
  Push $1
  StrCpy $1 $0 "" -10
  ${If} $1 == "${MI_NAME}"
    RMDir /r "$0"
  ${Else}
    StrCpy $1 $0 "" -9
    ${If} $1 == "${MI_EL_NAME}"
      RMDir /r "$0"
    ${Else}
      Delete "$0\${MI_EXE}"
      Delete "$0\${MI_EL_EXE}"
      Delete "$0\uninstall.exe"
      Delete "$0\Uninstall ${MI_EL_NAME}.exe"
      Delete "$0\installer-options.json"
      RMDir /r "$0\sidecar"
      RMDir /r "$0\vendor"
      RMDir /r "$0\resources"
      RMDir "$0"
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Silently removes the earlier copies; user data is not touched here.
Function MiRemoveOld
  StrCpy $MiOldDone 1
  nsExec::Exec 'taskkill /F /T /IM "${MI_EXE}"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "${MI_EL_EXE}"'
  Pop $0
  Sleep 500
  ${If} $MiTaUn != ""
    ${GetParent} $MiTaUn $2
    DetailPrint "${MI_NAME}: $2"
    ExecWait '"$MiTaUn" /S /UPDATE _?=$2'
    Push $2
    Call MiSweepDir
  ${EndIf}
  ${If} $MiElDir != ""
    DetailPrint "${MI_EL_NAME} (Electron): $MiElDir"
    Push $MiElDir
    Call MiSweepDir
    ${If} $MiElRoot == "HKLM"
      DeleteRegKey HKLM "${MI_EL_UNKEY}"
      DeleteRegKey HKLM "${MI_EL_KEY}"
    ${Else}
      DeleteRegKey HKCU "${MI_EL_UNKEY}"
      DeleteRegKey HKCU "${MI_EL_KEY}"
    ${EndIf}
    Delete "$DESKTOP\${MI_EL_NAME}.lnk"
    Delete "$SMPROGRAMS\${MI_EL_NAME}.lnk"
    Delete "$SMPROGRAMS\${MI_EL_NAME}\${MI_EL_NAME}.lnk"
    RMDir "$SMPROGRAMS\${MI_EL_NAME}"
    ; Chromium caches of the Electron build: nothing reads them now.
    RMDir /r "${MI_OLD_DATA}\Cache"
    RMDir /r "${MI_OLD_DATA}\Code Cache"
    RMDir /r "${MI_OLD_DATA}\GPUCache"
    RMDir /r "${MI_OLD_DATA}\DawnCache"
    RMDir /r "${MI_OLD_DATA}\DawnGraphiteCache"
    RMDir /r "${MI_OLD_DATA}\DawnWebGPUCache"
    RMDir /r "${MI_OLD_DATA}\Crashpad"
    RMDir /r "${MI_OLD_DATA}\blob_storage"
    RMDir /r "${MI_OLD_DATA}\Session Storage"
    RMDir /r "${MI_OLD_DATA}\Shared Dictionary"
    RMDir /r "$LOCALAPPDATA\iso-maker-multi-os-updater"
  ${EndIf}
FunctionEnd

Function MiGuiInit
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${IfNot} ${Errors}
    Return
  ${EndIf}
  ClearErrors
  Call MiFindOld
  ${If} $MiTaUn != ""
  ${OrIf} $MiElDir != ""
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치된 MyISOMaker(또는 예전 ISO Maker)가 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다. (실행 중이면 종료됩니다.)"
    ${Else}
      StrCpy $2 "An installed MyISOMaker (or the earlier ISO Maker) was found.$\r$\n$\r$\nIt will be removed completely before this version is installed. (A running copy is closed.)"
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$2" IDOK mi_remove
    Quit
    mi_remove:
    Call MiRemoveOld
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "${MI_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MI_OLD_DATA}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MI_WEBVIEW}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} ${FileExists} "${MI_LOCAL}\*.*"
    StrCpy $0 1
  ${EndIf}
  ${If} $0 == 1
    ${If} $LANGUAGE == 1042
      StrCpy $2 "이미 설치한 프로그램에서 저장한 데이터(설정, 최근 이미지, 테마, 프로그램이 설치한 패키지)가 있습니다. 삭제하시겠습니까?"
    ${Else}
      StrCpy $2 "Saved data from the installed program was found (settings, recent images, themes, packages the program installed). Do you want to delete it?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$2" IDNO mi_keep
    RMDir /r "${MI_DATA}"
    RMDir /r "${MI_OLD_DATA}"
    RMDir /r "${MI_WEBVIEW}"
    RMDir /r "${MI_LOCAL}"
    mi_keep:
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode <> 1
  ${AndIf} $MiOldDone <> 1
    Call MiFindOld
    Call MiRemoveOld
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The language picked for this installer: the program starts in it once (it reads and
  ; deletes this file on its first start), later choices in Settings are kept.
  FileOpen $0 "$INSTDIR\installer-options.json" w
  ${If} $LANGUAGE == 1042
    FileWrite $0 '{"locale":"ko"}'
  ${Else}
    FileWrite $0 '{"locale":"en"}'
  ${EndIf}
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM "${MI_EXE}"'
  Pop $0
  Delete "$INSTDIR\installer-options.json"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    ; Packages the program installed live in its own folder: they go with it.
    RMDir /r "${MI_LOCAL}\tools"
    RMDir "${MI_LOCAL}"
    ${If} $DeleteAppDataCheckboxState = 1
      RMDir /r "${MI_DATA}"
      RMDir /r "${MI_OLD_DATA}"
    ${EndIf}
  ${EndIf}
!macroend
