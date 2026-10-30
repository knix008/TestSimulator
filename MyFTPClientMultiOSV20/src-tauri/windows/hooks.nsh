; My FTP Client — install policy for Tauri's NSIS installer.
;
;  1. The user chooses Korean or English (displayLanguageSelector) before any page.
;  2. An existing installation — the Electron build or an earlier Tauri one — is
;     detected first. The user is asked whether to remove it and install fresh
;     ([Yes]) or to cancel the setup ([No]). A running copy is closed first.
;  3. Data an earlier installation left behind (connection profiles, history,
;     session) is kept unless the user says to delete it. Silent installs keep it.
;  4. Desktop and Start menu shortcuts are two checkboxes on their own page.
;
; Tauri includes this file before it defines PRODUCTNAME, UNINSTKEY and its own
; variables, so the names are spelled out here; Tauri's variables are used only
; inside the hook macros. test/ui.test.mjs checks them against tauri.conf.json.

!define /IfNDef MUI_LANGDLL_ALLLANGUAGES
!define /IfNDef MUI_LANGDLL_ALWAYSSHOW

!include nsDialogs.nsh

!define MFC_PRODUCT "My FTP Client"
!define MFC_EXE "MyFTPClient.exe"
!define MFC_IDENTIFIER "com.shkwon.myftpclient"
!define MFC_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\My FTP Client"
; electron-builder's key for appId com.shkwon.myftpclient (UUID v5 of the appId).
; Its UninstallString runs "Uninstall MyFTPClient.exe" /currentuser.
!define MFC_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\98cf3d3c-96a5-5b6e-953c-dbfa86aff896"

Var MFC_DeleteData
Var MFC_ShortcutsChosen
Var MFC_DesktopState
Var MFC_StartMenuState
Var MFC_DesktopBox
Var MFC_StartMenuBox

; Both run before the welcome page. The first has no page of its own: it asks
; with message boxes and then skips itself.
Page custom MFC_PageRemovePrevious
Page custom MFC_PageShortcuts MFC_LeaveShortcuts

Function MFC_PageRemovePrevious
  StrCpy $MFC_DeleteData 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ReadRegStr $R2 HKCU "${MFC_ELECTRON_KEY}" "UninstallString"
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "${MFC_ELECTRON_KEY}" "UninstallString"
  ${EndIf}
  ReadRegStr $R3 SHCTX "${MFC_UNINSTKEY}" "UninstallString"
  ${If} $R2 == ""
  ${AndIf} $R3 == ""
    Goto mfc_ask_data
  ${EndIf}
  ReadRegStr $R4 HKCU "${MFC_ELECTRON_KEY}" "InstallLocation"
  ${If} $R4 == ""
    ReadRegStr $R4 SHCTX "${MFC_UNINSTKEY}" "InstallLocation"
  ${EndIf}
  ${If} $R4 == ""
    ${If} $LANGUAGE = 1042
      StrCpy $R4 "(알 수 없음)"
    ${Else}
      StrCpy $R4 "(unknown)"
    ${EndIf}
  ${EndIf}
  ${If} $LANGUAGE = 1042
    MessageBox MB_YESNO|MB_ICONQUESTION "${MFC_PRODUCT} 이(가) 이미 설치되어 있습니다.$\r$\n$\r$\n설치 위치: $R4$\r$\n$\r$\n기존 설치를 삭제한 뒤 새로 설치할까요?$\r$\n[예] 기존 버전 삭제 후 설치     [아니요] 설치 취소" /SD IDYES IDYES mfc_ask_data
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION "${MFC_PRODUCT} is already installed.$\r$\n$\r$\nLocation: $R4$\r$\n$\r$\nRemove the existing installation and install this version?$\r$\n[Yes] remove and install     [No] cancel the setup" /SD IDYES IDYES mfc_ask_data
  ${EndIf}
  Quit
  mfc_ask_data:
  StrCpy $R5 0
  ${If} ${FileExists} "$APPDATA\${MFC_PRODUCT}\session.json"
  ${OrIf} ${FileExists} "$APPDATA\${MFC_PRODUCT}\profiles.json"
    StrCpy $R5 1
  ${EndIf}
  ${If} $R5 = 1
    ${If} $LANGUAGE = 1042
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "이전에 설치된 ${MFC_PRODUCT} 의 데이터가 남아 있습니다.$\r$\n(접속 프로파일, 접속 기록, 마지막 로컬 폴더, 테마·언어 설정, 창 위치)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다." /SD IDNO IDNO mfc_remove
    ${Else}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Data from a previous ${MFC_PRODUCT} installation is still on this PC.$\r$\n(connection profiles, history, last local folder, theme/language settings, window position)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over." /SD IDNO IDNO mfc_remove
    ${EndIf}
    StrCpy $MFC_DeleteData 1
  ${EndIf}
  mfc_remove:
  Call MFC_RemovePrevious
  ${If} ${Errors}
    ${If} $LANGUAGE = 1042
      MessageBox MB_ICONEXCLAMATION "기존 ${MFC_PRODUCT} 를 삭제하지 못했습니다. 프로그램을 종료한 뒤 다시 설치해 주세요."
    ${Else}
      MessageBox MB_ICONEXCLAMATION "The installed ${MFC_PRODUCT} could not be removed. Close it and run the installer again."
    ${EndIf}
    Quit
  ${EndIf}
  Abort
