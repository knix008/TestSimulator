; Force a clean reinstall: when an older copy is present, uninstall it with
; --delete-app-data (instead of --updated), then wipe leftover app data folders.
; Also offer Start Menu / Desktop shortcut checkboxes on assisted install.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!macroundef _isDeleteAppData
!undef isDeleteAppData
!macro _isDeleteAppData _a _b _t _f
  StrCmp "1" "1" `${_t}` `${_f}`
!macroend
!define isDeleteAppData `"" isDeleteAppData ""`

!ifndef BUILD_UNINSTALLER
  Var CreateDesktopShortcutChoice
  Var CreateStartMenuShortcutChoice
  Var DesktopShortcutCheckbox
  Var StartMenuShortcutCheckbox
!endif

!macro RemoveAppDataFolders
  ; Electron stores userData under %APPDATA%\<name>
  RMDir /r "$APPDATA\${APP_FILENAME}"
  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
  !endif
  !ifdef APP_PACKAGE_NAME
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  !endif
  RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
  !ifdef APP_PACKAGE_NAME
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
  !endif

  ; Leftovers from earlier product names
  RMDir /r "$APPDATA\My UML Multi OS"
  RMDir /r "$APPDATA\my-uml-multi-os"
  RMDir /r "$APPDATA\UML Editor"
  RMDir /r "$LOCALAPPDATA\My UML Multi OS"
  RMDir /r "$LOCALAPPDATA\my-uml-multi-os"
  RMDir /r "$LOCALAPPDATA\UML Editor"
!macroend

!macro customInit
  !ifndef BUILD_UNINSTALLER
    ; Default: create both shortcuts (used when page is skipped / silent install).
    StrCpy $CreateDesktopShortcutChoice ${BST_CHECKED}
    StrCpy $CreateStartMenuShortcutChoice ${BST_CHECKED}
  !endif

  ; Remove orphaned install folders from renamed product builds (same appId).
  RMDir /r "$LOCALAPPDATA\Programs\My UML Multi OS"
  RMDir /r "$PROGRAMFILES\My UML Multi OS"
  RMDir /r "$PROGRAMFILES64\My UML Multi OS"
!macroend

!ifndef BUILD_UNINSTALLER
  Function ShortcutOptionsPage
    ${If} ${Silent}
      Abort
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Choose which shortcuts to create:"
    Pop $0

    ${NSD_CreateCheckbox} 0 40u 100% 12u "Create a Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${If} $CreateStartMenuShortcutChoice == ${BST_CHECKED}
      ${NSD_Check} $StartMenuShortcutCheckbox
    ${EndIf}

    ${NSD_CreateCheckbox} 0 60u 100% 12u "Create a Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${If} $CreateDesktopShortcutChoice == ${BST_CHECKED}
      ${NSD_Check} $DesktopShortcutCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function ShortcutOptionsPageLeave
    ${NSD_GetState} $StartMenuShortcutCheckbox $CreateStartMenuShortcutChoice
    ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcutChoice
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom ShortcutOptionsPage ShortcutOptionsPageLeave
  !macroend
!endif

!macro customInstall
  !insertmacro RemoveAppDataFolders

  ${If} $CreateStartMenuShortcutChoice == ${BST_CHECKED}
    !insertmacro cleanupOldMenuDirectory
    !insertmacro createMenuDirectory
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${Else}
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
    ${If} "$oldStartMenuLink" != "$newStartMenuLink"
      WinShell::UninstShortcut "$oldStartMenuLink"
      Delete "$oldStartMenuLink"
    ${EndIf}
  ${EndIf}

  ${If} $CreateDesktopShortcutChoice == ${BST_CHECKED}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${Else}
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
    ${If} "$oldDesktopLink" != "$newDesktopLink"
      WinShell::UninstShortcut "$oldDesktopLink"
      Delete "$oldDesktopLink"
    ${EndIf}
  ${EndIf}

  ; Ensure .umlprj uses the project icon (ProgId must not contain spaces).
  ; Icon is shipped via extraResources (+ electron-builder APP_ASSOCIATE copy).
  CreateDirectory "$INSTDIR\resources"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.umlprj" "" "UMLEditor.Project"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.umlprj\OpenWithProgids" "UMLEditor.Project"
  WriteRegStr SHELL_CONTEXT "Software\Classes\UMLEditor.Project" "" "MyUML project file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\UMLEditor.Project\DefaultIcon" "" "$INSTDIR\resources\project-icon.ico,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\UMLEditor.Project\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\UMLEditor.Project\shell\open" "" "Open with UML Editor"
  WriteRegStr SHELL_CONTEXT "Software\Classes\UMLEditor.Project\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Remove legacy ProgId that used a space (invalid / unreliable on Windows).
  DeleteRegKey SHELL_CONTEXT "Software\Classes\MyUML Project"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.umlprj\OpenWithProgids" "MyUML Project"

  ; Refresh Explorer so .umlprj icons update immediately.
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0x1000, i 0, i 0)'
!macroend

!macro customUnInstall
  !insertmacro RemoveAppDataFolders
!macroend
