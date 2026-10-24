; MyHeatManager installer hooks (included by Tauri's NSIS template).
;
; Only one MyHeatManager installation may exist. Before installing:
;  1. When a previous installation (current-user or per-machine, any version)
;     exists, the user is asked first whether to remove it completely and
;     install again (Yes) or to stop the installation (No: nothing changed).
;     Removing it: running MyHeatManager windows are closed (all of them; several
;     copies may run), its uninstaller runs silently in place with /UPDATE
;     (keeps the user data), then its folder and its shortcuts (desktop, Start
;     menu) are deleted - this installation makes the ones the user chooses.
;  2. When there is a previous installation or user data from earlier use, the
;     user is then asked, before the first wizard page and in the installer
;     language, whether to delete the user data:
;       Yes    : %APPDATA%\com.shkwon.myheatmanager (window place, install marker,
;                crash.log) and %LOCALAPPDATA%\com.shkwon.myheatmanager (the
;                WebView2 profile: settings, recent files) are deleted.
;                Model files (.myheat) the user saved elsewhere are never touched.
;       No     : the data is kept; preferences are reset at the next start
;                (step 3).
;       Cancel : the installation stops; nothing has been changed.
;     A silent installation (/S) or a passive one (/P) does not ask: the data is
;     kept.
;  3. Kept data: the preferences of the previous installation are reset. They
;     live in the WebView2 profile, which an installer cannot edit, so after
;     installing a marker is left in %APPDATA%\com.shkwon.myheatmanager\install-reset
;     and the window place is deleted. The next start resets theme, fonts,
;     panels, units, colour map and editor options, and keeps the recent files
;     (window_state.rs, resetForNewInstall in src/core/settings.js).
; Shortcuts: a "Shortcuts" page before the Start menu folder page lets the user
;  choose a desktop shortcut and a Start menu shortcut (both checked). Without
;  the Start menu one the folder page is skipped; the desktop one replaces the
;  template's check box on the finish page. Silent (/S) and passive (/P)
;  installs keep Tauri's behaviour (both, or none with /NS).
; After installing:
;  4. .myheat projects get their own icon (project.ico),
;     not the app icon.
;  5. With a Start menu shortcut, the user's guide gets one in the same folder;
;     the folder is remembered (StartMenuFolder) so that the uninstaller and the
;     next installation find a folder the user renamed.
;
; Tauri's hooks cannot add pages, so the questions are asked from MUI's GUI init
; (MUI_CUSTOMFUNCTION_GUIINIT), which runs before the first page and not with /S;
; the shortcuts page comes from wrapping MUI's MUI_PAGE_STARTMENU (and
; MUI_PAGE_FINISH loses its desktop check box), both expanded where the template
; inserts those pages, after its variables exist;
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
!include "nsDialogs.nsh"

; Every define can be set beforehand (the hook test points them at a fake installation).
!define /IfNDef MUM_NAME "MyHeatManager"
!define /IfNDef MUM_EXE "MyHeatManager.exe"
; = tauri.conf.json identifier (BUNDLEID)
!define /IfNDef MUM_ROAMING "$APPDATA\com.shkwon.myheatmanager"
!define /IfNDef MUM_LOCAL "$LOCALAPPDATA\com.shkwon.myheatmanager"
; = the template's UNINSTKEY and MANUPRODUCTKEY
!define /IfNDef MUM_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyHeatManager"
!define /IfNDef MUM_PRODKEY "Software\SHKWON\MyHeatManager"
; Where the old installation's shortcuts are (the hook test points them at a temporary folder).
!define /IfNDef MUM_DESKTOP "$DESKTOP"
!define /IfNDef MUM_SMPROGRAMS "$SMPROGRAMS"
; Answers when the questions run silently: only the hook test does that (MumGuiInit never runs with /S).
!define /IfNDef MUM_SD_REINSTALL IDYES
!define /IfNDef MUM_SD_ASK IDNO
!define /IfNDef MUM_SD_RUNNING IDCANCEL

