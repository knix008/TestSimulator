; Custom NSIS macros for MyVideoPlayer
; When the Setup runs (not an in-app --updated upgrade), completely remove any
; previous installation (files, shortcuts, registry, app data) before installing.

; Same keys as multiUser.nsh — needed here because this file is compiled earlier.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

!ifndef BUILD_UNINSTALLER

  ; Extract the quoted executable path from an UninstallString value.
  Function mvpGetInQuotes
    Exch $R0
    Push $R1
    Push $R2
    Push $R3

    StrCpy $R2 -1
    IntOp $R2 $R2 + 1
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" 0 +3
      StrCpy $R0 ""
      Goto mvp_giq_done
    StrCmp $R3 '"' 0 -5

    IntOp $R2 $R2 + 1
    StrCpy $R0 $R0 "" $R2

    StrCpy $R2 0
    IntOp $R2 $R2 + 1
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" 0 +3
      StrCpy $R0 ""
      Goto mvp_giq_done
    StrCmp $R3 '"' 0 -5

    StrCpy $R0 $R0 $R2

    mvp_giq_done:
      Pop $R3
      Pop $R2
      Pop $R1
      Exch $R0
  FunctionEnd

  ; $R6 = registry hive (HKCU / HKLM), $R7 = mode flag (/currentuser or /allusers)
  Function mvpUninstallFromHive
    Push $R0
    Push $R1
    Push $R2
    Push $R3

    StrCpy $R0 ""
    StrCpy $R1 ""

    ${if} $R6 == "HKCU"
      ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      !ifdef UNINSTALL_REGISTRY_KEY_2
        ${if} $R0 == ""
          ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
        ${endif}
      !endif
    ${else}
      ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      !ifdef UNINSTALL_REGISTRY_KEY_2
        ${if} $R0 == ""
          ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
        ${endif}
      !endif
    ${endif}

    ${if} $R0 == ""
    ${andIf} $R1 == ""
      Goto mvp_ufh_done
    ${endif}

    Push $R0
    Call mvpGetInQuotes
    Pop $R2

    ${if} $R2 == ""
      StrCpy $R2 $R0
    ${endif}

    ${if} $R1 == ""
    ${andIf} $R2 != ""
      ; Derive install dir from uninstaller path
      ${StdUtils.GetParentPath} $R1 "$R2"
    ${endif}

    ${if} $R2 != ""
    ${andIf} ${FileExists} "$R2"
      InitPluginsDir
      ClearErrors
      CopyFiles /SILENT /FILESONLY "$R2" "$PLUGINSDIR\mvp-old-uninstaller.exe"
      ${if} ${errors}
        ; Fall back to in-place execution
        ExecWait '"$R2" /S --delete-app-data $R7 _?=$R1' $R3
      ${else}
        ExecWait '"$PLUGINSDIR\mvp-old-uninstaller.exe" /S --delete-app-data $R7 _?=$R1' $R3
        Delete "$PLUGINSDIR\mvp-old-uninstaller.exe"
      ${endif}
      Sleep 400
    ${endif}

    ; Force-remove leftovers even if the old uninstaller was missing/partial
    ${if} $R1 != ""
      RMDir /r "$R1"
    ${endif}

    ${if} $R6 == "HKCU"
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
      !ifdef UNINSTALL_REGISTRY_KEY_2
        DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY_2}"
      !endif
      DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    ${else}
      DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
      !ifdef UNINSTALL_REGISTRY_KEY_2
        DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY_2}"
      !endif
      DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
    ${endif}

    mvp_ufh_done:
      Pop $R3
      Pop $R2
      Pop $R1
      Pop $R0
  FunctionEnd

  Function mvpRemoveShortcutsAndAppData
    ; Shortcuts (current + all-users contexts)
    SetShellVarContext current
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    !ifdef MENU_FILENAME
      RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    !endif

    SetShellVarContext all
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    !ifdef MENU_FILENAME
      RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    !endif

    ; Restore shell context for the selected install mode
    ${if} $installMode == "all"
      SetShellVarContext all
    ${else}
      SetShellVarContext current
    ${endif}

    ; Electron / Chromium user data & caches (always per-user)
    SetShellVarContext current
    RMDir /r "$APPDATA\${APP_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"

    ${if} $installMode == "all"
      SetShellVarContext all
    ${else}
      SetShellVarContext current
    ${endif}

    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  FunctionEnd

  Function mvpForceCleanPreviousInstall
    DetailPrint "Removing previous ${PRODUCT_NAME} installation..."

    ; Close a running instance so files can be deleted
    nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
    Pop $R9
    Sleep 500

    ; Remove both per-user and per-machine installs if present
    StrCpy $R6 "HKCU"
    StrCpy $R7 "/currentuser"
    Call mvpUninstallFromHive

    StrCpy $R6 "HKLM"
    StrCpy $R7 "/allusers"
    Call mvpUninstallFromHive

    ; Also wipe the destination folder selected for this install
    ${if} $INSTDIR != ""
      RMDir /r "$INSTDIR"
    ${endif}

    Call mvpRemoveShortcutsAndAppData
  FunctionEnd

  ; Runs immediately before file installation (after directory selection).
  ; Abort skips showing any UI for this custom page.
  !macro customPageAfterChangeDir
    Page custom mvpForceCleanPage ""
  !macroend

  Function mvpForceCleanPage
    ; Preserve in-app auto-update behavior (--updated keeps user data).
    ${if} ${isUpdated}
      Abort
    ${endif}

    Call mvpForceCleanPreviousInstall
    Abort
  FunctionEnd

!endif

!macro customInstall
  ; Intentionally empty — cleanup runs in customPageAfterChangeDir.
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Extra cleanup when the user uninstalls from Apps & features
    SetShellVarContext current
    RMDir /r "$APPDATA\${APP_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
  ${endIf}
!macroend
