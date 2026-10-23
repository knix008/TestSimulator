; MyMemoPad installer additions (read by Tauri's NSIS template).
; Port of the Electron build's build/installer.nsh.
;
;  • Language: Tauri's own selector (bundle.windows.nsis.displayLanguageSelector) asks
;    Korean / English first; every page below follows that choice.
;  • If MyMemoPad (Electron or Tauri build) is installed, or memos are left on disk, a page asks
;    whether to keep the memos and upgrade, or remove everything and install fresh.
;  • A page picks the Desktop / Start Menu shortcuts and "start with the system".
;  • The Electron build is removed before installing. Its own uninstaller is NOT run: it deletes
;    %APPDATA%\MyMemoPad (the memos) unconditionally, even with --updated.
;  • Uninstall with "delete app data" also deletes the memo folders.
;
; Tauri reads this file before its own pages, so the two pages below come first.
; PRODUCTNAME and friends are defined after this file, so names are written out here.
; Functions here must not use the template's variables ($UpdateMode, ...) — they are declared
; later; the hook macros at the bottom may, because they expand inside Sections.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!include nsDialogs.nsh

!define MM_IDENTIFIER "com.shkwon.mymemopad"
!define MM_EXE "MyMemoPad.exe"
; Memo folders: the packaged Electron build's userData (also this build's), and the name its
; unpackaged runs used.
!define MM_DATA_DIR "MyMemoPad"
!define MM_LEGACY_DATA_DIR "my-memopad-multios"
!define MM_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyMemoPad"
; electron-builder's per-user keys for appId com.shkwon.mymemopad
; (GUID = UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)).
!define MM_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ba4d8516-b8e3-526a-aaf0-0be1ab91660c"
!define MM_ELECTRON_INSTALL_KEY "Software\ba4d8516-b8e3-526a-aaf0-0be1ab91660c"
!define MM_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"

Var MM_HasPrev
Var MM_PrevDir
Var MM_CleanReinstall
Var MM_KeepRadio
Var MM_CleanRadio
Var MM_OptionsChosen
Var MM_DesktopState
Var MM_StartMenuState
Var MM_AutostartState
Var MM_DesktopBox
Var MM_StartMenuBox
Var MM_AutostartBox

Page custom MM_PageReinstall MM_LeaveReinstall
Page custom MM_PageOptions MM_LeaveOptions

; No pages for update (/UPDATE) or passive (/P) installs.
Function MM_AbortIfUnattended
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

; "C:\dir\x.exe" /args → C:\dir\x.exe   (in: $R0, out: $R0)
Function MM_FirstQuoted
  StrCpy $R1 $R0 1
  ${If} $R1 == '"'
    StrCpy $R0 $R0 "" 1
    StrCpy $R2 0
    mm_find_quote:
      StrCpy $R1 $R0 1 $R2
      StrCmp $R1 '"' mm_quote_found
      StrCmp $R1 "" mm_quote_found
      IntOp $R2 $R2 + 1
      Goto mm_find_quote
    mm_quote_found:
    StrCpy $R0 $R0 $R2
  ${EndIf}
FunctionEnd

; Previous install: a registered Tauri or Electron install, or memos left on disk.
Function MM_DetectPrevious
  StrCpy $MM_HasPrev 0
  StrCpy $MM_PrevDir ""
  ReadRegStr $R0 HKCU "${MM_UNINSTKEY}" "InstallLocation"
  ${If} $R0 != ""
    ; Tauri writes it in quotes.
    StrCpy $R1 $R0 1
    ${If} $R1 == '"'
      StrCpy $R0 $R0 -1 1
    ${EndIf}
    StrCpy $MM_PrevDir $R0
    StrCpy $MM_HasPrev 1
  ${EndIf}
  ReadRegStr $R0 HKCU "${MM_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    StrCpy $MM_HasPrev 1
    ${If} $MM_PrevDir == ""
      Call MM_FirstQuoted
      ${GetParent} $R0 $MM_PrevDir
    ${EndIf}
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\${MM_DATA_DIR}\memos.json"
  ${OrIf} ${FileExists} "$APPDATA\${MM_LEGACY_DATA_DIR}\memos.json"
    StrCpy $MM_HasPrev 1
  ${EndIf}
