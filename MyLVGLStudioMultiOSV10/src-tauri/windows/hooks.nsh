; My LVGL Studio installer additions (read by the Tauri NSIS template).
;
; The template's file association registers .mylvgl and its "open" command under the ProgID named
; in tauri.conf.json, with the program's own icon. What is added here:
;   - .mylvgl files show the project file icon;
;   - the file type's content type and its "Open with" entry;
;   - a clean registry after uninstalling: the template's macro leaves the extension's key behind,
;     and after a reinstall its backup value names this very ProgID.

!define MLS_EXT ".mylvgl"
!define MLS_PROGID "MyLVGLStudio.Project"
!define MLS_BACKUP "MyLVGLStudio.Project_backup"
; The ProgID of the first builds, which had a name with spaces.
!define MLS_OLD_PROGID "My LVGL Studio Project"

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${MLS_PROGID}\DefaultIcon" "" "$INSTDIR\file-icon.ico,0"
  WriteRegStr SHCTX "Software\Classes\${MLS_EXT}" "Content Type" "application/vnd.mylvgl+json"
  WriteRegStr SHCTX "Software\Classes\${MLS_EXT}\OpenWithProgids" "${MLS_PROGID}" ""
  DeleteRegKey SHCTX "Software\Classes\${MLS_OLD_PROGID}"
  DeleteRegValue SHCTX "Software\Classes\${MLS_EXT}" "${MLS_OLD_PROGID}_backup"
  ; Reinstalling backs up this ProgID as what was there before; there was nothing else before.
  ReadRegStr $R0 SHCTX "Software\Classes\${MLS_EXT}" "${MLS_BACKUP}"
  StrCmp $R0 "${MLS_PROGID}" 0 +2
    DeleteRegValue SHCTX "Software\Classes\${MLS_EXT}" "${MLS_BACKUP}"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The extension's key goes too, unless another program had the extension before this one.
  ReadRegStr $R0 SHCTX "Software\Classes\${MLS_EXT}" ""
  StrCmp $R0 "" +2 0
  StrCmp $R0 "${MLS_PROGID}" 0 +2
    DeleteRegKey SHCTX "Software\Classes\${MLS_EXT}"
  !insertmacro UPDATEFILEASSOC
!macroend
