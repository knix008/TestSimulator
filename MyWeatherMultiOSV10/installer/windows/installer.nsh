; MyWeather reinstall policy. Mirrors installer/plan.js.
; 1. If a previous install exists, remove it completely and install again.
; 2. If saved user data exists, ask whether to delete it.
; 3. The user chooses English or Korean (displayLanguageSelector).
; 4. Register the application icon and the .myweather document icon.

!macro customInit
  !ifdef UNINSTALL_APP_KEY
    ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  !else
    StrCpy $R0 ""
  !endif
  ${if} ${isUpdated}
    StrCpy $R0 "$INSTDIR\Uninstall MyWeather.exe"
  ${endIf}
  IfFileExists "$APPDATA\MyWeather\settings.json" 0 myweather_no_data
    MessageBox MB_YESNO|MB_ICONQUESTION "Saved data from the previous installation was found. Do you want to delete it?$\n이전에 설치한 프로그램의 저장 데이터가 있습니다. 삭제하시겠습니까?" /SD IDNO IDYES myweather_delete_data IDNO myweather_no_data
  myweather_delete_data:
    RMDir /r "$APPDATA\MyWeather"
  myweather_no_data:
  ${if} ${isUpdated}
    DetailPrint "An existing installation was found. It will be removed completely and installed again."
    DetailPrint "이미 설치된 프로그램이 있습니다. 완전히 삭제한 뒤 다시 설치합니다."
    IfFileExists "$R0" 0 myweather_remove_dir
      ExecWait '"$R0" /S _?=$INSTDIR'
    myweather_remove_dir:
    RMDir /r "$INSTDIR"
    CreateDirectory "$INSTDIR"
  ${endIf}
!macroend

!macro customInstall
  DetailPrint "Register application icon assets/icon.ico and document icon assets/file.ico for .myweather"
!macroend

!macro customUnInstall
  ; User data is kept unless the installer already removed it after the prompt.
!macroend
