; My Compare Master — additions to Tauri's NSIS installer.
;
;   1. .dmrg session files get the document icon (assets/document.ico, shipped beside
;      the exe) instead of the program icon, and Explorer sees it at once.
;   2. On uninstall, settings and session data are only deleted if the user says so.
;      A silent uninstall (an upgrade) never asks and never deletes them.
;   3. Both speak the language chosen on the installer's first page.
;   4. That language also becomes the app's language (see MCM_INSTALL_LANGUAGE_FILE).
;
; Tauri includes this file before it defines its own variables, so the names are
; spelled out here. test/build.test.mjs checks them against tauri.conf.json.

!define MCM_PRODUCT "My Compare Master"
!define MCM_DATA_FOLDER "MyCompareMaster"
!define MCM_DOC_CLASS "My Compare Master Session"

; Ask for the language on every install. Without this the language dialog is skipped
; once a previous install saved "Installer Language" in the registry; that saved value
; now only preselects the choice. A silent install still never asks.
!define MUI_LANGDLL_ALWAYSSHOW

; core/settingsStore.ts (INSTALL_LANGUAGE_FILE) reads it on the next start, applies it and deletes it.
!define MCM_INSTALL_LANGUAGE_FILE "install-language"

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${MCM_DOC_CLASS}\DefaultIcon" "" "$INSTDIR\document.ico"
  ; The language picked on the installer's first page becomes the app's language.
  ; A silent install (an upgrade) never showed that page, so it keeps the user's choice.
  ${IfNot} ${Silent}
    Push $0
    CreateDirectory "$APPDATA\${MCM_DATA_FOLDER}"
    FileOpen $0 "$APPDATA\${MCM_DATA_FOLDER}\${MCM_INSTALL_LANGUAGE_FILE}" w
    ${If} $LANGUAGE = 1042
      FileWrite $0 "ko"
    ${Else}
      FileWrite $0 "en"
    ${EndIf}
    FileClose $0
    Pop $0
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${IfNot} ${Silent}
    ${If} ${FileExists} "$APPDATA\${MCM_DATA_FOLDER}\*.*"
      ${If} $LANGUAGE = 1042
        MessageBox MB_YESNO|MB_ICONQUESTION "저장된 설정과 세션 데이터가 있습니다.$\r$\n함께 삭제하시겠습니까?$\r$\n$\r$\n[예] 모두 삭제   [아니요] 데이터 유지" /SD IDNO IDNO mcm_keep_data
      ${Else}
        MessageBox MB_YESNO|MB_ICONQUESTION "Saved settings and session data were found.$\r$\nDelete them as well?$\r$\n$\r$\n[Yes] delete everything   [No] keep my data" /SD IDNO IDNO mcm_keep_data
      ${EndIf}
      RMDir /r "$APPDATA\${MCM_DATA_FOLDER}"
      mcm_keep_data:
    ${EndIf}
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
