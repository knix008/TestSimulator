; MyDiagram installer hooks (included by Tauri's NSIS template).
;
; Before installing:
;  1. Preferences from a previous installation are reset; the user's data is
;     kept. Both live in the WebView2 profile (%LOCALAPPDATA%\${BUNDLEID}),
;     which an installer cannot edit, so after installing a marker is left in
;     %APPDATA%\${BUNDLEID}\install-reset and the window place is deleted. The
;     next start resets theme, fonts, zoom, panels, view options, popup places,
;     column widths and print choices, and keeps recent files and folders, the
;     open-drawing session, the database connection, the background image and the
;     tutorial history (window_state.rs, resetForNewInstall in settings.js).
;  2. A previous installation is always removed completely (its uninstaller
;     runs silently, then its folder is deleted) before the new files go in,
;     even when the "already installed" page was left at "reinstall".
; After installing:
;  3. .mdg drawings and .mdgt templates get their own icons (drawing.ico,
;     template.ico), not the app icon.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!macro NSIS_HOOK_PREINSTALL
  ; 2. Previous installation
  ReadRegStr $R6 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $R6 != ""
  ${AndIf} ${FileExists} "$R6\uninstall.exe"
    DetailPrint "Removing the previous installation: $R6"
    ExecWait '"$R6\uninstall.exe" /S _?=$R6' $R5
    Delete "$R6\uninstall.exe"
    ; Only a folder of our own is deleted as a whole.
    ${GetFileName} "$R6" $R4
    ${If} $R4 == "${PRODUCTNAME}"
      RMDir /r "$R6"
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 1. Preferences: reset at the next start. Written after the old uninstaller ran (it may clear the folder).
  CreateDirectory "$APPDATA\${BUNDLEID}"
  Delete "$APPDATA\${BUNDLEID}\window-state.json"
  System::Call 'kernel32::GetTickCount() i .r9'
  FileOpen $R9 "$APPDATA\${BUNDLEID}\install-reset" w
  FileWrite $R9 "$9"
  FileClose $R9
  ; 3. Document icons (Tauri registers the types with the app icon).
  WriteRegStr SHCTX "Software\Classes\MyDiagram.Drawing\DefaultIcon" "" "$INSTDIR\drawing.ico"
  WriteRegStr SHCTX "Software\Classes\MyDiagram.Template\DefaultIcon" "" "$INSTDIR\template.ico"
  ; Start menu shortcut to the user's guide installed with the program.
  ${If} ${FileExists} "$INSTDIR\docs\UsersGuide.html"
    CreateDirectory "$SMPROGRAMS\${PRODUCTNAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCTNAME}\MyDiagram User's Guide.lnk" "$INSTDIR\docs\UsersGuide.html"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\${PRODUCTNAME}\MyDiagram User's Guide.lnk"
!macroend
