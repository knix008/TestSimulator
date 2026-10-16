; MyDockBar - additions to Tauri's NSIS installer (read in by its template).
; Replaces the Electron build's build/installer.nsh.
;
;  * A MyDockBar that is already installed - the Electron build or this one -
;    is always removed first, then this version installed fresh. Tauri's own
;    "keep it / remove it" page never appears: the copy it would ask about is
;    gone by the time it runs.
;  * Whether the user's data (dock items, settings, chosen icons, user themes in
;    %APPDATA%\MyDockBar) goes too is always asked, and there is no default:
;    the wizard does not move on until one of the two answers is picked.
;  * The Electron build's own "start at login" entry and its Chromium caches
;    are cleared; the settings themselves stay unless the user said otherwise.
;    The new dock re-registers its login item from those settings on start.
;
; Tauri reads this file before its own pages, so the page below comes before
; the welcome page. This file is also read before Tauri defines PRODUCTNAME and
; friends, so names are spelled out (test/build-config.test.js checks them
; against tauri.conf.json), and none of Tauri's ${…} defines or variables are
; used inside a Function - only inside the hook macros, which expand later.
;
; Saved as UTF-8 with a BOM: without it NSIS reads the Korean as ANSI.

!include nsDialogs.nsh

!define MDB_IDENTIFIER "com.suhokwon.mydockbar"
!define MDB_DATA_DIR "MyDockBar"
!define MDB_EXE "MyDockBar.exe"
!define MDB_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyDockBar"
; electron-builder's per-user uninstall key for appId com.suhokwon.mydockbar.
; Its UninstallString is "%LOCALAPPDATA%\Programs\MyDockBar\Uninstall MyDockBar.exe" /currentuser
!define MDB_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\8f4897b2-a7d7-56d0-aad1-f3d80f1bc7f3"
; The Run value Electron's setLoginItemSettings wrote (the AppUserModelId).
!define MDB_ELECTRON_RUN "com.suhokwon.mydockbar"
!define MDB_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"

Var MDB_HasInstall
Var MDB_HasData
Var MDB_PrevDir
Var MDB_KeepRadio
Var MDB_DeleteRadio
Var MDB_DeleteData
Var MDB_Removed

Page custom MDB_PagePrevious MDB_LeavePrevious

; ---------------------------------------------------------------------------
; Detection
; ---------------------------------------------------------------------------
Function MDB_Detect
  StrCpy $MDB_HasInstall 0
  StrCpy $MDB_HasData 0
  StrCpy $MDB_PrevDir ""

  ; This build (Tauri) - quoted path to uninstall.exe.
  ReadRegStr $R0 HKCU "${MDB_UNINSTKEY}" "UninstallString"
  ${If} $R0 != ""
    StrCpy $MDB_HasInstall 1
    ReadRegStr $R1 HKCU "${MDB_UNINSTKEY}" "InstallLocation"
    StrCpy $R2 $R1 1
    ${If} $R2 == '"'
      StrCpy $R1 $R1 -1 1
    ${EndIf}
    StrCpy $MDB_PrevDir $R1
  ${EndIf}

  ; The Electron build.
  ReadRegStr $R0 HKCU "${MDB_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    StrCpy $MDB_HasInstall 1
    ${If} $MDB_PrevDir == ""
      ReadRegStr $R1 HKCU "${MDB_ELECTRON_KEY}" "InstallLocation"
      ${If} $R1 == ""
        StrCpy $R1 "$LOCALAPPDATA\Programs\MyDockBar"
      ${EndIf}
      StrCpy $MDB_PrevDir $R1
    ${EndIf}
  ${EndIf}

  ${If} ${FileExists} "$APPDATA\${MDB_DATA_DIR}\*.*"
    StrCpy $MDB_HasData 1
  ${EndIf}
FunctionEnd

; Updates (/UPDATE) and passive installs (/P) never stop to ask.
Function MDB_IsUnattended
  StrCpy $R9 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    StrCpy $R9 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/P" $R1
  ${IfNot} ${Errors}
    StrCpy $R9 1
  ${EndIf}
  ClearErrors
FunctionEnd

; A custom page inherits the previous page's header; write straight into it.
!macro MDB_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

