!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var ShortcutOptionsDialog
Var ShortcutDesktopCheckbox
Var ShortcutStartMenuCheckbox
Var DesktopShortcutState
Var StartMenuShortcutState

LangString SHORTCUT_OPTIONS_TITLE 1033 "Shortcut Options"
LangString SHORTCUT_OPTIONS_TITLE 1042 "바로 가기 옵션"

LangString SHORTCUT_OPTIONS_DESC 1033 "Choose whether to create shortcuts for MyProject."
LangString SHORTCUT_OPTIONS_DESC 1042 "MyProject 바로 가기를 만들 위치를 선택하세요."

LangString SHORTCUT_DESKTOP 1033 "Create a desktop shortcut"
LangString SHORTCUT_DESKTOP 1042 "바탕화면에 바로 가기 만들기"

LangString SHORTCUT_STARTMENU 1033 "Create a Start menu shortcut"
LangString SHORTCUT_STARTMENU 1042 "시작 메뉴에 바로 가기 만들기"

!macro customInit
  StrCpy $DesktopShortcutState ${BST_CHECKED}
  StrCpy $StartMenuShortcutState ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  Page custom ShortcutOptionsPageCreate ShortcutOptionsPageLeave
!macroend

Function ShortcutOptionsPageCreate
  nsDialogs::Create 1018
  Pop $ShortcutOptionsDialog

  ${If} $ShortcutOptionsDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "$(SHORTCUT_OPTIONS_TITLE)"
  Pop $0

  ${NSD_CreateLabel} 0 16u 100% 24u "$(SHORTCUT_OPTIONS_DESC)"
  Pop $0

  ${NSD_CreateCheckbox} 0 44u 100% 12u "$(SHORTCUT_DESKTOP)"
  Pop $ShortcutDesktopCheckbox
  ${NSD_Check} $ShortcutDesktopCheckbox

  ${NSD_CreateCheckbox} 0 64u 100% 12u "$(SHORTCUT_STARTMENU)"
  Pop $ShortcutStartMenuCheckbox
  ${NSD_Check} $ShortcutStartMenuCheckbox

  nsDialogs::Show
FunctionEnd

Function ShortcutOptionsPageLeave
  ${NSD_GetState} $ShortcutDesktopCheckbox $DesktopShortcutState
  ${NSD_GetState} $ShortcutStartMenuCheckbox $StartMenuShortcutState
FunctionEnd

!macro removeDesktopShortcutIfExists
  ${if} ${FileExists} "$newDesktopLink"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
    ClearErrors
  ${endif}
!macroend

!macro removeStartMenuShortcutIfExists
  ${if} ${FileExists} "$newStartMenuLink"
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
    ClearErrors
  ${endif}
!macroend

!macro createDesktopShortcutWithAppIcon
  CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro createStartMenuShortcutWithAppIcon
  !insertmacro createMenuDirectory
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
!macroend

!macro customInstall
  ${if} $DesktopShortcutState == ${BST_CHECKED}
    !insertmacro createDesktopShortcutWithAppIcon
  ${else}
    !insertmacro removeDesktopShortcutIfExists
  ${endif}

  ${if} $StartMenuShortcutState == ${BST_CHECKED}
    !insertmacro createStartMenuShortcutWithAppIcon
  ${else}
    !insertmacro removeStartMenuShortcutIfExists
  ${endif}
!macroend

!endif
