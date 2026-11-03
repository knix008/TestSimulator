; MyPaint installer additions, read by the Tauri NSIS template
; (src-tauri/tauri.conf.json: bundle.windows.nsis.installerHooks).
;
;  - The user picks the installer language (Korean or English) on the first screen, every time.
;  - A page chooses the Desktop and Start Menu shortcuts, both named "MyPaint 10.0".
;  - The Electron build of MyPaint (same app id) is removed completely first.
;  - Saved data (settings, recent files, window places) is deleted only when the user says
;    so: asked here at install time, and by the "Delete the application data" box when
;    uninstalling.
;  - .mypaint drawings (and the older .mpaint ones) open in MyPaint and show
;    document.ico; Tauri registers the type (bundle.fileAssociations), this sets its icon.
;
; Tauri includes this file before its own pages and before it declares its variables, so
; the Functions below use only their own variables; $UpdateMode, $NoShortcutMode and
; $DeleteAppDataCheckboxState are used inside the hook macros, which are expanded later.
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include nsDialogs.nsh
!include LogicLib.nsh

; ── Installer language (Korean / English) ─────────────────────
; MUI shows the selector only when no language was saved by an earlier install; always ask
; (the saved one is still preselected). ALLLANGUAGES keeps English on Korean Windows.
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "설치 언어 / Installer Language"
!define MUI_LANGDLL_INFO "설치에 사용할 언어를 선택하세요.$\r$\nChoose the installation language."

!define MP_NAME "MyPaint"
!define MP_SHORTCUT "MyPaint 10.0"
!define MP_IDENTIFIER "com.shkwon.mypaint"
!define MP_PROGID "MyPaint.Drawing"
; electron-builder's per-user uninstall key for appId com.shkwon.mypaint (UUIDv5 of the app
; id in electron-builder's namespace); it installed into %LOCALAPPDATA%\Programs\MyPaint and
; kept its data in %APPDATA%\MyPaint.
!define MP_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\1a05094b-04a6-5803-8deb-1f148b808562"

Var MP_ShortcutsChosen
Var MP_DesktopState
Var MP_StartMenuState
Var MP_DesktopBox
Var MP_StartMenuBox
Var MP_DeleteData

Page custom MP_PageShortcuts MP_LeaveShortcuts

; No pages for update (/UPDATE) or passive (/P) installs.
Function MP_AbortIfUnattended
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/P" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ClearErrors
FunctionEnd

; A custom page inherits the previous page's header; write into the header controls directly.
!macro MP_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

; ── Shortcuts ─────────────────────────────────────────────────
Function MP_PageShortcuts
  Call MP_AbortIfUnattended
  ${If} $MP_ShortcutsChosen != 1
    StrCpy $MP_DesktopState ${BST_CHECKED}
    StrCpy $MP_StartMenuState ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; 1042 = Korean
  ${If} $LANGUAGE == 1042
    !insertmacro MP_SetHeader "바로가기" "설치 후 만들 바로가기를 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기 (${MP_SHORTCUT})"
    Pop $MP_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기 (${MP_SHORTCUT})"
    Pop $MP_StartMenuBox
    ${NSD_CreateLabel} 0 76u 100% 30u ".mypaint 그림 파일은 MyPaint 로 열리도록 등록됩니다."
    Pop $0
  ${Else}
    !insertmacro MP_SetHeader "Shortcuts" "Choose the shortcuts to create."
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create a Desktop shortcut (${MP_SHORTCUT})"
    Pop $MP_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create a Start Menu shortcut (${MP_SHORTCUT})"
    Pop $MP_StartMenuBox
    ${NSD_CreateLabel} 0 76u 100% 30u ".mypaint drawings will be registered to open in MyPaint."
    Pop $0
  ${EndIf}

  ${NSD_SetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_SetState} $MP_StartMenuBox $MP_StartMenuState
  nsDialogs::Show
FunctionEnd

Function MP_LeaveShortcuts
  ${NSD_GetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_GetState} $MP_StartMenuBox $MP_StartMenuState
  StrCpy $MP_ShortcutsChosen 1
FunctionEnd

; ── The Electron build ────────────────────────────────────────
; Runs its uninstaller in place, silently, and waits for it. --updated stops the
; electron-builder uninstaller from deleting the user's data; whether that data stays is
; asked separately (MP_AskAboutData).
Function MP_RemoveElectron
  ReadRegStr $R5 HKCU "${MP_ELECTRON_KEY}" "UninstallString"
  ${If} $R5 == ""
    Return
  ${EndIf}
  ; "C:\...\Uninstall MyPaint.exe" /currentuser -> only the quoted path
  StrCpy $R7 $R5 1
  ${If} $R7 == '"'
    StrCpy $R5 $R5 "" 1
    StrCpy $R8 0
    mp_find_quote:
      StrCpy $R7 $R5 1 $R8
      StrCmp $R7 '"' mp_quote_found
      StrCmp $R7 "" mp_quote_found
      IntOp $R8 $R8 + 1
      Goto mp_find_quote
    mp_quote_found:
    StrCpy $R5 $R5 $R8
  ${EndIf}
  ${GetParent} $R5 $R6
  DetailPrint "Removing the Electron build of MyPaint: $R6"
  ${If} ${FileExists} "$R5"
    ExecWait '"$R5" /S /currentuser --updated _?=$R6' $R9
    Delete "$R5"
  ${EndIf}
  ; Never the folder being installed into right now.
  ${If} $R6 != $INSTDIR
  ${AndIf} ${FileExists} "$R6\resources\document.ico"
    RMDir /r "$R6"
  ${EndIf}
  DeleteRegKey HKCU "${MP_ELECTRON_KEY}"
  Delete "$DESKTOP\${MP_SHORTCUT}.lnk"
  Delete "$SMPROGRAMS\${MP_SHORTCUT}.lnk"
  RMDir "$SMPROGRAMS\${MP_NAME}"

  ; Chromium's caches in the Electron data folder: nothing reads them any more.
  RMDir /r "$APPDATA\${MP_NAME}\Cache"
  RMDir /r "$APPDATA\${MP_NAME}\Code Cache"
  RMDir /r "$APPDATA\${MP_NAME}\GPUCache"
  RMDir /r "$APPDATA\${MP_NAME}\DawnCache"
  RMDir /r "$APPDATA\${MP_NAME}\DawnGraphiteCache"
  RMDir /r "$APPDATA\${MP_NAME}\DawnWebGPUCache"
  RMDir /r "$APPDATA\${MP_NAME}\Crashpad"