; ---------------------------------------------------------------------------
; The page: what will happen, and the one question
; ---------------------------------------------------------------------------
Function MDB_PagePrevious
  StrCpy $MDB_DeleteData 0
  Call MDB_Detect
  Call MDB_IsUnattended
  ${If} $R9 = 1
    Abort
  ${EndIf}
  ; Nothing installed and nothing left behind: nothing to ask.
  ${If} $MDB_HasInstall != 1
  ${AndIf} $MDB_HasData != 1
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $MDB_PrevDir != ""
    StrCpy $3 "$MDB_PrevDir"
  ${Else}
    StrCpy $3 "-"
  ${EndIf}

  ; 1042 = Korean
  ${If} $LANGUAGE == 1042
    ${If} $MDB_HasInstall == 1
      !insertmacro MDB_SetHeader "기존 설치 제거" "이미 설치된 MyDockBar 를 지우고 새로 설치합니다."
      ${NSD_CreateLabel} 0 0u 100% 40u "이 컴퓨터에 MyDockBar 가 이미 설치되어 있습니다.$\r$\n설치 위치: $3$\r$\n$\r$\n[다음]을 누르면 기존 프로그램을 삭제한 뒤 이 버전을 새로 설치합니다."
    ${Else}
      !insertmacro MDB_SetHeader "이전 사용자 데이터" "전에 쓰던 MyDockBar 의 데이터가 남아 있습니다."
      ${NSD_CreateLabel} 0 0u 100% 40u "이 컴퓨터에 전에 쓰던 MyDockBar 의 사용자 데이터가 남아 있습니다.$\r$\n위치: $APPDATA\${MDB_DATA_DIR}"
    ${EndIf}
    Pop $0
    ${NSD_CreateLabel} 0 46u 100% 20u "사용자 데이터(독 항목·설정·직접 고른 아이콘·사용자 테마)를 어떻게 할까요? 하나를 골라야 다음으로 넘어갑니다."
    Pop $0
    ${NSD_CreateRadioButton} 10u 72u -10u 12u "사용자 데이터 유지 - 지금까지의 독과 설정을 그대로 이어서 사용"
    Pop $MDB_KeepRadio
    ${NSD_CreateRadioButton} 10u 90u -10u 12u "사용자 데이터 삭제 - 처음 상태로 설치 (되돌릴 수 없습니다)"
    Pop $MDB_DeleteRadio
  ${Else}
    ${If} $MDB_HasInstall == 1
      !insertmacro MDB_SetHeader "Remove Existing Installation" "The installed MyDockBar is removed, then this version installed fresh."
      ${NSD_CreateLabel} 0 0u 100% 40u "MyDockBar is already installed on this computer.$\r$\nLocation: $3$\r$\n$\r$\nWhen you click Next, the installed copy is uninstalled and this version is installed in its place."
    ${Else}
      !insertmacro MDB_SetHeader "Previous User Data" "Data from an earlier MyDockBar is still on this computer."
      ${NSD_CreateLabel} 0 0u 100% 40u "User data from an earlier MyDockBar is still on this computer.$\r$\nLocation: $APPDATA\${MDB_DATA_DIR}"
    ${EndIf}
    Pop $0
    ${NSD_CreateLabel} 0 46u 100% 20u "What should happen to your user data (dock items, settings, chosen icons, your own themes)? Pick one to continue."
    Pop $0
    ${NSD_CreateRadioButton} 10u 72u -10u 12u "Keep my user data - carry on with the same dock and settings"
    Pop $MDB_KeepRadio
    ${NSD_CreateRadioButton} 10u 90u -10u 12u "Delete my user data - start from scratch (cannot be undone)"
    Pop $MDB_DeleteRadio
  ${EndIf}

  ${NSD_AddStyle} $MDB_KeepRadio ${WS_GROUP}
  nsDialogs::Show
FunctionEnd

Function MDB_LeavePrevious
  ${NSD_GetState} $MDB_KeepRadio $0
  ${NSD_GetState} $MDB_DeleteRadio $1
  ${If} $0 != ${BST_CHECKED}
  ${AndIf} $1 != ${BST_CHECKED}
    ${If} $LANGUAGE == 1042
      MessageBox MB_OK|MB_ICONEXCLAMATION "사용자 데이터를 유지할지 삭제할지 골라 주세요."
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please choose whether to keep or delete your user data."
    ${EndIf}
    Abort
  ${EndIf}

  ${If} $1 == ${BST_CHECKED}
    ${If} $LANGUAGE == 1042
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "독 항목, 설정, 직접 고른 아이콘과 사용자 테마를 모두 삭제합니다. 계속할까요?" IDYES mdb_confirmed
    ${Else}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Your dock items, settings, chosen icons and own themes will all be deleted. Continue?" IDYES mdb_confirmed
    ${EndIf}
    Abort
    mdb_confirmed:
    StrCpy $MDB_DeleteData 1
  ${Else}
    StrCpy $MDB_DeleteData 0
  ${EndIf}

  ; Removed here rather than during the install itself, so that Tauri's own
  ; reinstall page, which comes next, finds nothing to ask about.
  Call MDB_RemovePrevious
FunctionEnd

; ---------------------------------------------------------------------------
; Removal
; ---------------------------------------------------------------------------

