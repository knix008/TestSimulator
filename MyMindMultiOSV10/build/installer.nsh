; Custom NSIS macros for MyMind
; - Offer Start Menu / Desktop shortcuts (electron-builder NSIS UI)
; - Completely remove any previous installation before installing the new one
; - Install the bundled sample diagrams as editable examples in Documents

!macro customInit
  ; $R0 = previous uninstaller path, $R1 = previous install location.
  StrCpy $R0 ""
  StrCpy $R1 ""

  ; Look up the previous install: per-user then per-machine, plain appId then *_is1.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind" "UninstallString"
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind" "InstallLocation"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind" "UninstallString"
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind" "InstallLocation"
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind_is1" "UninstallString"
    ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind_is1" "InstallLocation"
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind_is1" "UninstallString"
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind_is1" "InstallLocation"
  ${EndIf}

  ${If} $R0 != ""
    DetailPrint "Removing the previous MyMind installation..."

    ; Close any running instance so files are not locked.
    nsExec::Exec 'taskkill /F /IM MyMind.exe /T'

    ; Fall back to $INSTDIR if the old location was not recorded.
    ${If} $R1 == ""
      StrCpy $R1 "$INSTDIR"
    ${EndIf}

    ; Run the previous uninstaller silently and wait for it to finish.
    ; _?= keeps the run synchronous and points at the old install dir.
    ExecWait '$R0 /S _?=$R1'

    ; Remove anything the uninstaller left behind (including its own copy).
    Delete "$R1\Uninstall MyMind.exe"
    RMDir /r "$R1"

    ; Shortcuts.
    Delete "$DESKTOP\MyMind.lnk"
    Delete "$SMPROGRAMS\MyMind\MyMind.lnk"
    RMDir "$SMPROGRAMS\MyMind"

    ; Application data / caches for a truly clean install.
    RMDir /r "$APPDATA\MyMind"
    RMDir /r "$LOCALAPPDATA\MyMind"
    RMDir /r "$LOCALAPPDATA\Programs\mymind"
    RMDir /r "$LOCALAPPDATA\mymind-updater"
  ${EndIf}
!macroend

; Copy the bundled sample diagrams (shipped under resources\template) into the
; user's Documents so they can be opened and edited as examples.
!macro customInstall
  CreateDirectory "$DOCUMENTS\MyMind Examples"
  CopyFiles /SILENT "$INSTDIR\resources\template\*.mmap" "$DOCUMENTS\MyMind Examples"
!macroend

; Remove the installed examples on uninstall (user files elsewhere are untouched).
!macro customUnInstall
  Delete "$DOCUMENTS\MyMind Examples\*.mmap"
  RMDir "$DOCUMENTS\MyMind Examples"
!macroend
