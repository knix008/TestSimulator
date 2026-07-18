; Custom NSIS pages/macros for ISO Maker
; 1) Completely remove any previous installation before installing
; 2) Let the user choose Desktop / Start Menu shortcuts

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"

Var WantDesktop
Var WantStartMenu
Var DesktopCheckbox
Var StartMenuCheckbox

; ---------------------------------------------------------------------------
; Fully uninstall a previous copy from one registry hive.
; ROOT_KEY  = HKCU | HKLM
; USER_FLAG = /currentuser | /allusers
; ---------------------------------------------------------------------------
!macro WipePreviousInstall ROOT_KEY USER_FLAG
  Push $0
  Push $1
  Push $2
  Push $3

  SetRegView 64
  ReadRegStr $0 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}

  ReadRegStr $1 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $1 == ""
    !ifdef UNINSTALL_REGISTRY_KEY_2
      ReadRegStr $1 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
    !endif
  ${EndIf}

  ; Close a running instance so files can be removed.
  ExecWait 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T' $3
  Sleep 400

  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${UNINSTALL_FILENAME}"
    ; Full uninstall: delete app data, do not keep shortcuts, not an in-place update.
    ExecWait '"$0\${UNINSTALL_FILENAME}" /S ${USER_FLAG} --delete-app-data _?=$0' $3
  ${ElseIf} $1 != ""
    ReadRegStr $2 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    ${If} $2 != ""
      ExecWait '$2 --delete-app-data' $3
    ${Else}
      ExecWait '$1 /S --delete-app-data' $3
    ${EndIf}
  ${EndIf}

  ; Brute-force leftovers (old uninstaller missing or incomplete)
  ${If} $0 != ""
    RMDir /r "$0"
  ${EndIf}

  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  !ifdef SHORTCUT_NAME
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !endif

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

  DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"

  SetRegView 32
  DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
  SetRegView 64

  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro ensurePreviousInstallRemoved
  DetailPrint "Removing previous ISO Maker installation (if any)..."
  !insertmacro WipePreviousInstall HKCU "/currentuser"
  !insertmacro WipePreviousInstall HKLM "/allusers"
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customInit
  ; Defaults for silent installs (shortcut page is skipped)
  StrCpy $WantDesktop 1
  StrCpy $WantStartMenu 1
  !insertmacro ensurePreviousInstallRemoved
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

  ${NSD_CreateLabel} 0 0u 100% 36u "설치 후 바로 가기를 만들 위치를 선택하세요.$\r$\nChoose where to create shortcuts after installation:"
  Pop $0

  ${NSD_CreateCheckbox} 0 48u 100% 14u "바탕 화면에 바로 가기 만들기  /  Create a desktop shortcut"
  Pop $DesktopCheckbox
  ${If} $WantDesktop == 1
    ${NSD_Check} $DesktopCheckbox
  ${EndIf}

  ${NSD_CreateCheckbox} 0 70u 100% 14u "시작 메뉴에 바로 가기 만들기  /  Create a Start Menu shortcut"
  Pop $StartMenuCheckbox
  ${If} $WantStartMenu == 1
    ${NSD_Check} $StartMenuCheckbox
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function ShortcutsPageLeave
  ${NSD_GetState} $DesktopCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $WantDesktop 1
  ${Else}
    StrCpy $WantDesktop 0
  ${EndIf}

  ${NSD_GetState} $StartMenuCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $WantStartMenu 1
  ${Else}
    StrCpy $WantStartMenu 0
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $WantDesktop == 1
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
  ${If} $WantStartMenu == 1
    CreateDirectory "$SMPROGRAMS"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
!macroend

!endif

!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  !ifdef SHORTCUT_NAME
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !endif
!macroend
