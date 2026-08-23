; ZipMaster NSIS 커스텀 스크립트
; 설치 중 "바탕화면 / 시작 메뉴 바로 가기"를 사용자가 선택할 수 있는 페이지를 추가한다.
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var ShortcutDialog
Var DesktopCheckbox
Var StartMenuCheckbox
Var CreateDesktopShortcut
Var CreateStartMenuShortcut

; 설치 경로 선택 페이지 다음에 바로 가기 선택 페이지 삽입
!macro customPageAfterChangeDir
  Page custom ShortcutPageCreate ShortcutPageLeave
!macroend

Function ShortcutPageCreate
  !insertmacro MUI_HEADER_TEXT "바로 가기 옵션" "생성할 바로 가기를 선택하세요."
  nsDialogs::Create 1018
  Pop $ShortcutDialog
  ${If} $ShortcutDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 0 15u 100% 12u "바탕화면에 바로 가기 만들기"
  Pop $DesktopCheckbox
  ${NSD_Check} $DesktopCheckbox

  ${NSD_CreateCheckbox} 0 35u 100% 12u "시작 메뉴에 바로 가기 만들기"
  Pop $StartMenuCheckbox
  ${NSD_Check} $StartMenuCheckbox

  nsDialogs::Show
FunctionEnd

Function ShortcutPageLeave
  ${NSD_GetState} $DesktopCheckbox $CreateDesktopShortcut
  ${NSD_GetState} $StartMenuCheckbox $CreateStartMenuShortcut
FunctionEnd

; 선택 결과에 따라 바로 가기 생성
!macro customInstall
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
  ${If} $CreateStartMenuShortcut == ${BST_CHECKED}
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
!macroend

; 제거 시 바로 가기 정리
!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
!macroend
