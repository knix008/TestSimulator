; Custom NSIS macros for MyVideoPhone
; When the Setup runs (not an in-app --updated upgrade), completely remove any
; previous installation (files, shortcuts, registry, app data) before installing.

; Included early by electron-builder — pull LogicLib before any ${if} usage.
!include LogicLib.nsh
!include FileFunc.nsh
!insertmacro GetParameters
!insertmacro GetOptions

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

  ; Parent directory of a file path (no StdUtils — plugin is unavailable this early).
  Function mvpGetParentPath
    Exch $R0
    Push $R1
    Push $R2
    Push $R3

    StrCpy $R1 0
    StrLen $R2 $R0

    mvp_gpp_loop:
      IntOp $R1 $R1 - 1
      IntCmp $R1 -$R2 mvp_gpp_done mvp_gpp_done 0
      StrCpy $R3 $R0 1 $R1
      StrCmp $R3 "\" mvp_gpp_found
      Goto mvp_gpp_loop

    mvp_gpp_found:
      StrCpy $R0 $R0 $R1

    mvp_gpp_done:
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
      Push $R2
      Call mvpGetParentPath
      Pop $R1
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

    ; Electron / Chromium user data & caches (always per-user)
    ; Do not reference $installMode here — it is declared later by multiUser.nsh.
    SetShellVarContext current
    RMDir /r "$APPDATA\${APP_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"

    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  FunctionEnd

  Function mvpForceCleanPreviousInstall
    DetailPrint "Removing previous ${PRODUCT_NAME} installation..."

    ; Close a running instance so files can be deleted
    ; APP_EXECUTABLE_FILENAME is defined later in common.nsh — use PRODUCT_FILENAME here.
    nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T`
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
    ; Do not use ${isUpdated} here — StdUtils is unavailable when this file is compiled.
    ${GetParameters} $R8
    ClearErrors
    ${GetOptions} $R8 "--updated" $R9
    ${ifNot} ${errors}
      Abort
    ${endif}

    Call mvpForceCleanPreviousInstall
    Abort
  FunctionEnd

!endif

; Register one extension for Default Apps / Open with.
!macro mvpRegisterAssoc EXT PROGID DESCRIPTION
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\${PROGID}" "" "${DESCRIPTION}"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\${PRODUCT_FILENAME}\Capabilities\FileAssociations" ".${EXT}" "${PROGID}"
!macroend

!macro mvpUnregisterAssoc EXT PROGID
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
  DeleteRegKey SHCTX "Software\Classes\${PROGID}"
!macroend

!macro customInstall
  ; Cleanup of older installs runs in customPageAfterChangeDir.
  DetailPrint "Registering ${PRODUCT_NAME} as a media player..."

  ; Appear under Settings → Default apps (Windows 10/11).
  WriteRegStr SHCTX "Software\${PRODUCT_FILENAME}\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHCTX "Software\${PRODUCT_FILENAME}\Capabilities" "ApplicationDescription" "Play video and audio files with ${PRODUCT_NAME}"
  WriteRegStr SHCTX "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\${PRODUCT_FILENAME}\Capabilities"

  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"

  ; Video
  !insertmacro mvpRegisterAssoc "mp4"  "MyVideoPhone.mp4"  "MP4 Video"
  !insertmacro mvpRegisterAssoc "m4v"  "MyVideoPhone.m4v"  "M4V Video"
  !insertmacro mvpRegisterAssoc "webm" "MyVideoPhone.webm" "WebM Video"
  !insertmacro mvpRegisterAssoc "mkv"  "MyVideoPhone.mkv"  "MKV Video"
  !insertmacro mvpRegisterAssoc "mov"  "MyVideoPhone.mov"  "QuickTime Video"
  !insertmacro mvpRegisterAssoc "avi"  "MyVideoPhone.avi"  "AVI Video"
  !insertmacro mvpRegisterAssoc "ogv"  "MyVideoPhone.ogv"  "Ogg Video"
  !insertmacro mvpRegisterAssoc "hevc" "MyVideoPhone.hevc" "HEVC Video"
  !insertmacro mvpRegisterAssoc "h265" "MyVideoPhone.h265" "H.265 Video"
  ; Audio
  !insertmacro mvpRegisterAssoc "mp3"  "MyVideoPhone.mp3"  "MP3 Audio"
  !insertmacro mvpRegisterAssoc "aac"  "MyVideoPhone.aac"  "AAC Audio"
  !insertmacro mvpRegisterAssoc "m4a"  "MyVideoPhone.m4a"  "M4A Audio"
  !insertmacro mvpRegisterAssoc "wav"  "MyVideoPhone.wav"  "WAV Audio"
  !insertmacro mvpRegisterAssoc "flac" "MyVideoPhone.flac" "FLAC Audio"
  !insertmacro mvpRegisterAssoc "opus" "MyVideoPhone.opus" "Opus Audio"
  !insertmacro mvpRegisterAssoc "ogg"  "MyVideoPhone.ogg"  "Ogg Audio"
  !insertmacro mvpRegisterAssoc "wma"  "MyVideoPhone.wma"  "WMA Audio"

  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  ; Skip association cleanup during in-app updates (--updated).
  ${GetParameters} $R8
  ClearErrors
  ${GetOptions} $R8 "--updated" $R9
  ${if} ${errors}
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

    DeleteRegValue SHCTX "Software\RegisteredApplications" "${PRODUCT_NAME}"
    DeleteRegKey SHCTX "Software\${PRODUCT_FILENAME}\Capabilities"
    DeleteRegKey SHCTX "Software\${PRODUCT_FILENAME}"
    DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"

    !insertmacro mvpUnregisterAssoc "mp4"  "MyVideoPhone.mp4"
    !insertmacro mvpUnregisterAssoc "m4v"  "MyVideoPhone.m4v"
    !insertmacro mvpUnregisterAssoc "webm" "MyVideoPhone.webm"
    !insertmacro mvpUnregisterAssoc "mkv"  "MyVideoPhone.mkv"
    !insertmacro mvpUnregisterAssoc "mov"  "MyVideoPhone.mov"
    !insertmacro mvpUnregisterAssoc "avi"  "MyVideoPhone.avi"
    !insertmacro mvpUnregisterAssoc "ogv"  "MyVideoPhone.ogv"
    !insertmacro mvpUnregisterAssoc "hevc" "MyVideoPhone.hevc"
    !insertmacro mvpUnregisterAssoc "h265" "MyVideoPhone.h265"
    !insertmacro mvpUnregisterAssoc "mp3"  "MyVideoPhone.mp3"
    !insertmacro mvpUnregisterAssoc "aac"  "MyVideoPhone.aac"
    !insertmacro mvpUnregisterAssoc "m4a"  "MyVideoPhone.m4a"
    !insertmacro mvpUnregisterAssoc "wav"  "MyVideoPhone.wav"
    !insertmacro mvpUnregisterAssoc "flac" "MyVideoPhone.flac"
    !insertmacro mvpUnregisterAssoc "opus" "MyVideoPhone.opus"
    !insertmacro mvpUnregisterAssoc "ogg"  "MyVideoPhone.ogg"
    !insertmacro mvpUnregisterAssoc "wma"  "MyVideoPhone.wma"

    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  ${endif}
!macroend