; 1042 = Korean, 1033 = English (the installer's two languages).
LangString MumAskReinstall 1042 "이전에 설치한 MyHeatManager 가 있습니다.$\n$R9$\n$\n이전 프로그램을 완전히 삭제하고 다시 설치할까요?$\n$\n예: 이전 프로그램과 바로가기를 지우고 새로 설치합니다. 사용자 데이터는 다음 질문에서 정합니다.$\n아니오: 설치를 그만둡니다."
LangString MumAskReinstall 1033 "An earlier MyHeatManager is installed.$\n$R9$\n$\nRemove the earlier program completely and install again?$\n$\nYes: remove the earlier program and its shortcuts, then install. The next question decides about the user data.$\nNo: stop the installation."
LangString MumShortcutsTitle 1042 "바로가기"
LangString MumShortcutsTitle 1033 "Shortcuts"
LangString MumShortcutsSubtitle 1042 "MyHeatManager 바로가기를 만들 곳을 고르십시오."
LangString MumShortcutsSubtitle 1033 "Choose where to create MyHeatManager shortcuts."
LangString MumShortcutsText 1042 "선택한 곳에 MyHeatManager 를 실행하는 바로가기를 만듭니다. 시작 메뉴를 고르면 다음 페이지에서 폴더를 정합니다."
LangString MumShortcutsText 1033 "Shortcuts that start MyHeatManager are created where you choose. With the Start menu, the next page picks its folder."
LangString MumShortcutDesktop 1042 "바탕 화면에 바로가기 만들기"
LangString MumShortcutDesktop 1033 "Create a shortcut on the desktop"
LangString MumShortcutStartMenu 1042 "시작 메뉴에 바로가기 만들기 (사용 설명서 포함)"
LangString MumShortcutStartMenu 1033 "Create shortcuts in the Start menu (with the user's guide)"
LangString MumAskData 1042 "이전에 사용하던 사용자 데이터(환경 설정, 최근 파일 목록, 창 위치)를 삭제할까요? 저장한 모델 파일(.myheat)은 지우지 않습니다.$\n$\n예: 사용자 데이터를 모두 지우고 처음 설치한 상태로 시작합니다.$\n아니오: 사용자 데이터를 그대로 둡니다. 다음 실행 때 환경 설정만 기본값으로 돌아갑니다.$\n취소: 설치를 그만둡니다."
LangString MumAskData 1033 "Delete the user data from earlier use (settings, recent file list, window position)? Model files (.myheat) you saved are not deleted.$\n$\nYes: delete all user data and start as a fresh installation.$\nNo: keep the user data. Only the preferences go back to their defaults at the next start.$\nCancel: stop the installation."
LangString MumRunning 1042 "MyHeatManager 가 실행 중입니다 (창 $R9개). 설치하려면 모두 닫아야 합니다.$\n저장하지 않은 변경 내용은 사라집니다.$\n$\n확인: MyHeatManager 를 닫고 계속합니다.$\n취소: 설치를 그만둡니다."
LangString MumRunning 1033 "MyHeatManager is running ($R9 window(s)). All of them must be closed to install.$\nUnsaved changes are lost.$\n$\nOK: close MyHeatManager and continue.$\nCancel: stop the installation."

; 1 = delete the user data after installing. Deleting cannot be undone, so the default is 0.
Var MumWipe
; 1 = MumGuiInit has dealt with the previous installation.
Var MumDone
; Folders of a previous installation (current user / per machine), or "".
Var MumOldUser
Var MumOldMachine
; Shortcuts page: 1 = create (both checked at first).
Var MumDesktop
Var MumStartMenu
; The Start menu folder of the installation being removed (read before its uninstaller deletes the key).
Var MumSmFolder

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

; Registers the MyHeatManager.exe of a folder with the Restart Manager session in $R8 (if there).
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

; Running MyHeatManager processes of the old installations and of $INSTDIR: the count
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
; The folder as a whole only when it is ours (named MyHeatManager).
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

; Deletes the shortcuts of the old installation: run with /UPDATE, its uninstaller keeps them,
; and this installation makes the ones the user chooses. An update by Tauri's updater
; (this installer with /UPDATE) keeps them, as it makes none.
Function MumRemoveOldShortcuts
  Push $0
  Push $1
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${If} ${Errors}
    ReadRegStr $MumSmFolder HKCU "${MUM_PRODKEY}" "StartMenuFolder"
    ${If} $MumSmFolder == ""
      StrCpy $MumSmFolder "${MUM_NAME}"
    ${EndIf}
    Delete "${MUM_SMPROGRAMS}\$MumSmFolder\${MUM_NAME}.lnk"
    Delete "${MUM_SMPROGRAMS}\$MumSmFolder\${MUM_NAME} User's Guide.lnk"
    RMDir "${MUM_SMPROGRAMS}\$MumSmFolder"
    Delete "${MUM_SMPROGRAMS}\${MUM_NAME}.lnk"
    Delete "${MUM_DESKTOP}\${MUM_NAME}.lnk"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Removes every previous installation silently. /UPDATE keeps the user data (that is decided
; here, by MumWipe); _?= runs the uninstaller in place and waits for it.
Function MumRemoveOld
  StrCpy $MumDone 1
  ${If} "$MumOldUser$MumOldMachine" != ""
    Call MumRemoveOldShortcuts
  ${EndIf}
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

; Before the first page (not with /S). No / Cancel at any question quits with nothing changed.
Function MumGuiInit
  StrCpy $MumWipe 0
  StrCpy $MumDesktop 1
  StrCpy $MumStartMenu 1
  Call MumFindOld
  ; Passive installs (/P) do not ask: the data is kept.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/P" $1
  ${IfNot} ${Errors}
    Call MumRemoveOld
    Return
  ${EndIf}

  ; 1. Remove the earlier program and install again? ($R9: where it is.)
  ${If} "$MumOldUser$MumOldMachine" != ""
    StrCpy $R9 "$MumOldUser"
    ${If} $MumOldMachine != ""
      ${If} $R9 != ""
        StrCpy $R9 "$R9$\n"
      ${EndIf}
      StrCpy $R9 "$R9$MumOldMachine"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$(MumAskReinstall)" /SD ${MUM_SD_REINSTALL} IDYES +2
    Quit
  ${EndIf}

  ; 2. Delete the user data?
  Call MumHasData
  Pop $2
  ${If} "$MumOldUser$MumOldMachine" != ""
  ${OrIf} $2 == 1
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON2 "$(MumAskData)" /SD ${MUM_SD_ASK} IDYES mumYes IDNO mumNo
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

; Deletes the user data (after the old copy is gone and no MyHeatManager runs).
Function MumWipeData
  RMDir /r "${MUM_ROAMING}"
  RMDir /r "${MUM_LOCAL}"
FunctionEnd

; ── Shortcuts page
; MUI_PAGE_STARTMENU is wrapped: the template inserts it after declaring $PassiveMode and
; $AppStartMenuFolder, so the page and its functions are written there. The folder page keeps
; its place but loses its own "no shortcuts" box (the choice is made here) and is skipped
; without a Start menu shortcut; ">" before the folder tells MUI_STARTMENU_WRITE_BEGIN (and
; the template) to make none.
!ifmacrodef MUI_PAGE_STARTMENU
!macroundef MUI_PAGE_STARTMENU
!macro MUI_PAGE_STARTMENU ID VAR
  Var MumDesktopBox
  Var MumStartMenuBox
  Page custom MumShortcutsShow MumShortcutsLeave

  Function MumShortcutsShow
    ${If} $PassiveMode = 1
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(MumShortcutsTitle)" "$(MumShortcutsSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}
    ${NSD_CreateLabel} 0 0 100% 24u "$(MumShortcutsText)"
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "$(MumShortcutDesktop)"
    Pop $MumDesktopBox
    ${If} $MumDesktop == 1
      ${NSD_Check} $MumDesktopBox
    ${EndIf}
    ${NSD_CreateCheckbox} 0 52u 100% 12u "$(MumShortcutStartMenu)"
    Pop $MumStartMenuBox
    ${If} $MumStartMenu == 1
      ${NSD_Check} $MumStartMenuBox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function MumShortcutsLeave
    ${NSD_GetState} $MumDesktopBox $MumDesktop
    ${NSD_GetState} $MumStartMenuBox $MumStartMenu
    StrCpy $0 ${VAR} 1
    ${If} $MumStartMenu == ${BST_CHECKED}
      ${If} $0 == ">"
        StrCpy ${VAR} ${VAR} "" 1
      ${EndIf}
    ${ElseIf} $0 != ">"
      ${If} ${VAR} == ""
        StrCpy ${VAR} "${MUI_STARTMENUPAGE_DEFAULTFOLDER}"
      ${EndIf}
      StrCpy ${VAR} ">${VAR}"
    ${EndIf}
  FunctionEnd

  Function MumStartMenuPre
    Call SkipIfPassive
    ${If} $MumStartMenu != ${BST_CHECKED}
      Abort
    ${EndIf}
  FunctionEnd

  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_PRE MumStartMenuPre
  !define MUI_STARTMENUPAGE_NODISABLE
  !verbose push
  !verbose ${MUI_VERBOSE}
  !insertmacro MUI_PAGE_INIT
  !insertmacro MUI_PAGEDECLARATION_STARTMENU "${ID}" "${VAR}"
  !verbose pop
!macroend
!endif

; The finish page without the template's "Create desktop shortcut" box (chosen on the shortcuts page).
!ifmacrodef MUI_PAGE_FINISH
!macroundef MUI_PAGE_FINISH
!macro MUI_PAGE_FINISH
  !insertmacro MUI_UNSET MUI_FINISHPAGE_SHOWREADME
  !insertmacro MUI_UNSET MUI_FINISHPAGE_SHOWREADME_TEXT
  !insertmacro MUI_UNSET MUI_FINISHPAGE_SHOWREADME_FUNCTION
  !verbose push
  !verbose ${MUI_VERBOSE}
  !insertmacro MUI_PAGE_INIT
  !insertmacro MUI_PAGEDECLARATION_FINISH
  !verbose pop
!macroend
!endif

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
  WriteRegStr SHCTX "Software\Classes\MyHeatManager.Project\DefaultIcon" "" "$INSTDIR\project.ico"
  WriteRegStr SHCTX "Software\Classes\MyHeatManager.Template\DefaultIcon" "" "$INSTDIR\template.ico"
  ; Desktop shortcut chosen on the shortcuts page (silent and passive installs: the template makes it).
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
  ${AndIf} $MumDesktop == ${BST_CHECKED}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}
  ; 5. The user's guide next to the app's Start menu shortcut, and the folder for the uninstaller.
  StrCpy $0 $AppStartMenuFolder 1
  ${If} $0 != ">"
  ${AndIf} $AppStartMenuFolder != ""
  ${AndIf} ${FileExists} "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    ${If} ${FileExists} "$INSTDIR\docs\UsersGuide.html"
      CreateShortCut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME} User's Guide.lnk" "$INSTDIR\docs\UsersGuide.html"
    ${EndIf}
    WriteRegStr SHCTX "${MANUPRODUCTKEY}" "StartMenuFolder" "$AppStartMenuFolder"
  ${Else}
    DeleteRegValue SHCTX "${MANUPRODUCTKEY}" "StartMenuFolder"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Read before the template deletes the key. Tauri's uninstaller only knows the default folder.
  ReadRegStr $MumSmFolder SHCTX "${MANUPRODUCTKEY}" "StartMenuFolder"
  ${If} $MumSmFolder == ""
    StrCpy $MumSmFolder "${PRODUCTNAME}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An update (/UPDATE) keeps the shortcuts, like the template does.
  ${If} $UpdateMode <> 1
    Delete "$SMPROGRAMS\$MumSmFolder\${PRODUCTNAME} User's Guide.lnk"
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$MumSmFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      Delete "$SMPROGRAMS\$MumSmFolder\${PRODUCTNAME}.lnk"
    ${EndIf}
    RMDir "$SMPROGRAMS\$MumSmFolder"
  ${EndIf}
!macroend
