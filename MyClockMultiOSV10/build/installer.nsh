; MyClock 설치 스크립트 추가분
;
;  • 이미 설치된 MyClock 이 있으면, 설정을 유지하고 덮어쓸지 / 완전히 삭제하고
;    새로 설치할지 고르는 페이지 (이전 설치가 없으면 건너뛴다)
;  • 바탕화면 / 시작 메뉴 바로가기를 사용자가 고르는 페이지
;    (설치 관리자가 한국어로 뜨면 한국어, 아니면 영어)
;  • 고른 항목만 만들고, 제거할 때 함께 지운다
;  • 바로가기에 AppUserModelID 를 심어 작업 표시줄에서 실행 중인 창과
;    같은 항목으로 묶이게 한다 (main.js 의 app.setAppUserModelId 와 같은 값)
;
; MUI2 보다 먼저 포함되므로 MUI_* 매크로는 쓸 수 없다.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER

Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var PrevInstallDir
Var HasPrevInstall
Var ReinstallKeepRadio
Var ReinstallCleanRadio
Var DoCleanReinstall

!macro customInit
  ; 무인 설치(/S)에서는 페이지가 뜨지 않으므로 기본값을 여기서 정한다.
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"
  StrCpy $DoCleanReinstall "0"

  ; 이전 설치 감지 — 등록된 설치 위치가 있거나, 설정 데이터가 남아 있으면 "있음"
  StrCpy $HasPrevInstall "0"
  StrCpy $PrevInstallDir ""
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $0 != ""
    StrCpy $PrevInstallDir $0
    StrCpy $HasPrevInstall "1"
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\MyClockMultiOS\settings.json"
    StrCpy $HasPrevInstall "1"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom ReinstallPageCreate ReinstallPageLeave
  Page custom ShortcutsPageCreate ShortcutsPageLeave
!macroend

; 사용자 정의 페이지는 앞 페이지의 머리말을 그대로 물려받는다.
; MUI_HEADER_TEXT 는 여기서 쓸 수 없으므로 머리말 컨트롤(1037/1038)에 직접 써 넣는다.
!macro MC_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

; ── 재설치 방식 선택 ────────────────────────────────────────────
Function ReinstallPageCreate
  ; 이전 설치가 없으면 이 페이지는 건너뛴다.
  ${If} $HasPrevInstall != "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $PrevInstallDir != ""
    StrCpy $3 "$PrevInstallDir"
  ${Else}
    StrCpy $3 "-"
  ${EndIf}

  ; 1042 = 한국어
  ${If} $LANGUAGE == 1042
    !insertmacro MC_SetHeader "재설치 방식 선택" "이미 설치된 MyClock 을 어떻게 할지 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 24u "이 컴퓨터에 MyClock 이 이미 설치되어 있습니다.$\r$\n설치 위치: $3"
    Pop $0
    ${NSD_CreateRadioButton} 0 34u 100% 12u "기존 설정을 유지하고 새 버전으로 덮어쓰기 (권장)"
    Pop $ReinstallKeepRadio
    ${NSD_CreateRadioButton} 0 52u 100% 12u "완전히 삭제한 뒤 새로 설치"
    Pop $ReinstallCleanRadio
    ${NSD_CreateLabel} 0 76u 100% 48u "덮어쓰기: 프로그램 파일만 새 버전으로 바뀌고, 테마·알람·타이머·세계 시간·일정 등 설정과 데이터는 그대로 남습니다.$\r$\n완전히 삭제: 프로그램 파일과 함께 설정·데이터 폴더, 기존 바로가기까지 모두 지운 뒤 처음 상태로 설치합니다. 되돌릴 수 없습니다."
    Pop $0
  ${Else}
    !insertmacro MC_SetHeader "Existing Installation" "Choose what to do with the MyClock already installed."
    ${NSD_CreateLabel} 0 0u 100% 24u "MyClock is already installed on this computer.$\r$\nLocation: $3"
    Pop $0
    ${NSD_CreateRadioButton} 0 34u 100% 12u "Keep my settings and upgrade in place (recommended)"
    Pop $ReinstallKeepRadio
    ${NSD_CreateRadioButton} 0 52u 100% 12u "Remove everything and install fresh"
    Pop $ReinstallCleanRadio
    ${NSD_CreateLabel} 0 76u 100% 48u "Upgrade: only the program files are replaced; themes, alarms, timers, world clocks and calendar events are kept.$\r$\nRemove everything: deletes the program, its settings and data folder and existing shortcuts, then installs from scratch. This cannot be undone."
    Pop $0
  ${EndIf}

  ${NSD_AddStyle} $ReinstallKeepRadio ${WS_GROUP}
  ${NSD_Check} $ReinstallKeepRadio

  nsDialogs::Show
