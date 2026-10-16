; MyClock 설치 스크립트 추가분 (Tauri NSIS 템플릿이 읽어 들인다).
; Electron 판 build/installer.nsh 의 이식.
;
;  • 이미 설치된 MyClock(Electron 판이든 Tauri 판이든)이 있거나 설정이 남아 있으면,
;    설정을 유지하고 덮어쓸지 / 완전히 삭제하고 새로 설치할지 고르는 페이지
;  • 바탕화면 / 시작 메뉴 바로가기를 사용자가 고르는 페이지
;    (설치 관리자가 한국어로 뜨면 한국어, 아니면 영어)
;  • Electron 판은 설치 전에 조용히 지운다 (설정은 남긴다). 그 판에서 켜 둔
;    "시작 시 자동 실행"은 새 실행 파일로 옮겨 건다.
;  • 제거할 때 "앱 데이터 삭제"를 고르면 설정 폴더(%AppData%\MyClockMultiOS)도 지운다.
;
; Tauri 는 이 파일을 자기 페이지보다 먼저 읽으므로 아래 두 페이지는 환영 페이지 앞에 온다.
; PRODUCTNAME 등은 이 파일을 읽은 뒤에 정해지므로 이름을 그대로 적는다
; (test/build.test.js 가 tauri.conf.json 과 맞춰 본다).
;
; 이 파일은 UTF-8 BOM 으로 둔다. BOM 이 없으면 NSIS 가 한글을 ANSI 로 읽는다.

!include nsDialogs.nsh

!define MC_IDENTIFIER "com.shkwon.myclock"
!define MC_DATA_DIR "MyClockMultiOS"
!define MC_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyClock"
; electron-builder 가 appId com.shkwon.myclock 로 만든 사용자별 제거 키 (MyClock 1.0.0, Electron).
; UninstallString 은 %LOCALAPPDATA%\Programs\MyClock\Uninstall MyClock.exe /currentuser
!define MC_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\7b9e1599-21f3-547a-90d4-61f367a859ba"
; Electron 판이 "시작 시 자동 실행"으로 쓰던 값 이름 (AppUserModelId)
!define MC_ELECTRON_RUN "com.shkwon.myclock"
!define MC_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"

Var MC_HasPrev
Var MC_PrevDir
Var MC_CleanReinstall
Var MC_KeepRadio
Var MC_CleanRadio
Var MC_ShortcutsChosen
Var MC_DesktopState
Var MC_StartMenuState
Var MC_DesktopBox
Var MC_StartMenuBox
Var MC_ElectronAutostart

Page custom MC_PageReinstall MC_LeaveReinstall
Page custom MC_PageShortcuts MC_LeaveShortcuts

; 업데이트(/UPDATE)·수동(/P) 설치에서는 페이지를 띄우지 않는다.
; (Tauri 의 모드 변수들은 이 파일보다 뒤에 선언되어 함수 안에서 쓸 수 없다.)
Function MC_AbortIfUnattended
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

; 이전 설치 감지 — 등록된 설치(Electron 판·Tauri 판)가 있거나, 설정 데이터가 남아 있으면 "있음"
Function MC_DetectPrevious
  StrCpy $MC_HasPrev 0
  StrCpy $MC_PrevDir ""
  ReadRegStr $R0 SHCTX "${MC_UNINSTKEY}" "InstallLocation"
  ${If} $R0 != ""
    ; Tauri 는 "경로" 처럼 따옴표를 붙여 적는다.
    StrCpy $R1 $R0 1
    ${If} $R1 == '"'
      StrCpy $R0 $R0 -1 1
    ${EndIf}
    StrCpy $MC_PrevDir $R0
    StrCpy $MC_HasPrev 1
  ${EndIf}
  ReadRegStr $R0 HKCU "${MC_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    StrCpy $MC_HasPrev 1
    ${If} $MC_PrevDir == ""
      StrCpy $MC_PrevDir "$LOCALAPPDATA\Programs\MyClock"
    ${EndIf}
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\${MC_DATA_DIR}\settings.json"
    StrCpy $MC_HasPrev 1
  ${EndIf}
FunctionEnd

; 사용자 정의 페이지는 앞 페이지의 머리말을 그대로 물려받는다 — 머리말 컨트롤(1037/1038)에 직접 써 넣는다.
!macro MC_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

