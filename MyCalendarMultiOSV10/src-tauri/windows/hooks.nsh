!macro NSIS_HOOK_POSTINSTALL
  ; 1042 is Korean. The language selector writes the choice next to the app.
  FileOpen $0 "$INSTDIR\install-language.txt" w
  ${If} $LANGUAGE = 1042
    FileWrite $0 "ko$\r$\n"
  ${Else}
    FileWrite $0 "en$\r$\n"
  ${EndIf}
  FileClose $0
!macroend
