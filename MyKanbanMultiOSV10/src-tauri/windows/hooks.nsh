; MyKanban installer additions (read by Tauri's NSIS template).
;
;  - The old Electron build is removed first by running its own uninstaller, so only one MyKanban
;    stays installed. That uninstaller leaves %APPDATA%\MyKanban alone: this build uses the same
;    folder, so the database and attachments carry over.
;  - The .kprj file type keeps its own document icon.
;  - Uninstalling with "delete app data" also deletes %APPDATA%\MyKanban.
;  - The installer always asks for its language first. Without MUI_LANGDLL_ALWAYSSHOW, NSIS
;    remembers the first answer in the registry and never asks again.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_WINDOWTITLE "MyKanban Setup / 설치"
!define MUI_LANGDLL_INFO "Please select the installer language.$\r$\n설치 언어를 선택하세요."

; electron-builder's key for appId com.kanban.multios
; (GUID = UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)).
!define MK_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\92439db1-ba0f-5168-bd34-56754756705a"
!define MK_DATA_DIR "MyKanban"
!define MK_FILE_CLASS "MyKanban Project"

; "C:\dir\x.exe" /args -> C:\dir\x.exe   (in and out: $R0)
Function MK_FirstQuoted
  StrCpy $R1 $R0 1
  ${If} $R1 == '"'
    StrCpy $R0 $R0 "" 1
    StrCpy $R2 0
    mk_find_quote:
      StrCpy $R1 $R0 1 $R2
      StrCmp $R1 '"' mk_quote_found
      StrCmp $R1 "" mk_quote_found
      IntOp $R2 $R2 + 1
      Goto mk_find_quote
    mk_quote_found:
    StrCpy $R0 $R0 $R2
  ${EndIf}
FunctionEnd

Function MK_RemoveElectron
  ; Installed for this user.
  ReadRegStr $R0 HKCU "${MK_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    Call MK_FirstQuoted
    ${If} ${FileExists} "$R0"
      ${GetParent} $R0 $R3
      DetailPrint "Removing the Electron build of MyKanban: $R3"
      ; _?= makes it finish before this installer goes on.
      ExecWait '"$R0" /S /currentuser _?=$R3'
      Delete "$R0"
      RMDir "$R3"
    ${EndIf}
    DeleteRegKey HKCU "${MK_ELECTRON_KEY}"
  ${EndIf}

  ; Installed for all users: its uninstaller asks for administrator rights.
  ReadRegStr $R0 HKLM "${MK_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    Call MK_FirstQuoted
    ${If} ${FileExists} "$R0"
      ${GetParent} $R0 $R3
      DetailPrint "Removing the Electron build of MyKanban: $R3"
      ExecShellWait "open" "$R0" '/S /allusers _?=$R3'
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode <> 1
    Call MK_RemoveElectron
    SetOutPath "$INSTDIR"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${MK_FILE_CLASS}\DefaultIcon" "" "$INSTDIR\kprj.ico,0"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ${If} $DeleteAppDataCheckboxState = 1
      SetShellVarContext current
      RMDir /r "$APPDATA\${MK_DATA_DIR}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