; ── 재설치 방식 선택 ────────────────────────────────────────────
Function MC_PageReinstall
  StrCpy $MC_CleanReinstall 0
  Call MC_DetectPrevious
  Call MC_AbortIfUnattended
  ; 이전 설치가 없으면 이 페이지는 건너뛴다.
  ${If} $MC_HasPrev != 1
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $MC_PrevDir != ""
    StrCpy $3 "$MC_PrevDir"
  ${Else}
    StrCpy $3 "-"
  ${EndIf}

  ; 1042 = 한국어
  ${If} $LANGUAGE == 1042
    !insertmacro MC_SetHeader "재설치 방식 선택" "이미 설치된 MyClock 을 어떻게 할지 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 24u "이 컴퓨터에 MyClock 이 이미 설치되어 있습니다.$\r$\n설치 위치: $3"
    Pop $0
    ${NSD_CreateRadioButton} 0 34u 100% 12u "기존 설정을 유지하고 새 버전으로 덮어쓰기 (권장)"
    Pop $MC_KeepRadio
    ${NSD_CreateRadioButton} 0 52u 100% 12u "완전히 삭제한 뒤 새로 설치"
    Pop $MC_CleanRadio
    ${NSD_CreateLabel} 0 76u 100% 48u "덮어쓰기: 프로그램 파일만 새 버전으로 바뀌고, 테마·알람·타이머·세계 시간·일정 등 설정과 데이터는 그대로 남습니다.$\r$\n완전히 삭제: 프로그램 파일과 함께 설정·데이터 폴더, 기존 바로가기까지 모두 지운 뒤 처음 상태로 설치합니다. 되돌릴 수 없습니다."
    Pop $0
  ${Else}
    !insertmacro MC_SetHeader "Existing Installation" "Choose what to do with the MyClock already installed."
    ${NSD_CreateLabel} 0 0u 100% 24u "MyClock is already installed on this computer.$\r$\nLocation: $3"
    Pop $0
    ${NSD_CreateRadioButton} 0 34u 100% 12u "Keep my settings and upgrade in place (recommended)"
    Pop $MC_KeepRadio
    ${NSD_CreateRadioButton} 0 52u 100% 12u "Remove everything and install fresh"
    Pop $MC_CleanRadio
    ${NSD_CreateLabel} 0 76u 100% 48u "Upgrade: only the program files are replaced; themes, alarms, timers, world clocks and calendar events are kept.$\r$\nRemove everything: deletes the program, its settings and data folder and existing shortcuts, then installs from scratch. This cannot be undone."
    Pop $0
  ${EndIf}

  ${NSD_AddStyle} $MC_KeepRadio ${WS_GROUP}
  ${NSD_Check} $MC_KeepRadio
  nsDialogs::Show
FunctionEnd

Function MC_LeaveReinstall
  ${NSD_GetState} $MC_CleanRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $MC_CleanReinstall 1
  ${Else}
    StrCpy $MC_CleanReinstall 0
  ${EndIf}
FunctionEnd

; ── 바로가기 선택 ───────────────────────────────────────────────
Function MC_PageShortcuts
  Call MC_AbortIfUnattended
  ${If} $MC_ShortcutsChosen != 1
    StrCpy $MC_DesktopState ${BST_CHECKED}
    StrCpy $MC_StartMenuState ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    !insertmacro MC_SetHeader "바로가기 선택" "MyClock 바로가기를 어디에 만들지 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $MC_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $MC_StartMenuBox
    ${NSD_CreateLabel} 0 78u 100% 48u "MyClock 은 바탕화면에 두는 탁상시계입니다. 디지털·아날로그 시계, 18가지 테마, 세계 시간, 알람·타이머·스톱워치, 캘린더를 지원합니다.$\r$\n바로가기는 나중에 직접 만들거나 지워도 됩니다. 프로그램을 제거하면 여기서 만든 바로가기도 함께 지워집니다."
    Pop $0
  ${Else}
    !insertmacro MC_SetHeader "Choose Shortcuts" "Select where to create MyClock shortcuts."
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $MC_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $MC_StartMenuBox
    ${NSD_CreateLabel} 0 78u 100% 48u "MyClock is a desk clock for your desktop: digital and analog faces, 18 themes, world time, alarms, timers, a stopwatch and a calendar.$\r$\nYou can add or remove these shortcuts later yourself. Uninstalling removes the shortcuts created here."
    Pop $0
  ${EndIf}

  ${NSD_SetState} $MC_DesktopBox $MC_DesktopState
  ${NSD_SetState} $MC_StartMenuBox $MC_StartMenuState
  nsDialogs::Show
FunctionEnd

Function MC_LeaveShortcuts
  ${NSD_GetState} $MC_DesktopBox $MC_DesktopState
  ${NSD_GetState} $MC_StartMenuBox $MC_StartMenuState
  StrCpy $MC_ShortcutsChosen 1
FunctionEnd

