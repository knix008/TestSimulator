; Reinstall support: close a running app so the old version can be removed cleanly.
!macro customInit
  !ifndef BUILD_UNINSTALLER
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 = 0
      DetailPrint "Closing running ${PRODUCT_NAME}..."
      nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
      Sleep 800
    ${EndIf}
  !endif
!macroend
