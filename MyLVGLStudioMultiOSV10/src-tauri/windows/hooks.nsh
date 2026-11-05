; My LVGL Studio installer additions (read by the Tauri NSIS template). Saved as UTF-8 with a BOM,
; which is how NSIS knows the Korean below is not in the system's code page.
;
; The template's file association registers .mylvgl and its "open" command under the ProgID named
; in tauri.conf.json, with the program's own icon. What is added here:
;   - .mylvgl files show the project file icon;
;   - the file type's content type and its "Open with" entry;
;   - a clean registry after uninstalling: the template's macro leaves the extension's key behind,
;     and after a reinstall its backup value names this very ProgID;
;   - the private compiler, every LVGL version that was downloaded (with what an interrupted download
;     left, which is in the same folder) and the native builds go with the program. An update keeps
;     them. Settings stay unless the uninstaller's own "delete app data" is ticked.

; The language is asked at every install, with the last one chosen already selected. By default the
; question is skipped once a language has been remembered. It is asked before any language is
; chosen, so it says so in both.
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_WINDOWTITLE "언어 / Language"
!define MUI_LANGDLL_INFO "설치에 사용할 언어를 고르세요.$\r$\nPlease select the language for the installation."

!define MLS_EXT ".mylvgl"
!define MLS_LANGUAGE_FILE "install-language.txt"
!define MLS_PROGID "MyLVGLStudio.Project"
!define MLS_BACKUP "MyLVGLStudio.Project_backup"
; The ProgID of the first builds, which had a name with spaces.
!define MLS_OLD_PROGID "My LVGL Studio Project"
; The app's data folder, SETTINGS_FOLDER in main.rs.
!define MLS_FOLDER "MyLVGLStudio"

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\${MLS_LANGUAGE_FILE}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The language chosen for the installation, for the program's first start.
  FileOpen $R0 "$INSTDIR\${MLS_LANGUAGE_FILE}" w
  FileWrite $R0 "$LANGUAGE"
  FileClose $R0
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
  ${If} $UpdateMode <> 1
    RmDir /r "$LOCALAPPDATA\${MLS_FOLDER}\toolchain"
    RmDir /r "$LOCALAPPDATA\${MLS_FOLDER}\toolchain.partial"
    ; Not /r: only if nothing else is in it.
    RmDir "$LOCALAPPDATA\${MLS_FOLDER}"
    RmDir /r "$APPDATA\${MLS_FOLDER}\native"
    RmDir /r "$APPDATA\${MLS_FOLDER}\lvgl"
  ${EndIf}
!macroend