; ── Electron 판 지우기 ──────────────────────────────────────────
; 제거 프로그램을 제자리에서 조용히 돌리고 끝나기를 기다린다.
; --updated 를 주면 electron-builder 제거 프로그램이 사용자 데이터를 지우지 않는다.
Function MC_RemoveElectron
  ReadRegStr $R5 HKCU "${MC_ELECTRON_KEY}" "UninstallString"
  ${If} $R5 == ""
    Return
  ${EndIf}
  ; "C:\...\Uninstall MyClock.exe" /currentuser → 따옴표 안의 경로만
  StrCpy $R7 $R5 1
  ${If} $R7 == '"'
    StrCpy $R5 $R5 "" 1
    StrCpy $R8 0
    mc_find_quote:
      StrCpy $R7 $R5 1 $R8
      StrCmp $R7 '"' mc_quote_found
      StrCmp $R7 "" mc_quote_found
      IntOp $R8 $R8 + 1
      Goto mc_find_quote
    mc_quote_found:
    StrCpy $R5 $R5 $R8
  ${EndIf}
  ${GetParent} $R5 $R6
  DetailPrint "Removing the Electron build of MyClock: $R6"
  ${If} ${FileExists} "$R5"
    ExecWait '"$R5" /S /currentuser --updated _?=$R6' $R9
    Delete "$R5"
  ${EndIf}
  ; 지금 설치하는 폴더와 같으면 폴더째 지우지 않는다.
  ${If} $R6 != $INSTDIR
    RMDir /r "$R6"
  ${EndIf}
  DeleteRegKey HKCU "${MC_ELECTRON_KEY}"

  ; Electron 판의 "시작 시 자동 실행" — 켜져 있었으면 새 실행 파일로 다시 건다 (POSTINSTALL).
  ReadRegStr $R7 HKCU "${MC_RUN_KEY}" "${MC_ELECTRON_RUN}"
  ${If} $R7 != ""
    StrCpy $MC_ElectronAutostart 1
    DeleteRegValue HKCU "${MC_RUN_KEY}" "${MC_ELECTRON_RUN}"
  ${EndIf}

  ; Electron 판이 프로그램 폴더 옆에 두던 Chromium 캐시 — 이제 읽는 곳이 없다.
  ; settings.json 과 calendar_events.json 은 그대로 둔다.
  RMDir /r "$APPDATA\${MC_DATA_DIR}\Cache"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\Code Cache"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\GPUCache"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\DawnGraphiteCache"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\DawnWebGPUCache"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\Local Storage"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\Session Storage"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\Shared Dictionary"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\blob_storage"
  RMDir /r "$APPDATA\${MC_DATA_DIR}\Network"
  Delete "$APPDATA\${MC_DATA_DIR}\Local State"
  Delete "$APPDATA\${MC_DATA_DIR}\Preferences"
  Delete "$APPDATA\${MC_DATA_DIR}\SharedStorage"
  Delete "$APPDATA\${MC_DATA_DIR}\lockfile"
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; 업데이트 설치(/UPDATE)는 프로그램 파일만 바꾼다.
  ${If} $UpdateMode <> 1
    Call MC_RemoveElectron

    ; ── 완전 삭제 후 재설치 ──
    ; 방금 고른 $INSTDIR 은 지우지 않는다 (Tauri 가 곧 파일을 쓴다).
    ${If} $MC_CleanReinstall = 1
      ${If} $MC_PrevDir != ""
      ${AndIf} $MC_PrevDir != $INSTDIR
        RMDir /r "$MC_PrevDir"
      ${EndIf}
      RMDir /r "$APPDATA\${MC_DATA_DIR}"
      RMDir /r "$LOCALAPPDATA\${MC_IDENTIFIER}"
      Delete "$DESKTOP\MyClock.lnk"
      Delete "$SMPROGRAMS\MyClock.lnk"
      DeleteRegValue HKCU "${MC_RUN_KEY}" "MyClock"
      StrCpy $MC_ElectronAutostart 0
    ${EndIf}
  ${EndIf}

  ; 바로가기 페이지에서 고른 대로만 만든다 — Tauri 자체의 시작 메뉴 바로가기는 끈다.
  ${If} $MC_ShortcutsChosen = 1
    StrCpy $NoShortcutMode 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MC_ShortcutsChosen = 1
    ${If} $MC_StartMenuState == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\MyClock.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\MyClock.lnk"
    ${EndIf}
    ${If} $MC_DesktopState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\MyClock.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$DESKTOP\MyClock.lnk"
    ${EndIf}
  ${EndIf}

  ; Electron 판에서 켜 두었던 자동 실행을 새 실행 파일로 (tauri-plugin-autostart 와 같은 값 이름).
  ${If} $MC_ElectronAutostart = 1
    WriteRegStr HKCU "${MC_RUN_KEY}" "MyClock" '"$INSTDIR\${MAINBINARYNAME}.exe" --autostart'
  ${EndIf}

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; 여기서 만든 바로가기 — Tauri 는 자기가 만든 것만 지운다.
    Delete "$DESKTOP\MyClock.lnk"
    Delete "$SMPROGRAMS\MyClock.lnk"
    ; "앱 데이터 삭제"를 골랐으면 설정 폴더도 지운다 (Tauri 는 %AppData%\${MC_IDENTIFIER} 만 안다).
    ${If} $DeleteAppDataCheckboxState = 1
      SetShellVarContext current
      RMDir /r "$APPDATA\${MC_DATA_DIR}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
