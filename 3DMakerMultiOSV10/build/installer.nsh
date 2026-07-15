!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var /GLOBAL ShortcutDesktopCheckbox
Var /GLOBAL ShortcutStartMenuCheckbox
Var /GLOBAL ShortcutDesktopState
Var /GLOBAL ShortcutStartMenuState

!macro customInit
  StrCpy $ShortcutDesktopState ${BST_CHECKED}
  StrCpy $ShortcutStartMenuState ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  PageEx custom
    PageCallbacks shortcutOptionsPageCreate shortcutOptionsPageLeave
  PageExEnd
!macroend

Function shortcutOptionsPageCreate
  !insertmacro MUI_HEADER_TEXT "바로가기 옵션" "설치 후 생성할 링크를 선택하세요."

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 100% 16u "바로가기 생성 옵션"
  Pop $0

  ${NSD_CreateCheckbox} 0u 24u 100% 12u "바탕화면 바로가기 만들기"
  Pop $ShortcutDesktopCheckbox
  ${NSD_Check} $ShortcutDesktopCheckbox

  ${NSD_CreateCheckbox} 0u 44u 100% 12u "시작 메뉴 바로가기 만들기"
  Pop $ShortcutStartMenuCheckbox
  ${NSD_Check} $ShortcutStartMenuCheckbox

  nsDialogs::Show
FunctionEnd

Function shortcutOptionsPageLeave
  ${NSD_GetState} $ShortcutDesktopCheckbox $ShortcutDesktopState
  ${NSD_GetState} $ShortcutStartMenuCheckbox $ShortcutStartMenuState
FunctionEnd

!macro customInstall
  ${If} $ShortcutDesktopState != ${BST_CHECKED}
    Delete "$newDesktopLink"
  ${EndIf}

  ${If} $ShortcutStartMenuState != ${BST_CHECKED}
    Delete "$newStartMenuLink"
    !ifdef MENU_FILENAME
      RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    !endif
  ${EndIf}
!macroend
!endif