FunctionEnd

Function ReinstallPageLeave
  ${NSD_GetState} $ReinstallCleanRadio $0
  ${If} $0 == 1
    StrCpy $DoCleanReinstall "1"
  ${Else}
    StrCpy $DoCleanReinstall "0"
  ${EndIf}
FunctionEnd

; ── 바로가기 선택 ───────────────────────────────────────────────
Function ShortcutsPageCreate
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
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 78u 100% 48u "MyClock 은 바탕화면에 두는 탁상시계입니다. 디지털·아날로그 시계, 18가지 테마, 세계 시간, 알람·타이머·스톱워치, 캘린더를 지원합니다.$\r$\n바로가기는 나중에 직접 만들거나 지워도 됩니다. 프로그램을 제거하면 여기서 만든 바로가기도 함께 지워집니다."
    Pop $0
  ${Else}
    !insertmacro MC_SetHeader "Choose Shortcuts" "Select where to create MyClock shortcuts."
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 78u 100% 48u "MyClock is a desk clock for your desktop: digital and analog faces, 18 themes, world time, alarms, timers, a stopwatch and a calendar.$\r$\nYou can add or remove these shortcuts later yourself. Uninstalling removes the shortcuts created here."
    Pop $0
  ${EndIf}

  ${NSD_Check} $DesktopShortcutCheckbox
  ${NSD_Check} $StartMenuShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function ShortcutsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == 1
    StrCpy $DoCreateDesktopShortcut "1"
  ${Else}
    StrCpy $DoCreateDesktopShortcut "0"
  ${EndIf}

  ${NSD_GetState} $StartMenuShortcutCheckbox $0
  ${If} $0 == 1
    StrCpy $DoCreateStartMenuShortcut "1"
  ${Else}
    StrCpy $DoCreateStartMenuShortcut "0"
  ${EndIf}
FunctionEnd

!endif

!macro customInstall
  ; ── 완전 삭제 후 재설치 ──────────────────────────────────────
  ; 이전 버전의 프로그램 파일은 electron-builder 가 이미 옛 제거 프로그램을
  ; 돌려 지웠다(설정은 남긴다). 여기서는 사용자가 고른 경우에만 나머지를 지운다.
  ; 방금 파일을 복사한 $INSTDIR 은 절대 지우지 않는다.
  ${If} $DoCleanReinstall == "1"
    ${If} $PrevInstallDir != ""
    ${AndIf} $PrevInstallDir != $INSTDIR
      RMDir /r "$PrevInstallDir"
    ${EndIf}
    SetShellVarContext current
    RMDir /r "$APPDATA\MyClockMultiOS"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    SetShellVarContext all
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    SetShellVarContext current
  ${EndIf}

  ; 아이콘은 exe 안에 들어 있다 — 바로가기는 exe 의 0번 아이콘을 가리킨다.
  ${If} $DoCreateStartMenuShortcut == "1"
    CreateDirectory "$SMPROGRAMS"
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    StrCpy $launchLink "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${EndIf}

  ${If} $DoCreateDesktopShortcut == "1"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  SetShellVarContext all
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  SetShellVarContext current

  ; electron-builder 의 데이터 삭제는 productName 폴더만 안다.
  ; 이 앱은 userData 를 MyClockMultiOS 로 쓰므로 같은 조건에서 함께 지운다
  ; (업데이트 중 실행된 제거에서는 $isDeleteAppData 가 0 이라 남는다).
  ${If} $isDeleteAppData == "1"
    RMDir /r "$APPDATA\MyClockMultiOS"
  ${EndIf}

  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
