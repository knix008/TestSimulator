!macro NSIS_HOOK_POSTINSTALL
  ; The program opens in the language chosen for the installation (Korean 1042, otherwise English).
  Push $0
  Push $1
  StrCpy $0 "en"
  StrCmp $LANGUAGE 1042 0 +2
    StrCpy $0 "ko"
  CreateDirectory "$APPDATA\com.shkwon.myworkforce"
  FileOpen $1 "$APPDATA\com.shkwon.myworkforce\install-language" w
  FileWrite $1 $0
  FileClose $1
  Pop $1
  Pop $0
  CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Talk.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
  CreateShortcut "$DESKTOP\MyWorkForce Talk.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Talk.lnk"
  Delete "$DESKTOP\MyWorkForce Talk.lnk"
!macroend
