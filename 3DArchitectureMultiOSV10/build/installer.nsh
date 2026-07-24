; Custom NSIS script for 3D Architecture Viewer
; - Shortcut selection page (Desktop / Start Menu)
; - Complete cleanup of previous install leftovers
;
; NOTE: This file is included in the script header (before MUI2),
; so MUI_* macros must not be used here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut

!macro customInit
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

  ${NSD_CreateLabel} 0 0u 100% 24u "설치가 완료된 후 사용할 바로가기를 선택하세요."
  Pop $0

  ${NSD_CreateCheckbox} 0 40u 100% 12u "바탕화면에 바로가기 만들기"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  ${NSD_CreateCheckbox} 0 60u 100% 12u "시작 메뉴에 바로가기 만들기"
  Pop $StartMenuShortcutCheckbox
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

!macro customInstall
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
!endif

!macro customUnInstall
  SetShellVarContext current
  RMDir /r "$APPDATA\${APP_FILENAME}"
  RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
  !ifdef APP_PACKAGE_NAME
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
  !endif
  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
  !endif

  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