FunctionEnd

; Settings, recent files and window places from an earlier installation: throwing them away
; is the user's decision, so ask, and only when there is something to delete. Silent
; installs keep the data. The deletion itself happens after the files are copied, when the
; running-program check has made sure MyPaint is closed.
Function MP_AskAboutData
  StrCpy $MP_DeleteData "0"
  SetShellVarContext current
  StrCpy $0 "0"
  ${If} ${FileExists} "$APPDATA\MyPaint\*.*"
  ${OrIf} ${FileExists} "$APPDATA\${MP_IDENTIFIER}\*.*"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\${MP_IDENTIFIER}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} $0 != "1"
    Return
  ${EndIf}
  ${If} $LANGUAGE == 1042
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "이미 설치된 프로그램은 완전히 삭제한 뒤 다시 설치합니다.$\r$\n$\r$\n저장된 데이터가 있습니다. 삭제하시겠습니까?$\r$\n(설정, 최근 파일 목록, 창 위치)" /SD IDNO IDYES mp_yes
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "The installed program is removed completely and installed again.$\r$\n$\r$\nSaved data was found. Do you want to delete it?$\r$\n(settings, recent files, window places)" /SD IDNO IDYES mp_yes
  ${EndIf}
  Return
  mp_yes:
    StrCpy $MP_DeleteData "1"
FunctionEnd

; Never $LOCALAPPDATA\MyPaint: that is where this installer puts the program itself.
!macro MP_WipeData
  SetShellVarContext current
  RMDir /r "$APPDATA\MyPaint"
  RMDir /r "$APPDATA\${MP_IDENTIFIER}"
  RMDir /r "$LOCALAPPDATA\${MP_IDENTIFIER}"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; An update (/UPDATE) only replaces the program files.
  ${If} $UpdateMode <> 1
    Call MP_RemoveElectron
    Call MP_AskAboutData
  ${EndIf}
  ; Only the shortcuts chosen on the page, named "MyPaint 10.0"; Tauri's own are off.
  ${If} $MP_ShortcutsChosen = 1
    StrCpy $NoShortcutMode 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MP_DeleteData == "1"
    !insertmacro MP_WipeData
  ${EndIf}

  ${If} $MP_ShortcutsChosen = 1
    ${If} $MP_StartMenuState == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\${MP_SHORTCUT}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${MP_SHORTCUT}.lnk"
    ${EndIf}
    ${If} $MP_DesktopState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${MP_SHORTCUT}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${MP_SHORTCUT}.lnk"
    ${EndIf}
  ${EndIf}

  ; ── .mypaint (and the older .mpaint) drawings, with their own icon ──
  WriteRegStr HKCU "Software\Classes\${MP_PROGID}" "" "MyPaint Drawing"
  WriteRegStr HKCU "Software\Classes\${MP_PROGID}" "FriendlyTypeName" "MyPaint Drawing"
  WriteRegStr HKCU "Software\Classes\${MP_PROGID}\DefaultIcon" "" "$INSTDIR\document.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.mypaint" "" "${MP_PROGID}"
  WriteRegStr HKCU "Software\Classes\.mypaint" "Content Type" "application/vnd.mypaint.drawing"
  WriteRegStr HKCU "Software\Classes\.mypaint\OpenWithProgids" "${MP_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\.mpaint" "" "${MP_PROGID}"
  WriteRegStr HKCU "Software\Classes\.mpaint\OpenWithProgids" "${MP_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".mypaint" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".mpaint" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    ; The shortcuts made here; Tauri removes only the ones it made itself.
    Delete "$DESKTOP\${MP_SHORTCUT}.lnk"
    Delete "$SMPROGRAMS\${MP_SHORTCUT}.lnk"

    DeleteRegValue HKCU "Software\Classes\.mypaint\OpenWithProgids" "${MP_PROGID}"
    DeleteRegValue HKCU "Software\Classes\.mpaint\OpenWithProgids" "${MP_PROGID}"
    ReadRegStr $0 HKCU "Software\Classes\.mypaint" ""
    ${If} $0 == "${MP_PROGID}"
      DeleteRegKey HKCU "Software\Classes\.mypaint"
    ${EndIf}
    ReadRegStr $0 HKCU "Software\Classes\.mpaint" ""
    ${If} $0 == "${MP_PROGID}"
      DeleteRegKey HKCU "Software\Classes\.mpaint"
    ${EndIf}
    DeleteRegKey HKCU "Software\Classes\${MP_PROGID}"
    DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"

    ; "Delete the application data" also takes what the Electron build left
    ; (Tauri itself only knows %APPDATA% and %LOCALAPPDATA%\${MP_IDENTIFIER}).
    ${If} $DeleteAppDataCheckboxState = 1
      !insertmacro MP_WipeData
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
