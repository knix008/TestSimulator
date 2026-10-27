; MySimulationMath installer hooks (Tauri NSIS).
; Model files (*.msim) get their own document icon. The installer language
; (Korean / English) is written to install-language; the app takes it as
; its language once per installation.

; Ask for the language on every install (the last choice stays preselected).
!define MUI_LANGDLL_ALWAYSSHOW

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\MySimulationMath.Model\DefaultIcon" "" "$INSTDIR\msim.ico,0"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  FileOpen $2 "$INSTDIR\install-language" w
  StrCmp $LANGUAGE 1042 0 msm_lang_en
    FileWrite $2 "ko"
    Goto msm_lang_done
msm_lang_en:
  FileWrite $2 "en"
msm_lang_done:
  FileClose $2
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\install-language"
  ; The optional .m association (Settings > General) belongs to this user.
  DeleteRegKey HKCU "Software\Classes\MySimulationMath.MFile"
!macroend