FunctionEnd

; A custom page keeps the previous page's header — write into the header controls (1037/1038).
!macro MM_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

; ── Existing installation ───────────────────────────────────────
Function MM_PageReinstall
  StrCpy $MM_CleanReinstall 0
  Call MM_DetectPrevious
  Call MM_AbortIfUnattended
  ${If} $MM_HasPrev != 1
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $MM_PrevDir != ""
    StrCpy $3 "$MM_PrevDir"
  ${Else}
    StrCpy $3 "-"
  ${EndIf}

  ; 1042 = Korean
  ${If} $LANGUAGE == 1042
    !insertmacro MM_SetHeader "재설치 방식 선택" "이미 설치된 MyMemoPad 를 어떻게 할지 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 24u "이 컴퓨터에 MyMemoPad 가 이미 설치되어 있거나 메모가 남아 있습니다.$\r$\n설치 위치: $3"
    Pop $0
    ${NSD_CreateRadioButton} 0 34u 100% 12u "메모와 설정을 유지하고 새 버전으로 덮어쓰기 (권장)"
    Pop $MM_KeepRadio
    ${NSD_CreateRadioButton} 0 52u 100% 12u "완전히 삭제한 뒤 새로 설치"
    Pop $MM_CleanRadio
    ${NSD_CreateLabel} 0 76u 100% 48u "덮어쓰기: 프로그램 파일만 새 버전으로 바뀌고, 저장한 메모와 글꼴·색·언어 설정은 그대로 남습니다.$\r$\n완전히 삭제: 프로그램 파일과 함께 저장한 메모, 설정, 바로가기, 자동 실행 등록까지 모두 지운 뒤 처음 상태로 설치합니다. 되돌릴 수 없습니다."
    Pop $0
  ${Else}
    !insertmacro MM_SetHeader "Existing Installation" "Choose what to do with the MyMemoPad already on this computer."
    ${NSD_CreateLabel} 0 0u 100% 24u "MyMemoPad is already installed on this computer, or memos are left from it.$\r$\nLocation: $3"
    Pop $0
    ${NSD_CreateRadioButton} 0 34u 100% 12u "Keep my memos and settings and upgrade in place (recommended)"
    Pop $MM_KeepRadio
    ${NSD_CreateRadioButton} 0 52u 100% 12u "Remove everything and install fresh"
    Pop $MM_CleanRadio
    ${NSD_CreateLabel} 0 76u 100% 48u "Upgrade: only the program files are replaced; saved memos and font, colour and language settings are kept.$\r$\nRemove everything: deletes the program together with saved memos, settings, shortcuts and the start-up entry, then installs from scratch. This cannot be undone."
    Pop $0
  ${EndIf}

  ${NSD_AddStyle} $MM_KeepRadio ${WS_GROUP}
  ${NSD_Check} $MM_KeepRadio
  nsDialogs::Show
FunctionEnd

Function MM_LeaveReinstall
  ${NSD_GetState} $MM_CleanRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $MM_CleanReinstall 1
  ${Else}
    StrCpy $MM_CleanReinstall 0
  ${EndIf}
FunctionEnd

