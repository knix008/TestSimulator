; The installer asks for its language (한국어 / English) every time. Without this, NSIS skips the question
; once a language is remembered in the registry (HKCU\Software\shkwon\MyWorkForce "Installer Language"),
; so a second installation could never change it. The remembered language is still offered first.
; This file is included before .onInit, where MUI_LANGDLL_DISPLAY reads these.
!define MUI_LANGDLL_ALWAYSSHOW
; The title is the program and its version (PRODUCTNAME and VERSION are defined by Tauri after this file is
; included; NSIS expands them where the title is used, in .onInit). What the window asks goes in the text.
!define MUI_LANGDLL_WINDOWTITLE "${PRODUCTNAME} ${VERSION}"
; The dialog has room for two short lines above the list.
!define MUI_LANGDLL_INFO "설치 언어 / Installation language$\r$\n언어를 고르세요. / Choose a language."

; The language dialog (LangDLL) is drawn with a modal frame, which has no title-bar icon. langicon.exe
; (tools/langicon, built by scripts/build.mjs next to this file) is started just before the dialog: it finds
; the dialog of this installer by its title, turns its title-bar icon on and gives it the installer's icon.
; MUI2 is included before this file, so its MUI_LANGDLL_DISPLAY is replaced here with the same steps plus that.
!define MWF_LANGICON "${__FILEDIR__}\langicon.exe"
!macro MWF_LANGDIALOG_ICON
  !ifndef __UNINSTALL__
  !if /FileExists "${MWF_LANGICON}"
    Push $0
    InitPluginsDir
    File "/oname=$PLUGINSDIR\langicon.exe" "${MWF_LANGICON}"
    System::Call 'kernel32::GetCurrentProcessId() i .r0'
    Exec '"$PLUGINSDIR\langicon.exe" $0 "$EXEPATH" "${MUI_LANGDLL_WINDOWTITLE}"'
    Pop $0
  !endif
  !endif
!macroend

!macroundef MUI_LANGDLL_DISPLAY
!macro MUI_LANGDLL_DISPLAY
  !verbose push
  !verbose ${MUI_VERBOSE}
  !ifndef MUI_LANGDLL_LANGUAGES
    !warning "MUI_LANGDLL_DISPLAY should only be used after inserting the MUI_LANGUAGE macro(s)"
  !endif
  !insertmacro MUI_LANGDLL_VARIABLES
  !insertmacro MUI_DEFAULT MUI_LANGDLL_WINDOWTITLE "Installer Language"
  !insertmacro MUI_DEFAULT MUI_LANGDLL_INFO "Please select a language."
  !ifdef MUI_LANGDLL_REGISTRY_VARIABLES
    ReadRegStr $mui.LangDLL.RegistryLanguage "${MUI_LANGDLL_REGISTRY_ROOT}" "${MUI_LANGDLL_REGISTRY_KEY}" "${MUI_LANGDLL_REGISTRY_VALUENAME}"
    ${if} $mui.LangDLL.RegistryLanguage != ""
      StrCpy $LANGUAGE $mui.LangDLL.RegistryLanguage
    ${endif}
  !endif
  !ifdef NSIS_CONFIG_SILENT_SUPPORT
    ${unless} ${Silent}
  !endif
  !ifndef MUI_LANGDLL_ALWAYSSHOW
  !ifdef MUI_LANGDLL_REGISTRY_VARIABLES
    ${if} $mui.LangDLL.RegistryLanguage == ""
  !endif
  !endif
  !insertmacro MWF_LANGDIALOG_ICON
  !ifdef MUI_LANGDLL_ALLLANGUAGES
    LangDLL::LangDialog "${MUI_LANGDLL_WINDOWTITLE}" "${MUI_LANGDLL_INFO}" A ${MUI_LANGDLL_LANGUAGES} ""
  !else
    LangDLL::LangDialog "${MUI_LANGDLL_WINDOWTITLE}" "${MUI_LANGDLL_INFO}" AC ${MUI_LANGDLL_LANGUAGES_CP} ""
  !endif
    Pop $LANGUAGE
    ${if} $LANGUAGE == "cancel"
      Abort
    ${endif}
  !ifndef MUI_LANGDLL_ALWAYSSHOW
  !ifdef MUI_LANGDLL_REGISTRY_VARIABLES
    ${endif}
  !endif
  !endif
  !ifdef NSIS_CONFIG_SILENT_SUPPORT
    ${endif}
  !endif
  !verbose pop
!macroend

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
