!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Talk.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
  CreateShortcut "$DESKTOP\MyWorkForce Talk.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Talk.lnk"
  Delete "$DESKTOP\MyWorkForce Talk.lnk"
!macroend