FunctionEnd

; Runs an uninstaller in place and waits for it. $R5 = uninstall string, $R6 = extra arguments.
; Sets the error flag when the folder still holds the program afterwards.
Function MFC_RunUninstaller
  StrCpy $R7 $R5 1
  ${If} $R7 == '"'
    StrCpy $R5 $R5 "" 1
    ${StrLoc} $R7 $R5 '"' ">"
    StrCpy $R5 $R5 $R7
  ${EndIf}
  ${GetParent} $R5 $R8
  ClearErrors
  ; _?= runs the uninstaller in place, so ExecWait really waits for it.
  ExecWait '"$R5" /S $R6 _?=$R8' $R9
  ClearErrors
  Delete "$R5"
  RMDir /r "$R8"
  ${If} ${FileExists} "$R8\*.exe"
    SetErrors
  ${EndIf}
FunctionEnd

; Removes the Electron build and any earlier Tauri install and their shortcuts.
; $MFC_DeleteData = 1 also deletes the saved data; otherwise only Electron's browser caches go.
Function MFC_RemovePrevious
  ClearErrors
  ; Close a running copy so its files can be removed.
  nsExec::ExecToLog 'taskkill /F /IM "${MFC_EXE}" /T'
  Sleep 500
  ReadRegStr $R5 HKCU "${MFC_ELECTRON_KEY}" "UninstallString"
  ${If} $R5 != ""
    ; --updated keeps the data; this installer decides about it.
    StrCpy $R6 "/currentuser --updated"
    Call MFC_RunUninstaller
    ${If} ${Errors}
      Return
    ${EndIf}
    DeleteRegKey HKCU "${MFC_ELECTRON_KEY}"
  ${EndIf}
  ReadRegStr $R5 SHCTX "${MFC_UNINSTKEY}" "UninstallString"
  ${If} $R5 != ""
    StrCpy $R6 ""
    Call MFC_RunUninstaller
    ${If} ${Errors}
      Return
    ${EndIf}
  ${EndIf}
  Delete "$DESKTOP\${MFC_PRODUCT}.lnk"
  Delete "$SMPROGRAMS\${MFC_PRODUCT}.lnk"
  ${If} $MFC_DeleteData = 1
    RMDir /r "$APPDATA\${MFC_PRODUCT}"
    RMDir /r "$LOCALAPPDATA\${MFC_PRODUCT}"
    RMDir /r "$LOCALAPPDATA\${MFC_IDENTIFIER}"
  ${Else}
    ; Chromium caches the Electron build kept beside session.json. Nothing reads them now.
    RMDir /r "$APPDATA\${MFC_PRODUCT}\Cache"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\Code Cache"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\GPUCache"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\DawnGraphiteCache"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\DawnWebGPUCache"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\Local Storage"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\Network"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\Session Storage"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\Shared Dictionary"
    RMDir /r "$APPDATA\${MFC_PRODUCT}\blob_storage"
    Delete "$APPDATA\${MFC_PRODUCT}\Local State"
    Delete "$APPDATA\${MFC_PRODUCT}\Preferences"
    Delete "$APPDATA\${MFC_PRODUCT}\lockfile"
  ${EndIf}
  ClearErrors