; ── Shortcuts and start-up ──────────────────────────────────────
Function MM_PageOptions
  Call MM_AbortIfUnattended
  ${If} $MM_OptionsChosen != 1
    StrCpy $MM_DesktopState ${BST_CHECKED}
    StrCpy $MM_StartMenuState ${BST_CHECKED}
    StrCpy $MM_AutostartState ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    !insertmacro MM_SetHeader "설치 옵션" "바로가기와 자동 실행을 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 14u "설치 후 적용할 항목을 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 22u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $MM_DesktopBox
    ${NSD_CreateCheckbox} 0 38u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $MM_StartMenuBox
    ${NSD_CreateCheckbox} 0 54u 100% 12u "시스템 시작 시 자동 실행 (트레이에 아이콘만 표시)"
    Pop $MM_AutostartBox
    ${NSD_CreateLabel} 0 80u 100% 44u "MyMemoPad 는 바탕화면에 붙여 두는 노란 메모장입니다. 창의 X 를 눌러도 시스템 트레이에 남아 있고, 종료는 트레이 아이콘의 메뉴에서 합니다.$\r$\n자동 실행은 나중에 설정 창이나 트레이 메뉴에서 바꿀 수 있습니다."
    Pop $0
  ${Else}
    !insertmacro MM_SetHeader "Install Options" "Choose shortcuts and start-up."
    ${NSD_CreateLabel} 0 0u 100% 14u "Choose what to set up after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 22u 100% 12u "Create a Desktop shortcut"
    Pop $MM_DesktopBox
    ${NSD_CreateCheckbox} 0 38u 100% 12u "Create a Start Menu shortcut"
    Pop $MM_StartMenuBox
    ${NSD_CreateCheckbox} 0 54u 100% 12u "Start automatically with the system (tray icon only)"
    Pop $MM_AutostartBox
    ${NSD_CreateLabel} 0 80u 100% 44u "MyMemoPad is a sticky memo pad for your desktop. Closing a pad keeps it running in the system tray; exit from the tray icon's menu.$\r$\nYou can change start-up later in Settings or the tray menu."
    Pop $0
  ${EndIf}

  ${NSD_SetState} $MM_DesktopBox $MM_DesktopState
  ${NSD_SetState} $MM_StartMenuBox $MM_StartMenuState
  ${NSD_SetState} $MM_AutostartBox $MM_AutostartState
  nsDialogs::Show
FunctionEnd

Function MM_LeaveOptions
  ${NSD_GetState} $MM_DesktopBox $MM_DesktopState
  ${NSD_GetState} $MM_StartMenuBox $MM_StartMenuState
  ${NSD_GetState} $MM_AutostartBox $MM_AutostartState
  StrCpy $MM_OptionsChosen 1
FunctionEnd

; Login entries the Electron build (or its installer) wrote. "MyMemoPad" is this build's own
; (tauri-plugin-autostart uses the product name) and is handled by the caller.
!macro MM_RemoveLegacyRunValues
  DeleteRegValue HKCU "${MM_RUN_KEY}" "com.shkwon.mymemopad"
  DeleteRegValue HKCU "${MM_RUN_KEY}" "my-memopad-multios"
  DeleteRegValue HKCU "${MM_RUN_KEY}" "electron.app.MyMemoPad"
  DeleteRegValue HKCU "${MM_RUN_KEY}" "electron.app.my-memopad-multios"
!macroend

; Chromium's cache folders inside an Electron userData folder; the memo *.json files stay.
!macro MM_RemoveChromiumCache dir
  RMDir /r "${dir}\Cache"
  RMDir /r "${dir}\Code Cache"
  RMDir /r "${dir}\GPUCache"
  RMDir /r "${dir}\DawnGraphiteCache"
  RMDir /r "${dir}\DawnWebGPUCache"
  RMDir /r "${dir}\Local Storage"
  RMDir /r "${dir}\Session Storage"
  RMDir /r "${dir}\Shared Dictionary"
  RMDir /r "${dir}\blob_storage"
  RMDir /r "${dir}\Network"
  RMDir /r "${dir}\Crashpad"
  Delete "${dir}\Local State"
  Delete "${dir}\Preferences"
  Delete "${dir}\SharedStorage"
  Delete "${dir}\lockfile"
!macroend