; "C:\...\file.exe" /switches -> C:\...\file.exe   (in $R5)
Function MDB_Unquote
  StrCpy $R7 $R5 1
  ${If} $R7 == '"'
    StrCpy $R5 $R5 "" 1
    StrCpy $R8 0
    mdb_find_quote:
      StrCpy $R7 $R5 1 $R8
      StrCmp $R7 '"' mdb_quote_found
      StrCmp $R7 "" mdb_quote_found
      IntOp $R8 $R8 + 1
      Goto mdb_find_quote
    mdb_quote_found:
    StrCpy $R5 $R5 $R8
  ${EndIf}
FunctionEnd

Function MDB_RemovePrevious
  ${If} $MDB_Removed == 1
    Return
  ${EndIf}
  StrCpy $MDB_Removed 1
  HideWindow

  ; The dock runs from the tray, so it has to be closed before its files can
  ; go - whichever build it is.
  nsExec::Exec 'taskkill /F /IM "${MDB_EXE}" /T'
  Pop $0
  Sleep 500

  ; The Electron build: its own uninstaller, silently. --updated keeps the
  ; user data, which is decided below and not by it.
  ReadRegStr $R5 HKCU "${MDB_ELECTRON_KEY}" "UninstallString"
  ${If} $R5 != ""
    Call MDB_Unquote
    ${GetParent} $R5 $R6
    DetailPrint "Removing the Electron build of MyDockBar: $R6"
    ${If} ${FileExists} "$R5"
      ExecWait '"$R5" /S /currentuser --updated _?=$R6' $R9
      Delete "$R5"
    ${EndIf}
    RMDir /r "$R6"
    DeleteRegKey HKCU "${MDB_ELECTRON_KEY}"
  ${EndIf}
  DeleteRegValue HKCU "${MDB_RUN_KEY}" "${MDB_ELECTRON_RUN}"

  ; This build: its uninstaller, silently, in place.
  ReadRegStr $R5 HKCU "${MDB_UNINSTKEY}" "UninstallString"
  ${If} $R5 != ""
    Call MDB_Unquote
    ${GetParent} $R5 $R6
    DetailPrint "Removing the installed MyDockBar: $R6"
    ${If} ${FileExists} "$R5"
      ExecWait '"$R5" /S _?=$R6' $R9
      Delete "$R5"
      RMDir "$R6"
    ${EndIf}
    DeleteRegKey HKCU "${MDB_UNINSTKEY}"
  ${EndIf}

  ; Electron's Chromium caches have no reader any more. The settings, chosen
  ; icons and themes beside them are the user's data and stay unless asked.
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Cache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Code Cache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\GPUCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\GrShaderCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\GraphiteDawnCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\DawnGraphiteCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\DawnWebGPUCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\GPUPersistentCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\ShaderCache"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Local Storage"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Session Storage"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Shared Dictionary"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\blob_storage"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Network"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Dictionaries"
  RMDir /r "$APPDATA\${MDB_DATA_DIR}\Crashpad"
  Delete "$APPDATA\${MDB_DATA_DIR}\Local State"
  Delete "$APPDATA\${MDB_DATA_DIR}\Preferences"
  Delete "$APPDATA\${MDB_DATA_DIR}\DevToolsActivePort"
  Delete "$APPDATA\${MDB_DATA_DIR}\DIPS"
  Delete "$APPDATA\${MDB_DATA_DIR}\DIPS-wal"
  Delete "$APPDATA\${MDB_DATA_DIR}\declarative_performance_observer.db"
  Delete "$APPDATA\${MDB_DATA_DIR}\declarative_performance_observer.db-journal"
  Delete "$APPDATA\${MDB_DATA_DIR}\lockfile"

  ${If} $MDB_DeleteData == 1
    RMDir /r "$APPDATA\${MDB_DATA_DIR}"
    RMDir /r "$APPDATA\${MDB_IDENTIFIER}"
    RMDir /r "$LOCALAPPDATA\${MDB_IDENTIFIER}"
  ${EndIf}

  ; The old shortcuts point at a program that is gone; Tauri makes new ones.
  Delete "$DESKTOP\MyDockBar.lnk"
  Delete "$SMPROGRAMS\MyDockBar.lnk"
  BringToFront
FunctionEnd

; ---------------------------------------------------------------------------
; Hooks
; ---------------------------------------------------------------------------
!macro NSIS_HOOK_PREINSTALL
  ; A silent install (/S) never showed the page: remove the old copy anyway,
  ; and - since nobody could be asked - keep the user's data.
  ${If} $UpdateMode <> 1
    Call MDB_RemovePrevious
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; The uninstaller checks for a running copy itself; the tray dock is closed
  ; without asking, the way the Electron uninstaller did.
  nsExec::Exec 'taskkill /F /IM "${MAINBINARYNAME}.exe" /T'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; "Delete app data" in the uninstaller: Tauri only knows the folders named
    ; after the identifier; the dock keeps its data where Electron kept it.
    ${If} $DeleteAppDataCheckboxState = 1
      SetShellVarContext current
      RMDir /r "$APPDATA\${MDB_DATA_DIR}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
