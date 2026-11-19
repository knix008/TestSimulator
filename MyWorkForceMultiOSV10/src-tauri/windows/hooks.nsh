; The installer asks for its language (한국어 / English) every time. Without this, NSIS skips the question
; once a language is remembered in the registry (HKCU\Software\shkwon\MyWorkForce "Installer Language"),
; so a second installation could never change it. The remembered language is still offered first.
; This file is included before .onInit, where MUI_LANGDLL_DISPLAY reads these.
!define MUI_LANGDLL_ALWAYSSHOW
; The title is the program and its version (PRODUCTNAME and VERSION are defined by Tauri after this file is
; included; NSIS expands them where the title is used, in .onInit). What the window asks goes in the text.
!define MUI_LANGDLL_WINDOWTITLE "${PRODUCTNAME} ${VERSION}"
!define MUI_LANGDLL_INFO "설치 언어 / Installation language$\r$\n$\r$\n사용할 언어를 고르세요.$\r$\nChoose a language."

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
  ; The chat program's shortcuts ("대화방" / "Chatting"); the earlier "Talk" ones go.
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Talk.lnk"
  Delete "$DESKTOP\MyWorkForce Talk.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce 대화방.lnk"
  Delete "$DESKTOP\MyWorkForce 대화방.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Chatting.lnk"
  Delete "$DESKTOP\MyWorkForce Chatting.lnk"
  StrCmp $LANGUAGE 1042 0 mwf_chat_en
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce 대화방.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
    CreateShortcut "$DESKTOP\MyWorkForce 대화방.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
    Goto mwf_chat_done
  mwf_chat_en:
  CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Chatting.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
  CreateShortcut "$DESKTOP\MyWorkForce Chatting.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--talk"
  mwf_chat_done:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Talk.lnk"
  Delete "$DESKTOP\MyWorkForce Talk.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce 대화방.lnk"
  Delete "$DESKTOP\MyWorkForce 대화방.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\MyWorkForce Chatting.lnk"
  Delete "$DESKTOP\MyWorkForce Chatting.lnk"
!macroend