; ── Remove the Electron build ───────────────────────────────────
; Files, registry and shortcuts only — the memos (*.json) stay.
Function MM_RemoveElectron
  ReadRegStr $R0 HKCU "${MM_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    Call MM_FirstQuoted
    ${GetParent} $R0 $R6
    DetailPrint "Removing the Electron build of MyMemoPad: $R6"
    ; Never the folder being installed into right now.
    ${If} $R6 != ""
    ${AndIf} $R6 != $INSTDIR
      RMDir /r "$R6"
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "${MM_ELECTRON_KEY}"
  DeleteRegKey HKCU "${MM_ELECTRON_INSTALL_KEY}"
  ${If} "$LOCALAPPDATA\Programs\MyMemoPad" != $INSTDIR
    RMDir /r "$LOCALAPPDATA\Programs\MyMemoPad"
  ${EndIf}
  RMDir /r "$LOCALAPPDATA\my-memopad-multios-updater"
  !insertmacro MM_RemoveLegacyRunValues

  ; Chromium caches the Electron build kept next to the memos — nothing reads them now.
  !insertmacro MM_RemoveChromiumCache "$APPDATA\${MM_DATA_DIR}"
  !insertmacro MM_RemoveChromiumCache "$APPDATA\${MM_LEGACY_DATA_DIR}"
FunctionEnd

!macro MM_RemoveShortcuts
  Delete "$DESKTOP\MyMemoPad.lnk"
  Delete "$SMPROGRAMS\MyMemoPad.lnk"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; An update install (/UPDATE) only replaces the program files.
  ${If} $UpdateMode <> 1
    Call MM_RemoveElectron

    ; ── Remove everything, then install fresh ──
    ; Not the $INSTDIR just chosen (Tauri writes into it next).
    ${If} $MM_CleanReinstall = 1
      ${If} $MM_PrevDir != ""
      ${AndIf} $MM_PrevDir != $INSTDIR
        RMDir /r "$MM_PrevDir"
      ${EndIf}
      RMDir /r "$APPDATA\${MM_DATA_DIR}"
      RMDir /r "$APPDATA\${MM_LEGACY_DATA_DIR}"
      RMDir /r "$APPDATA\${MM_IDENTIFIER}"
      RMDir /r "$LOCALAPPDATA\${MM_IDENTIFIER}"
      !insertmacro MM_RemoveShortcuts
      DeleteRegValue HKCU "${MM_RUN_KEY}" "MyMemoPad"
    ${EndIf}
  ${EndIf}

  ; Shortcuts exactly as chosen on the options page — Tauri's own Start Menu shortcut is off.
  ${If} $MM_OptionsChosen = 1
    StrCpy $NoShortcutMode 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MM_OptionsChosen = 1
    !insertmacro MM_RemoveShortcuts
    ${If} $MM_StartMenuState == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\MyMemoPad.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\MyMemoPad.lnk"
    ${EndIf}
    ${If} $MM_DesktopState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\MyMemoPad.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$DESKTOP\MyMemoPad.lnk"
    ${EndIf}
    ; The same value tauri-plugin-autostart writes, so the app's own switch shows it as on.
    ${If} $MM_AutostartState == ${BST_CHECKED}
      WriteRegStr HKCU "${MM_RUN_KEY}" "MyMemoPad" '"$INSTDIR\${MAINBINARYNAME}.exe" --autostart'
    ${Else}
      DeleteRegValue HKCU "${MM_RUN_KEY}" "MyMemoPad"
    ${EndIf}
  ${EndIf}

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; Shortcuts made above — Tauri only removes its own.
    !insertmacro MM_RemoveShortcuts
    ; A login entry pointing at the removed program would only fail at every sign-in.
    DeleteRegValue HKCU "${MM_RUN_KEY}" "MyMemoPad"
    !insertmacro MM_RemoveLegacyRunValues
    ; "Delete app data" also deletes the memos (Tauri itself only knows %AppData%\${MM_IDENTIFIER}).
    ${If} $DeleteAppDataCheckboxState = 1
      SetShellVarContext current
      RMDir /r "$APPDATA\${MM_DATA_DIR}"
      RMDir /r "$APPDATA\${MM_LEGACY_DATA_DIR}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