FunctionEnd

Function MFC_PageShortcuts
  ${If} $MFC_ShortcutsChosen != 1
    StrCpy $MFC_DesktopState ${BST_CHECKED}
    StrCpy $MFC_StartMenuState ${BST_CHECKED}
  ${EndIf}
  nsDialogs::Create 1018
  Pop $R0
  ${If} $R0 == error
    Abort
  ${EndIf}
  ${If} $LANGUAGE = 1042
    ${NSD_CreateLabel} 0 0 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $R0
    ${NSD_CreateCheckbox} 0 30u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $MFC_DesktopBox
    ${NSD_CreateCheckbox} 0 46u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $MFC_StartMenuBox
    ${NSD_CreateLabel} 0 72u 100% 40u "My FTP Client 는 FTP · FTPS · SFTP 서버에 접속해 파일을 올리고 내려받는 클라이언트입니다. 서버 목록과 로컬 폴더 트리, 전송 진행률, 접속 프로파일, 터미널을 지원합니다."
    Pop $R0
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 24u "Choose the shortcuts to create after installation."
    Pop $R0
    ${NSD_CreateCheckbox} 0 30u 100% 12u "Create a desktop shortcut"
    Pop $MFC_DesktopBox
    ${NSD_CreateCheckbox} 0 46u 100% 12u "Create a Start menu shortcut"
    Pop $MFC_StartMenuBox
    ${NSD_CreateLabel} 0 72u 100% 40u "My FTP Client connects to FTP, FTPS and SFTP servers to upload and download files: server listing, local folder tree, transfer progress, connection profiles and a terminal."
    Pop $R0
  ${EndIf}
  ${NSD_SetState} $MFC_DesktopBox $MFC_DesktopState
  ${NSD_SetState} $MFC_StartMenuBox $MFC_StartMenuState
  nsDialogs::Show
FunctionEnd

Function MFC_LeaveShortcuts
  ${NSD_GetState} $MFC_DesktopBox $MFC_DesktopState
  ${NSD_GetState} $MFC_StartMenuBox $MFC_StartMenuState
  StrCpy $MFC_ShortcutsChosen 1
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs (/S) show no pages, so the previous install is removed here, keeping data.
  ${If} ${Silent}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/UPDATE" $R1
    ${If} ${Errors}
      StrCpy $MFC_DeleteData 0
      Call MFC_RemovePrevious
    ${EndIf}
  ${EndIf}
  ; The shortcut page decided, so Tauri's own shortcuts (Start menu, finish page) stay off.
  ${If} $MFC_ShortcutsChosen = 1
    StrCpy $NoShortcutMode 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MFC_ShortcutsChosen = 1
    ${If} $MFC_DesktopState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${MFC_PRODUCT}.lnk" "$INSTDIR\${MFC_EXE}" "" "$INSTDIR\${MFC_EXE}" 0
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${MFC_PRODUCT}.lnk"
    ${EndIf}
    ${If} $MFC_StartMenuState == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\${MFC_PRODUCT}.lnk" "$INSTDIR\${MFC_EXE}" "" "$INSTDIR\${MFC_EXE}" 0
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${MFC_PRODUCT}.lnk"
    ${EndIf}
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; User data stays unless the installer was told to delete it.
  Delete "$DESKTOP\${MFC_PRODUCT}.lnk"
  Delete "$SMPROGRAMS\${MFC_PRODUCT}.lnk"
!macroend
