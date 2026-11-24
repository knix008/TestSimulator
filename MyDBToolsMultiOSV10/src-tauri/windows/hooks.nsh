; DBTools installer hooks.
;
; Tauri registers .mdprj under the ProgID "DBTools Project" with the program's
; own icon; documents get their own page-shaped icon (assets/file-icon.ico,
; installed next to the executable as a resource) instead.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\DBTools Project\DefaultIcon" "" "$INSTDIR\file-icon.ico,0"
  ; No SHChangeNotify(SHCNE_ASSOCCHANGED) here: it has wiped desktop icon
  ; layouts on this machine before. Explorer picks the icon up on its next refresh.
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\DBTools Project\DefaultIcon"
!macroend
