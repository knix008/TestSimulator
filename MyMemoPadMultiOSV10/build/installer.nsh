; If a previous MyMemoPad is installed, fully remove it (files, shortcuts,
; registry, app data, Run key) before this setup copies new files.
; Matches MemoPadV10: install → Run key + start with --autostart.

!include LogicLib.nsh
!include FileFunc.nsh
!insertmacro GetParameters
!insertmacro GetOptions

; Same keys as multiUser.nsh — needed here because this file is compiled earlier.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

!macro killRunningMyMemoPad
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T`
  Pop $0
  Sleep 500
!macroend

!macro purgeMyMemoPadRunKeys
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_FILENAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "my-memopad-multios"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.MyMemoPad"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.my-memopad-multios"
!macroend

!ifndef BUILD_UNINSTALLER

  Function mmpGetInQuotes
    Exch $R0
    Push $R1
    Push $R2
    Push $R3

    StrCpy $R2 -1
    IntOp $R2 $R2 + 1
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" 0 +3
      StrCpy $R0 ""
      Goto mmp_giq_done
    StrCmp $R3 '"' 0 -5

    IntOp $R2 $R2 + 1
    StrCpy $R0 $R0 "" $R2

    StrCpy $R2 0
    IntOp $R2 $R2 + 1
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" 0 +3
      StrCpy $R0 ""
      Goto mmp_giq_done
    StrCmp $R3 '"' 0 -5

    StrCpy $R0 $R0 $R2

    mmp_giq_done:
      Pop $R3
      Pop $R2
      Pop $R1
      Exch $R0
  FunctionEnd

  Function mmpGetParentPath
    Exch $R0
    Push $R1
    Push $R2
    Push $R3

    StrCpy $R1 0
    StrLen $R2 $R0

    mmp_gpp_loop:
      IntOp $R1 $R1 - 1
      IntCmp $R1 -$R2 mmp_gpp_done mmp_gpp_done 0
      StrCpy $R3 $R0 1 $R1
      StrCmp $R3 "\" mmp_gpp_found
      Goto mmp_gpp_loop

    mmp_gpp_found:
      StrCpy $R0 $R0 $R1

    mmp_gpp_done:
      Pop $R3
      Pop $R2
      Pop $R1
      Exch $R0
  FunctionEnd

  ; $R6 = registry hive (HKCU / HKLM), $R7 = mode flag (/currentuser or /allusers)
  Function mmpUninstallFromHive
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
      Goto mmp_ufh_done
    ${endif}

    Push $R0
    Call mmpGetInQuotes
    Pop $R2

    ${if} $R2 == ""
      StrCpy $R2 $R0
    ${endif}

    ${if} $R1 == ""
    ${andIf} $R2 != ""
      Push $R2
      Call mmpGetParentPath
      Pop $R1
    ${endif}

    ${if} $R2 != ""
    ${andIf} ${FileExists} "$R2"
      InitPluginsDir
      ClearErrors
      CopyFiles /SILENT /FILESONLY "$R2" "$PLUGINSDIR\mmp-old-uninstaller.exe"
      ${if} ${errors}
        ExecWait '"$R2" /S --delete-app-data $R7 _?=$R1' $R3
      ${else}
        ExecWait '"$PLUGINSDIR\mmp-old-uninstaller.exe" /S --delete-app-data $R7 _?=$R1' $R3
        Delete "$PLUGINSDIR\mmp-old-uninstaller.exe"
      ${endif}
      Sleep 400
    ${endif}

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

    mmp_ufh_done:
      Pop $R3
      Pop $R2
      Pop $R1
      Pop $R0
  FunctionEnd

  Function mmpRemoveShortcutsAndAppData
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

    SetShellVarContext current
    RMDir /r "$APPDATA\${APP_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$APPDATA\MyMemoPad"
    RMDir /r "$APPDATA\my-memopad-multios"
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$LOCALAPPDATA\MyMemoPad"
    RMDir /r "$LOCALAPPDATA\my-memopad-multios"

    !insertmacro purgeMyMemoPadRunKeys
    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  FunctionEnd

  Function mmpForceCleanPreviousInstall
    DetailPrint "Removing previous ${PRODUCT_NAME} installation..."
    !insertmacro killRunningMyMemoPad

    StrCpy $R6 "HKCU"
    StrCpy $R7 "/currentuser"
    Call mmpUninstallFromHive

    StrCpy $R6 "HKLM"
    StrCpy $R7 "/allusers"
    Call mmpUninstallFromHive

    ${if} $INSTDIR != ""
      RMDir /r "$INSTDIR"
    ${endif}

    RMDir /r "$LOCALAPPDATA\Programs\MyMemoPad"
    RMDir /r "$LOCALAPPDATA\Programs\my-memopad-multios"
    RMDir /r "$PROGRAMFILES\MyMemoPad"
    RMDir /r "$PROGRAMFILES64\MyMemoPad"

    Call mmpRemoveShortcutsAndAppData
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom mmpForceCleanPage ""
  !macroend

  Function mmpForceCleanPage
    ${GetParameters} $R8
    ClearErrors
    ${GetOptions} $R8 "--updated" $R9
    ${ifNot} ${errors}
      Abort
    ${endif}

    Call mmpForceCleanPreviousInstall
    Abort
  FunctionEnd

!endif

!macro customInit
  !insertmacro killRunningMyMemoPad
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --autostart'

  CreateDirectory "$INSTDIR\resources"
  FileOpen $0 "$INSTDIR\resources\installer-options.json" w
  FileWrite $0 '{"showTrayIcon":true,"autoStart":true}'
  FileClose $0

  Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --autostart'
!macroend

!macro customRemoveFiles
  RMDir /r "$INSTDIR"
!macroend

!macro customUnInstall
  !insertmacro killRunningMyMemoPad
  !insertmacro purgeMyMemoPadRunKeys
  Delete "$INSTDIR\resources\installer-options.json"

  SetShellVarContext current
  RMDir /r "$APPDATA\${APP_FILENAME}"
  RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
  RMDir /r "$APPDATA\${PRODUCT_NAME}"
  RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
  RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
  RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
  RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
!macroend
