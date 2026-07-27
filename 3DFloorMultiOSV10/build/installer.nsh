; Optional Desktop / Start Menu shortcut selection for assisted NSIS installs.
; electron-builder still creates shortcuts by default; unchecked ones are removed in customInstall
; so the stock uninstaller continues to clean up correctly.

!ifndef BUILD_UNINSTALLER
  Var FP3D_CreateDesktopShortcut
  Var FP3D_CreateStartMenuShortcut
  Var FP3D_ShortcutDialog
  Var FP3D_DesktopCheckbox
  Var FP3D_StartMenuCheckbox
  Var FP3D_ShortcutLabel

  !macro customInit
    ; Checked by default (same as electron-builder defaults)
    StrCpy $FP3D_CreateDesktopShortcut "1"
    StrCpy $FP3D_CreateStartMenuShortcut "1"
  !macroend

  !macro customPageAfterChangeDir
    Page custom fp3dShortcutPageCreate fp3dShortcutPageLeave

    Function fp3dShortcutPageCreate
      ${If} ${isUpdated}
        Abort
      ${EndIf}

      !insertmacro MUI_HEADER_TEXT "Shortcut options" "Choose Desktop and Start Menu shortcuts"

      nsDialogs::Create 1018
      Pop $FP3D_ShortcutDialog
      ${If} $FP3D_ShortcutDialog == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0u 100% 24u "Select which shortcuts to create:$\r$\n(바로가기를 만들 위치를 선택하세요)"
      Pop $FP3D_ShortcutLabel

      ${NSD_CreateCheckbox} 0 40u 100% 12u "Desktop shortcut / 바탕 화면 바로가기"
      Pop $FP3D_DesktopCheckbox
      ${NSD_SetState} $FP3D_DesktopCheckbox $FP3D_CreateDesktopShortcut

      ${NSD_CreateCheckbox} 0 58u 100% 12u "Start Menu shortcut / 시작 메뉴 바로가기"
      Pop $FP3D_StartMenuCheckbox
      ${NSD_SetState} $FP3D_StartMenuCheckbox $FP3D_CreateStartMenuShortcut

      nsDialogs::Show
    FunctionEnd

    Function fp3dShortcutPageLeave
      ${NSD_GetState} $FP3D_DesktopCheckbox $FP3D_CreateDesktopShortcut
      ${NSD_GetState} $FP3D_StartMenuCheckbox $FP3D_CreateStartMenuShortcut
    FunctionEnd
  !macroend

  !macro customInstall
    ${If} $FP3D_CreateDesktopShortcut == "0"
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
    ${EndIf}

    ${If} $FP3D_CreateStartMenuShortcut == "0"
      WinShell::UninstShortcut "$newStartMenuLink"
      Delete "$newStartMenuLink"
      !ifdef MENU_FILENAME
        RMDir "$SMPROGRAMS\${MENU_FILENAME}"
      !endif
    ${EndIf}
  !macroend
!endif
