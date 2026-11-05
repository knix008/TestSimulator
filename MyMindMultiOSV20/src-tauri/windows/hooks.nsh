; MyMind installer additions (read by the Tauri NSIS template). Saved as UTF-8 with a BOM,
; which is how NSIS knows the Korean below is not in the system's code page.
;
; The template's file association registers .mmap and its "open" command under the ProgID named
; in tauri.conf.json, with the program's own icon. What is added here:
;   - .mmap files show the diagram file icon;
;   - the file type's content type and its "Open with" entry;
;   - a clean registry after uninstalling: the template's macro leaves the extension's key behind,
;     and after a reinstall its backup value names this very ProgID.

; The language is asked at every install, with the last one chosen already selected. By default the
; question is skipped once a language has been remembered. It is asked before any language is
; chosen, so it says so in both.
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_WINDOWTITLE "언어 / Language"
!define MUI_LANGDLL_INFO "설치에 사용할 언어를 고르세요.$\r$\nPlease select the language for the installation."

!define MM_EXT ".mmap"
!define MM_LANGUAGE_FILE "install-language.txt"
!define MM_PROGID "MyMind.Diagram"
!define MM_BACKUP "MyMind.Diagram_backup"

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\${MM_LANGUAGE_FILE}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The language chosen for the installation, for the program's first start.
  FileOpen $R0 "$INSTDIR\${MM_LANGUAGE_FILE}" w
  FileWrite $R0 "$LANGUAGE"
  FileClose $R0
  WriteRegStr SHCTX "Software\Classes\${MM_PROGID}\DefaultIcon" "" "$INSTDIR\file-icon.ico,0"
  WriteRegStr SHCTX "Software\Classes\${MM_EXT}" "Content Type" "application/vnd.mymind+json"
  WriteRegStr SHCTX "Software\Classes\${MM_EXT}\OpenWithProgids" "${MM_PROGID}" ""
  ; Reinstalling backs up this ProgID as what was there before; there was nothing else before.
  ReadRegStr $R0 SHCTX "Software\Classes\${MM_EXT}" "${MM_BACKUP}"
  StrCmp $R0 "${MM_PROGID}" 0 +2
    DeleteRegValue SHCTX "Software\Classes\${MM_EXT}" "${MM_BACKUP}"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The extension's key goes too, unless another program had the extension before this one.
  ReadRegStr $R0 SHCTX "Software\Classes\${MM_EXT}" ""
  StrCmp $R0 "" +2 0
  StrCmp $R0 "${MM_PROGID}" 0 +2
    DeleteRegKey SHCTX "Software\Classes\${MM_EXT}"
  !insertmacro UPDATEFILEASSOC
!macroend
