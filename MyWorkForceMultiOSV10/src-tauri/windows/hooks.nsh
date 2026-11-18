; The installer asks for its language (한국어 / English) every time. Without this, NSIS skips the question
; once a language is remembered in the registry (HKCU\Software\shkwon\MyWorkForce "Installer Language"),
; so a second installation could never change it. The remembered language is still offered first.
; This file is included before .onInit, where MUI_LANGDLL_DISPLAY reads these.
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_WINDOWTITLE "설치 언어 / Installer Language"
!define MUI_LANGDLL_INFO "사용할 언어를 고르세요.$\r$\nChoose a language."

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
