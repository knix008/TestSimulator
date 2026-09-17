; MyClock 설치 스크립트 추가분
;
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

!macro customInit
  ; 무인 설치(/S)에서는 페이지가 뜨지 않으므로 기본값을 여기서 정한다.
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"
!macroend

!macro customPageAfterChangeDir
  Page custom ShortcutsPageCreate ShortcutsPageLeave
!macroend

Function ShortcutsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; 사용자 정의 페이지는 앞 페이지의 머리말을 그대로 물려받는다.
  ; MUI_HEADER_TEXT 는 여기서 쓸 수 없으므로 머리말 컨트롤(1037/1038)에 직접 써 넣는다.
  ${If} $LANGUAGE == 1042
    StrCpy $1 "바로가기 선택"
    StrCpy $2 "MyClock 바로가기를 어디에 만들지 고르세요."
  ${Else}
    StrCpy $1 "Choose Shortcuts"
    StrCpy $2 "Select where to create MyClock shortcuts."
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$1"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$2"

  ; 1042 = 한국어
  ${If} $LANGUAGE == 1042
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 78u 100% 48u "MyClock 은 바탕화면에 두는 탁상시계입니다. 디지털·아날로그 시계, 18가지 테마, 세계 시간, 알람·타이머·스톱워치, 캘린더를 지원합니다.$\r$\n바로가기는 나중에 직접 만들거나 지워도 됩니다. 프로그램을 제거하면 여기서 만든 바로가기도 함께 지워집니다."
    Pop $0
  ${Else}
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

  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
