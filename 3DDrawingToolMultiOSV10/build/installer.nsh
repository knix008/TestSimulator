!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
Var ShortcutOptionsDialog
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var CreateDesktopShortcutChoice
Var CreateStartMenuShortcutChoice

!macro customPageAfterChangeDir
  Page custom ShortcutOptionsPageCreate ShortcutOptionsPageLeave
!macroend

Function ShortcutOptionsPageCreate
  nsDialogs::Create 1018
  Pop $ShortcutOptionsDialog

  ${If} $ShortcutOptionsDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose which shortcuts to create."
  Pop $0

  ${NSD_CreateCheckbox} 0 34u 100% 12u "Create a desktop shortcut"
  Pop $DesktopShortcutCheckbox
  ${NSD_SetState} $DesktopShortcutCheckbox ${BST_CHECKED}

  ${NSD_CreateCheckbox} 0 54u 100% 12u "Create a Start Menu shortcut"
  Pop $StartMenuShortcutCheckbox
  ${NSD_SetState} $StartMenuShortcutCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function ShortcutOptionsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcutChoice
  ${NSD_GetState} $StartMenuShortcutCheckbox $CreateStartMenuShortcutChoice
FunctionEnd

!macro customInstall
  ${If} $CreateDesktopShortcutChoice == ${BST_CHECKED}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${EndIf}

  ${If} $CreateStartMenuShortcutChoice == ${BST_CHECKED}
    !insertmacro createMenuDirectory
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

!macro customUnInstall
  WinShell::UninstShortcut "$oldDesktopLink"
  Delete "$oldDesktopLink"

  WinShell::UninstShortcut "$oldStartMenuLink"
  Delete "$oldStartMenuLink"
  ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
  ${IfNot} $R1 == ""
    RMDir "$SMPROGRAMS\$R1"
  ${EndIf}
!macroend
