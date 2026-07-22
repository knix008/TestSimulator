; Force a clean reinstall: when an older copy is present, uninstall it with
; --delete-app-data (instead of --updated), then wipe leftover app data folders.

!macroundef _isDeleteAppData
!undef isDeleteAppData
!macro _isDeleteAppData _a _b _t _f
  StrCmp "1" "1" `${_t}` `${_f}`
!macroend
!define isDeleteAppData `"" isDeleteAppData ""`

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
  ; Remove orphaned install folders from renamed product builds (same appId).
  RMDir /r "$LOCALAPPDATA\Programs\My UML Multi OS"
  RMDir /r "$PROGRAMFILES\My UML Multi OS"
  RMDir /r "$PROGRAMFILES64\My UML Multi OS"
!macroend

!macro customInstall
  !insertmacro RemoveAppDataFolders
!macroend

!macro customUnInstall
  !insertmacro RemoveAppDataFolders
!macroend
