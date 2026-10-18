; MyUMLMaker installer hooks (included by Tauri's NSIS template).
;
; Only one MyUMLMaker installation may exist. Before installing:
;  1. A previous installation (current-user or per-machine, any version) is
;     always removed completely: running MyUMLMaker windows are closed (all of
;     them; several copies may run), its uninstaller runs silently in place with
;     /UPDATE (keeps the user data), then its folder is deleted.
;  2. When there is a previous installation or user data from earlier use, the
;     user is asked, before the first wizard page and in the installer language,
;     whether to delete the user data:
;       Yes    : %APPDATA%\com.shkwon.myumlmaker (window place, install marker,
;                background pictures, crash.log) and
;                %LOCALAPPDATA%\com.shkwon.myumlmaker (the WebView2 profile:
;                settings, recent files and folders, the open-project session,
;                the database connection, the tutorial history) are deleted.
;       No     : the data is kept; preferences are reset at the next start
;                (step 3).
;       Cancel : the installation stops; nothing has been changed.
;     A silent installation (/S) or a passive one (/P) does not ask: the data is
;     kept.
;  3. Kept data: the preferences of the previous installation are reset. They
;     live in the WebView2 profile, which an installer cannot edit, so after
;     installing a marker is left in %APPDATA%\com.shkwon.myumlmaker\install-reset
;     and the window place is deleted. The next start resets theme, fonts, zoom,
;     panels, view options, popup places, column widths and print choices, and
;     keeps recent files and folders, the open-project session, the database
;     connection, the background image and the tutorial history (window_state.rs,
;     resetForNewInstall in settings.js).
; After installing:
;  4. .myuml projects and .mumlt templates get their own icons (project.ico,
;     template.ico), not the app icon.
;
; Tauri's hooks cannot add pages, so the question is asked from MUI's GUI init
; (MUI_CUSTOMFUNCTION_GUIINIT), which runs before the first page and not with /S;
; NSIS_HOOK_PREINSTALL repeats the removal for silent installs. Removing the old
; copy there also makes Tauri's own "already installed" page skip itself.
; This file is included at the top of installer.nsi, before the template's
; variables ($UpdateMode, ...) and defines (${BUNDLEID}, ${PRODUCTNAME}, ...)
; exist: Functions here use only their own defines and variables. The hook
; macros expand later, inside Sections, and may use the template's.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; Every define can be set beforehand (the hook test points them at a fake installation).
!define /IfNDef MUM_NAME "MyUMLMaker"
!define /IfNDef MUM_EXE "MyUMLMaker.exe"
; = tauri.conf.json identifier (BUNDLEID)
!define /IfNDef MUM_ROAMING "$APPDATA\com.shkwon.myumlmaker"
!define /IfNDef MUM_LOCAL "$LOCALAPPDATA\com.shkwon.myumlmaker"
; = the template's UNINSTKEY and MANUPRODUCTKEY
!define /IfNDef MUM_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyUMLMaker"
!define /IfNDef MUM_PRODKEY "Software\SHKWON\MyUMLMaker"
; Answers when the questions run silently: only the hook test does that (MumGuiInit never runs with /S).
!define /IfNDef MUM_SD_ASK IDNO
!define /IfNDef MUM_SD_RUNNING IDCANCEL

; 1042 = Korean, 1033 = English (the installer's two languages).
LangString MumOldFound 1042 "이전에 설치한 MyUMLMaker 가 있습니다. 완전히 지운 뒤 새로 설치합니다."
LangString MumOldFound 1033 "An earlier MyUMLMaker is installed. It is removed completely before installing."
LangString MumAskData 1042 "이전에 사용하던 사용자 데이터(설정, 최근 파일·폴더, 열린 프로젝트 목록, 데이터베이스 연결, 배경 그림, 튜토리얼 기록, 창 위치)를 삭제할까요?$\n$\n예: 사용자 데이터를 모두 지우고 처음 설치한 상태로 시작합니다.$\n아니오: 사용자 데이터를 그대로 둡니다. 다음 실행 때 환경 설정만 기본값으로 돌아갑니다.$\n취소: 설치를 그만둡니다."
LangString MumAskData 1033 "Delete the user data from earlier use (settings, recent files and folders, the list of open projects, database connection, background pictures, tutorial history, window position)?$\n$\nYes: delete all user data and start as a fresh installation.$\nNo: keep the user data. Only the preferences go back to their defaults at the next start.$\nCancel: stop the installation."
LangString MumRunning 1042 "MyUMLMaker 가 실행 중입니다 (창 $R9개). 설치하려면 모두 닫아야 합니다.$\n저장하지 않은 변경 내용은 사라집니다.$\n$\n확인: MyUMLMaker 를 닫고 계속합니다.$\n취소: 설치를 그만둡니다."
LangString MumRunning 1033 "MyUMLMaker is running ($R9 window(s)). All of them must be closed to install.$\nUnsaved changes are lost.$\n$\nOK: close MyUMLMaker and continue.$\nCancel: stop the installation."

; 1 = delete the user data after installing. Deleting cannot be undone, so the default is 0.
Var MumWipe
; 1 = MumGuiInit has dealt with the previous installation.
Var MumDone
; Folders of a previous installation (current user / per machine), or "".
Var MumOldUser
Var MumOldMachine

!define MUI_CUSTOMFUNCTION_GUIINIT MumGuiInit

; Strips the quotes around a registry path ("C:\...\uninstall.exe").
Function MumUnquote
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

; The folder of the installation registered under one registry root, or "".
!macro MUM_FIND_IN root var
  StrCpy ${var} ""
  ReadRegStr $0 ${root} "${MUM_UNKEY}" "UninstallString"
  Push $0
  Call MumUnquote
  Pop $0
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    ${GetParent} "$0" ${var}
  ${Else}
    ReadRegStr $0 ${root} "${MUM_PRODKEY}" ""
    Push $0
    Call MumUnquote
    Pop $0
    ${If} $0 != ""
    ${AndIf} ${FileExists} "$0\uninstall.exe"
      StrCpy ${var} $0
    ${EndIf}
  ${EndIf}
!macroend

; Finds previous installations. A registration whose files are gone is removed, so that
; neither this installer nor Windows' app list shows a broken entry.
Function MumFindOld
  Push $0
  !insertmacro MUM_FIND_IN HKCU $MumOldUser
  !insertmacro MUM_FIND_IN HKLM $MumOldMachine
  ${If} $MumOldUser == ""
    ReadRegStr $0 HKCU "${MUM_UNKEY}" "UninstallString"
    ${If} $0 != ""
      DeleteRegKey HKCU "${MUM_UNKEY}"
    ${EndIf}
  ${EndIf}
  Pop $0
FunctionEnd

; 1 when the folder holds anything, else 0.
Function MumDirHasEntries
  Exch $0
  Push $1
  Push $2
  Push $3
  StrCpy $3 0
  ClearErrors
  FindFirst $1 $2 "$0\*.*"
  ${DoWhile} $2 != ""
    ${If} $2 != "."
    ${AndIf} $2 != ".."
      StrCpy $3 1
      ${Break}
    ${EndIf}
    FindNext $1 $2
  ${Loop}
  FindClose $1
  StrCpy $0 $3
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; 1 when there is user data from earlier use.
Function MumHasData
  Push $0
  Push $1
  Push "${MUM_ROAMING}"
  Call MumDirHasEntries
  Pop $0
  Push "${MUM_LOCAL}"
  Call MumDirHasEntries
  Pop $1
  IntOp $0 $0 | $1
  Exch $0
  Exch
  Pop $1
FunctionEnd

; Registers the MyUMLMaker.exe of a folder with the Restart Manager session in $R8 (if there).
Function MumRegister
  Exch $0
  Push $1
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MUM_EXE}"
    System::Call 'RSTRTMGR::RmRegisterResources(i R8, i 1, *ws, i 0, p 0, i 0, p 0) i .r1' "$0\${MUM_EXE}"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Running MyUMLMaker processes of the old installations and of $INSTDIR: the count
; (pushed), and with "close" pushed first, they are all closed. Several copies may run.
Function MumRunningApps
  Exch $R7
  Push $R8
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $1 0
  !insertmacro RestartManager_StartSession $R8
  ${If} $R8 != ""
    Push $MumOldUser
    Call MumRegister
    Push $MumOldMachine
    Call MumRegister
    ${If} $INSTDIR != $MumOldUser
    ${AndIf} $INSTDIR != $MumOldMachine
      Push $INSTDIR
      Call MumRegister
    ${EndIf}
    ; ERROR_MORE_DATA (234): $1 processes use the files.
    StrCpy $1 0
    System::Call 'RSTRTMGR::RmGetList(i R8, *i .r1, *i 0 r2, p 0, *i .r3) i .r0'
    ${If} $0 <> 234
      StrCpy $1 0
    ${EndIf}
    ${If} $R7 == "close"
    ${AndIf} $1 > 0
      System::Call 'RSTRTMGR::RmShutdown(i R8, i ${RmForceShutdown}, p 0) i .r0'
    ${EndIf}
    !insertmacro RestartManager_EndSession $R8
  ${EndIf}
  StrCpy $R7 $1
  Pop $3
  Pop $2
  Pop $1
  Pop $0
  Pop $R8
  Exch $R7
FunctionEnd

; Deletes the files of one old installation folder that its uninstaller (run in place) leaves.
; The folder as a whole only when it is ours (named MyUMLMaker).
Function MumSweep
  Exch $0
  Push $1
  ${GetFileName} "$0" $1
  ${If} $1 == "${MUM_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\uninstall.exe"
    Delete "$0\${MUM_EXE}"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Removes every previous installation silently. /UPDATE keeps the user data (that is decided
; here, by MumWipe); _?= runs the uninstaller in place and waits for it.
Function MumRemoveOld
  StrCpy $MumDone 1
  ${If} $MumOldUser != ""
    DetailPrint "Removing the previous installation: $MumOldUser"
    ExecWait '"$MumOldUser\uninstall.exe" /S /UPDATE _?=$MumOldUser'
    Push $MumOldUser
    Call MumSweep
    DeleteRegKey HKCU "${MUM_UNKEY}"
  ${EndIf}
  ${If} $MumOldMachine != ""
    ; A per-machine copy needs administrator rights: one elevated command removes it and its folder.
    DetailPrint "Removing the previous installation: $MumOldMachine"
    ${GetFileName} "$MumOldMachine" $0
    ${If} $0 == "${MUM_NAME}"
      ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c start "" /wait "$MumOldMachine\uninstall.exe" /S /UPDATE _?=$MumOldMachine & rmdir /s /q "$MumOldMachine"' SW_HIDE
    ${Else}
      ExecShellWait "runas" "$MumOldMachine\uninstall.exe" '/S /UPDATE _?=$MumOldMachine' SW_HIDE
    ${EndIf}
  ${EndIf}
FunctionEnd

; Before the first page (not with /S). Cancel at either question quits with nothing changed.
Function MumGuiInit
  StrCpy $MumWipe 0
  Call MumFindOld
  ; Passive installs (/P) do not ask: the data is kept.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/P" $1
  ${IfNot} ${Errors}
    Call MumRemoveOld
    Return
  ${EndIf}

  Call MumHasData
  Pop $2
  ${If} "$MumOldUser$MumOldMachine" != ""
    StrCpy $3 "$(MumOldFound)$\n$\n$(MumAskData)"
  ${Else}
    StrCpy $3 "$(MumAskData)"
  ${EndIf}
  ${If} "$MumOldUser$MumOldMachine" != ""
  ${OrIf} $2 == 1
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON2 "$3" /SD ${MUM_SD_ASK} IDYES mumYes IDNO mumNo
    Quit
    mumYes:
      StrCpy $MumWipe 1
    mumNo:
  ${EndIf}

  ; Every running window must be closed before files are replaced or data deleted.
  Push "count"
  Call MumRunningApps
  Pop $R9
  ${If} $R9 > 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(MumRunning)" /SD ${MUM_SD_RUNNING} IDOK +2
    Quit
    Push "close"
    Call MumRunningApps
    Pop $R9
  ${EndIf}

  Call MumRemoveOld
FunctionEnd

; Deletes the user data (after the old copy is gone and no MyUMLMaker runs).
Function MumWipeData
  RMDir /r "${MUM_ROAMING}"
  RMDir /r "${MUM_LOCAL}"
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; 1. Silent installs: MumGuiInit did not run. No question; the data is kept.
  ${If} $MumDone != 1
    Call MumFindOld
    Call MumRemoveOld
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MumWipe == 1
    ; 2. Yes: a fresh start, no marker needed.
    Call MumWipeData
  ${Else}
    ; 3. Preferences: reset at the next start. Written after the old uninstaller ran.
    CreateDirectory "$APPDATA\${BUNDLEID}"
    Delete "$APPDATA\${BUNDLEID}\window-state.json"
    System::Call 'kernel32::GetTickCount() i .r9'
    FileOpen $R9 "$APPDATA\${BUNDLEID}\install-reset" w
    FileWrite $R9 "$9"
    FileClose $R9
  ${EndIf}
  ; 4. Document icons (Tauri registers the types with the app icon).
  WriteRegStr SHCTX "Software\Classes\MyUMLMaker.Project\DefaultIcon" "" "$INSTDIR\project.ico"
  WriteRegStr SHCTX "Software\Classes\MyUMLMaker.Template\DefaultIcon" "" "$INSTDIR\template.ico"
  ; Start menu shortcut to the user's guide installed with the program.
  ${If} ${FileExists} "$INSTDIR\docs\UsersGuide.html"
    CreateDirectory "$SMPROGRAMS\${PRODUCTNAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCTNAME}\MyUMLMaker User's Guide.lnk" "$INSTDIR\docs\UsersGuide.html"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\${PRODUCTNAME}\MyUMLMaker User's Guide.lnk"
!macroend
