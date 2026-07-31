; Custom NSIS macros for MyMind
; - Offer Start Menu / Desktop shortcuts (electron-builder NSIS UI)
; - Fully remove previous installation before installing

!macro customInit
  ; Fully remove a previous MyMind install before installing the new version
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind" "UninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind" "UninstallString"
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind_is1" "UninstallString"
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.shkwon.mymind_is1" "UninstallString"
  ${EndIf}

  ${If} $R0 != ""
    DetailPrint "Removing previous MyMind installation..."
    ExecWait '$R0 /S _?=$INSTDIR'
    Delete "$DESKTOP\MyMind.lnk"
    Delete "$SMPROGRAMS\MyMind\MyMind.lnk"
    RMDir "$SMPROGRAMS\MyMind"
    RMDir /r "$INSTDIR"
  ${EndIf}
!macroend
