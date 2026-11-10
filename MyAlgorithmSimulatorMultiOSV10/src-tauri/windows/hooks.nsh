; Writes the installer's language so the program opens in it.
; UTF-8 with BOM: NSIS otherwise reads the Korean text as ANSI.
; The selector is shown at every installation, with both languages.
; A silent (/S) or passive (/P) install writes nothing, so an update keeps the user's language.

!include "LogicLib.nsh"

!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "언어 / Language"
!define MUI_LANGDLL_INFO "설치와 프로그램에 사용할 언어를 고르십시오.$\nChoose the language of the installer and the program."

!macro NSIS_HOOK_POSTINSTALL
  ; Saved projects (.myalgo) show the document icon, not the program icon that
  ; the bundler's file association wrote. The class key is removed on uninstall.
  WriteRegStr SHCTX "Software\Classes\MyAlgorithmSimulator.Project\DefaultIcon" "" "$INSTDIR\assets\file-icon.ico"

  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
    CreateDirectory "$APPDATA\${BUNDLEID}"
    FileOpen $0 "$APPDATA\${BUNDLEID}\install-language" w
    ; 1042 = Korean, 1033 = English.
    ${If} $LANGUAGE == 1042
      FileWrite $0 "ko"
    ${Else}
      FileWrite $0 "en"
    ${EndIf}
    FileClose $0
  ${EndIf}
!macroend
