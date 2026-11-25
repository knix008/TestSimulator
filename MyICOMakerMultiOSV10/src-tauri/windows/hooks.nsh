; MyICOMaker installer hooks (included by Tauri's NSIS template).
;
; Only one MyICOMaker installation may exist. Before installing:
;  1. When a previous installation (current-user or per-machine, any version)
;     exists, the user is asked first whether to remove it completely and
;     install again (Yes) or to stop the installation (No: nothing changed).
;     Removing it: running MyICOMaker windows are closed (all of them; several
;     copies may run), its uninstaller runs silently in place with /UPDATE
;     (keeps the user data), then its folder and its shortcuts (desktop, Start
;     menu) are deleted - this installation makes the ones the user chooses.
;  2. When there is a previous installation or user data from earlier use, the
;     user is then asked, before the first wizard page and in the installer
;     language, whether to delete the user data:
;       Yes    : %APPDATA%\com.shkwon.myicomaker (window place, install marker,
;                background pictures, crash.log) and
;                %LOCALAPPDATA%\com.shkwon.myicomaker (the WebView2 profile:
;                settings, recent files, the start screen arrangement, the last
;                design) are deleted.
;       No     : the data is kept; preferences are reset at the next start
;                (step 3).
;       Cancel : the installation stops; nothing has been changed.
;     A silent installation (/S) or a passive one (/P) does not ask: the data is
;     kept.
;  3. Kept data: the preferences of the previous installation are reset. They
;     live in the WebView2 profile, which an installer cannot edit, so after
;     installing a marker is left in %APPDATA%\com.shkwon.myicomaker\install-reset
;     and the window place is deleted. The next start resets theme, fonts, zoom,
;     panels, view options, popup places, column widths and print choices, and
;     keeps recent files and the last design; ;     connection, the background image and the tutorial history (window_state.rs,
;     resetForNewInstall in settings.js).
; Shortcuts: a "Shortcuts" page before the Start menu folder page lets the user
;  choose a desktop shortcut and a Start menu shortcut (both checked). Without
;  the Start menu one the folder page is skipped; the desktop one replaces the
;  template's check box on the finish page. Silent (/S) and passive (/P)
;  installs keep Tauri's behaviour (both, or none with /NS).
; Language: the selector opens at every installation with both languages. The template
;  remembers the last choice in the registry, and NSIS then skips the selector unless
;  MUI_LANGDLL_ALWAYSSHOW is defined; without MUI_LANGDLL_ALLLANGUAGES it also hides languages
;  outside the system's code page (and with one left, the whole selector). The choice goes to
;  %APPDATA%\com.shkwon.myicomaker\install-language, which the next start reads (once): the
;  program opens in the language of the installation. Silent and passive installs choose nothing
;  and write nothing, so an update keeps the user's language.
; After installing:
;  4. .myico designs open with MyICOMaker (registered by Tauri with the app icon).
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
!define /IfNDef MIM_NAME "MyICOMaker"
!define /IfNDef MIM_EXE "MyICOMaker.exe"
; = tauri.conf.json identifier (BUNDLEID)
!define /IfNDef MIM_ROAMING "$APPDATA\com.shkwon.myicomaker"
!define /IfNDef MIM_LOCAL "$LOCALAPPDATA\com.shkwon.myicomaker"
; = the template's UNINSTKEY and MANUPRODUCTKEY
!define /IfNDef MIM_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyICOMaker"
!define /IfNDef MIM_PRODKEY "Software\SHKWON\MyICOMaker"
; Where the old installation's shortcuts are (the hook test points them at a temporary folder).
!define /IfNDef MIM_DESKTOP "$DESKTOP"
!define /IfNDef MIM_SMPROGRAMS "$SMPROGRAMS"
; Answers when the questions run silently: only the hook test does that (MimGuiInit never runs with /S).
!define /IfNDef MIM_SD_REINSTALL IDYES
!define /IfNDef MIM_SD_ASK IDNO
!define /IfNDef MIM_SD_RUNNING IDCANCEL

; The language selector: always shown, always with both languages, in both languages.
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "언어 / Language"
!define MUI_LANGDLL_INFO "설치와 프로그램에 사용할 언어를 고르십시오.$\nChoose the language of the installer and the program."

; 1042 = Korean, 1033 = English (the installer's two languages).
LangString MimAskReinstall 1042 "이전에 설치한 MyICOMaker 가 있습니다.$\n$R9$\n$\n이전 프로그램을 완전히 삭제하고 다시 설치할까요?$\n$\n예: 이전 프로그램과 바로가기를 지우고 새로 설치합니다. 사용자 데이터는 다음 질문에서 정합니다.$\n아니오: 설치를 그만둡니다."
LangString MimAskReinstall 1033 "An earlier MyICOMaker is installed.$\n$R9$\n$\nRemove the earlier program completely and install again?$\n$\nYes: remove the earlier program and its shortcuts, then install. The next question decides about the user data.$\nNo: stop the installation."
LangString MimShortcutsTitle 1042 "바로가기"
LangString MimShortcutsTitle 1033 "Shortcuts"
LangString MimShortcutsSubtitle 1042 "MyICOMaker 바로가기를 만들 곳을 고르십시오."
LangString MimShortcutsSubtitle 1033 "Choose where to create MyICOMaker shortcuts."
LangString MimShortcutsText 1042 "선택한 곳에 MyICOMaker 를 실행하는 바로가기를 만듭니다. 시작 메뉴를 고르면 다음 페이지에서 폴더를 정합니다."
LangString MimShortcutsText 1033 "Shortcuts that start MyICOMaker are created where you choose. With the Start menu, the next page picks its folder."
LangString MimShortcutDesktop 1042 "바탕 화면에 바로가기 만들기"
LangString MimShortcutDesktop 1033 "Create a shortcut on the desktop"
LangString MimShortcutStartMenu 1042 "시작 메뉴에 바로가기 만들기 (사용 설명서 포함)"
LangString MimShortcutStartMenu 1033 "Create shortcuts in the Start menu (with the user's guide)"
LangString MimAskData 1042 "이전에 사용하던 사용자 데이터(설정, 최근 파일, 시작 화면 배치, 마지막 디자인, 창 위치)를 삭제할까요?$\n$\n예: 사용자 데이터를 모두 지우고 처음 설치한 상태로 시작합니다.$\n아니오: 사용자 데이터를 그대로 둡니다. 다음 실행 때 환경 설정만 기본값으로 돌아갑니다.$\n취소: 설치를 그만둡니다."
LangString MimAskData 1033 "Delete the user data from earlier use (settings, recent files, start screen arrangement, last design, window position)?$\n$\nYes: delete all user data and start as a fresh installation.$\nNo: keep the user data. Only the preferences go back to their defaults at the next start.$\nCancel: stop the installation."
LangString MimRunning 1042 "MyICOMaker 가 실행 중입니다 (창 $R9개). 설치하려면 모두 닫아야 합니다.$\n저장하지 않은 변경 내용은 사라집니다.$\n$\n확인: MyICOMaker 를 닫고 계속합니다.$\n취소: 설치를 그만둡니다."
LangString MimRunning 1033 "MyICOMaker is running ($R9 window(s)). All of them must be closed to install.$\nUnsaved changes are lost.$\n$\nOK: close MyICOMaker and continue.$\nCancel: stop the installation."

; 1 = delete the user data after installing. Deleting cannot be undone, so the default is 0.
Var MimWipe
; 1 = MimGuiInit has dealt with the previous installation.
Var MimDone
; Folders of a previous installation (current user / per machine), or "".
Var MimOldUser
Var MimOldMachine
; Shortcuts page: 1 = create (both checked at first).
Var MimDesktop
Var MimStartMenu
; The Start menu folder of the installation being removed (read before its uninstaller deletes the key).
Var MimSmFolder

!define MUI_CUSTOMFUNCTION_GUIINIT MimGuiInit

; Strips the quotes around a registry path ("C:\...\uninstall.exe").
Function MimUnquote
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
!macro MIM_FIND_IN root var
  StrCpy ${var} ""
  ReadRegStr $0 ${root} "${MIM_UNKEY}" "UninstallString"
  Push $0
  Call MimUnquote
  Pop $0
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    ${GetParent} "$0" ${var}
  ${Else}
    ReadRegStr $0 ${root} "${MIM_PRODKEY}" ""
    Push $0
    Call MimUnquote
    Pop $0
    ${If} $0 != ""
    ${AndIf} ${FileExists} "$0\uninstall.exe"
      StrCpy ${var} $0
    ${EndIf}
  ${EndIf}
!macroend

; Finds previous installations. A registration whose files are gone is removed, so that
; neither this installer nor Windows' app list shows a broken entry.
Function MimFindOld
  Push $0
  !insertmacro MIM_FIND_IN HKCU $MimOldUser
  !insertmacro MIM_FIND_IN HKLM $MimOldMachine
  ${If} $MimOldUser == ""
    ReadRegStr $0 HKCU "${MIM_UNKEY}" "UninstallString"
    ${If} $0 != ""
      DeleteRegKey HKCU "${MIM_UNKEY}"
    ${EndIf}
  ${EndIf}
  Pop $0
FunctionEnd

; 1 when the folder holds anything, else 0.
Function MimDirHasEntries
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
Function MimHasData
  Push $0
  Push $1
  Push "${MIM_ROAMING}"
  Call MimDirHasEntries
  Pop $0
  Push "${MIM_LOCAL}"
  Call MimDirHasEntries
  Pop $1
  IntOp $0 $0 | $1
  Exch $0
  Exch
  Pop $1
FunctionEnd

; Registers the MyICOMaker.exe of a folder with the Restart Manager session in $R8 (if there).
Function MimRegister
  Exch $0
  Push $1
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MIM_EXE}"
    System::Call 'RSTRTMGR::RmRegisterResources(i R8, i 1, *ws, i 0, p 0, i 0, p 0) i .r1' "$0\${MIM_EXE}"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Running MyICOMaker processes of the old installations and of $INSTDIR: the count
; (pushed), and with "close" pushed first, they are all closed. Several copies may run.
Function MimRunningApps
  Exch $R7
  Push $R8
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $1 0
  !insertmacro RestartManager_StartSession $R8
  ${If} $R8 != ""
    Push $MimOldUser
    Call MimRegister
    Push $MimOldMachine
    Call MimRegister
    ${If} $INSTDIR != $MimOldUser
    ${AndIf} $INSTDIR != $MimOldMachine
      Push $INSTDIR
      Call MimRegister
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
; The folder as a whole only when it is ours (named MyICOMaker).
Function MimSweep
  Exch $0
  Push $1
  ${GetFileName} "$0" $1
  ${If} $1 == "${MIM_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\uninstall.exe"
    Delete "$0\${MIM_EXE}"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Deletes the shortcuts of the old installation: run with /UPDATE, its uninstaller keeps them,
; and this installation makes the ones the user chooses. An update by Tauri's updater
; (this installer with /UPDATE) keeps them, as it makes none.
Function MimRemoveOldShortcuts
  Push $0
  Push $1
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/UPDATE" $1
  ${If} ${Errors}
    ReadRegStr $MimSmFolder HKCU "${MIM_PRODKEY}" "StartMenuFolder"
    ${If} $MimSmFolder == ""
      StrCpy $MimSmFolder "${MIM_NAME}"
    ${EndIf}
    Delete "${MIM_SMPROGRAMS}\$MimSmFolder\${MIM_NAME}.lnk"
    Delete "${MIM_SMPROGRAMS}\$MimSmFolder\${MIM_NAME} User's Guide.lnk"
    RMDir "${MIM_SMPROGRAMS}\$MimSmFolder"
    Delete "${MIM_SMPROGRAMS}\${MIM_NAME}.lnk"
    Delete "${MIM_DESKTOP}\${MIM_NAME}.lnk"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; Removes every previous installation silently. /UPDATE keeps the user data (that is decided
; here, by MimWipe); _?= runs the uninstaller in place and waits for it.
Function MimRemoveOld
  StrCpy $MimDone 1
  ${If} "$MimOldUser$MimOldMachine" != ""
    Call MimRemoveOldShortcuts
  ${EndIf}
  ${If} $MimOldUser != ""
    DetailPrint "Removing the previous installation: $MimOldUser"
    ExecWait '"$MimOldUser\uninstall.exe" /S /UPDATE _?=$MimOldUser'
    Push $MimOldUser
    Call MimSweep
    DeleteRegKey HKCU "${MIM_UNKEY}"
  ${EndIf}
  ${If} $MimOldMachine != ""
    ; A per-machine copy needs administrator rights: one elevated command removes it and its folder.
    DetailPrint "Removing the previous installation: $MimOldMachine"
    ${GetFileName} "$MimOldMachine" $0
    ${If} $0 == "${MIM_NAME}"
      ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c start "" /wait "$MimOldMachine\uninstall.exe" /S /UPDATE _?=$MimOldMachine & rmdir /s /q "$MimOldMachine"' SW_HIDE
    ${Else}
      ExecShellWait "runas" "$MimOldMachine\uninstall.exe" '/S /UPDATE _?=$MimOldMachine' SW_HIDE
    ${EndIf}
  ${EndIf}
FunctionEnd

; Before the first page (not with /S). No / Cancel at any question quits with nothing changed.
Function MimGuiInit
  StrCpy $MimWipe 0
  StrCpy $MimDesktop 1
  StrCpy $MimStartMenu 1
  Call MimFindOld
  ; Passive installs (/P) do not ask: the data is kept.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/P" $1
  ${IfNot} ${Errors}
    Call MimRemoveOld
    Return
  ${EndIf}

  ; 1. Remove the earlier program and install again? ($R9: where it is.)
  ${If} "$MimOldUser$MimOldMachine" != ""
    StrCpy $R9 "$MimOldUser"
    ${If} $MimOldMachine != ""
      ${If} $R9 != ""
        StrCpy $R9 "$R9$\n"
      ${EndIf}
      StrCpy $R9 "$R9$MimOldMachine"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$(MimAskReinstall)" /SD ${MIM_SD_REINSTALL} IDYES +2
    Quit
  ${EndIf}

  ; 2. Delete the user data?
  Call MimHasData
  Pop $2
  ${If} "$MimOldUser$MimOldMachine" != ""
  ${OrIf} $2 == 1
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON2 "$(MimAskData)" /SD ${MIM_SD_ASK} IDYES mimYes IDNO mimNo
    Quit
    mimYes:
      StrCpy $MimWipe 1
    mimNo:
  ${EndIf}

  ; Every running window must be closed before files are replaced or data deleted.
  Push "count"
  Call MimRunningApps
  Pop $R9
  ${If} $R9 > 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(MimRunning)" /SD ${MIM_SD_RUNNING} IDOK +2
    Quit
    Push "close"
    Call MimRunningApps
    Pop $R9
  ${EndIf}

  Call MimRemoveOld
FunctionEnd

; Leaves the installer's language for the next start of the program (window_state.rs). After
; MimWipeData: that deletes the folder.
Function MimWriteLanguage
  Push $0
  CreateDirectory "${MIM_ROAMING}"
  FileOpen $0 "${MIM_ROAMING}\install-language" w
  ${If} $LANGUAGE == 1042
    FileWrite $0 "ko"
  ${Else}
    FileWrite $0 "en"
  ${EndIf}
  FileClose $0
  Pop $0
FunctionEnd

; Deletes the user data (after the old copy is gone and no MyICOMaker runs).
Function MimWipeData
  RMDir /r "${MIM_ROAMING}"
  RMDir /r "${MIM_LOCAL}"
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
  Var MimDesktopBox
  Var MimStartMenuBox
  Page custom MimShortcutsShow MimShortcutsLeave

  Function MimShortcutsShow
    ${If} $PassiveMode = 1
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(MimShortcutsTitle)" "$(MimShortcutsSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}
    ${NSD_CreateLabel} 0 0 100% 24u "$(MimShortcutsText)"
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "$(MimShortcutDesktop)"
    Pop $MimDesktopBox
    ${If} $MimDesktop == 1
      ${NSD_Check} $MimDesktopBox
    ${EndIf}
    ${NSD_CreateCheckbox} 0 52u 100% 12u "$(MimShortcutStartMenu)"
    Pop $MimStartMenuBox
    ${If} $MimStartMenu == 1
      ${NSD_Check} $MimStartMenuBox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function MimShortcutsLeave
    ${NSD_GetState} $MimDesktopBox $MimDesktop
    ${NSD_GetState} $MimStartMenuBox $MimStartMenu
    StrCpy $0 ${VAR} 1
    ${If} $MimStartMenu == ${BST_CHECKED}
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

  Function MimStartMenuPre
    Call SkipIfPassive
    ${If} $MimStartMenu != ${BST_CHECKED}
      Abort
    ${EndIf}
  FunctionEnd

  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_PRE MimStartMenuPre
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
  ; 1. Silent installs: MimGuiInit did not run. No question; the data is kept.
  ${If} $MimDone != 1
    Call MimFindOld
    Call MimRemoveOld
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MimWipe == 1
    ; 2. Yes: a fresh start, no marker needed.
    Call MimWipeData
  ${Else}
    ; 3. Preferences: reset at the next start. Written after the old uninstaller ran.
    CreateDirectory "$APPDATA\${BUNDLEID}"
    Delete "$APPDATA\${BUNDLEID}\window-state.json"
    System::Call 'kernel32::GetTickCount() i .r9'
    FileOpen $R9 "$APPDATA\${BUNDLEID}\install-reset" w
    FileWrite $R9 "$9"
    FileClose $R9
  ${EndIf}
  ; The program starts in the language chosen for this installation (nothing was chosen in silent and passive installs).
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
    Call MimWriteLanguage
  ${EndIf}
  ; Desktop shortcut chosen on the shortcuts page (silent and passive installs: the template makes it).
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
  ${AndIf} $MimDesktop == ${BST_CHECKED}
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
  ReadRegStr $MimSmFolder SHCTX "${MANUPRODUCTKEY}" "StartMenuFolder"
  ${If} $MimSmFolder == ""
    StrCpy $MimSmFolder "${PRODUCTNAME}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An update (/UPDATE) keeps the shortcuts, like the template does.
  ${If} $UpdateMode <> 1
    Delete "$SMPROGRAMS\$MimSmFolder\${PRODUCTNAME} User's Guide.lnk"
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$MimSmFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      Delete "$SMPROGRAMS\$MimSmFolder\${PRODUCTNAME}.lnk"
    ${EndIf}
    RMDir "$SMPROGRAMS\$MimSmFolder"
  ${EndIf}
!macroend
