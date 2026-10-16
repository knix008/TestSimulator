; MyWeather install policy for Tauri's NSIS installer. Mirrors installer/plan.js.
; 1. The user chooses English or Korean (displayLanguageSelector) before any page.
; 2. A previous install, the Electron build or an earlier Tauri one, is removed completely
;    before the new copy is written. Saved data is deleted only when the user says so.
; 3. Desktop and Start menu shortcuts are two checkboxes. Both use $INSTDIR\icon.ico,
;    which is assets/icon.ico, the same file as the program and installer icon.
; 4. .myweather documents get their own icon, $INSTDIR\file.ico (assets/file.ico).
;
; Tauri includes this file before it defines PRODUCTNAME, UNINSTKEY and its own variables,
; so the names below are spelled out. test/suites/logic.js checks them against tauri.conf.json.

!include nsDialogs.nsh

!define MW_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyWeather"
; electron-builder's per-user key for appId com.shkwon.myweather (MyWeather 1.0.0, Electron).
; Its UninstallString runs "Uninstall MyWeather.exe" /currentuser from %LOCALAPPDATA%\Programs\MyWeather.
!define MW_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\8f6dd25c-f028-57b0-89e8-f6758dc44657"
!define MW_IDENTIFIER "com.shkwon.myweather"
!define MW_FILECLASS "MyWeather Document"

Var MW_DeleteData
Var MW_ShortcutsChosen
Var MW_DesktopState
Var MW_StartMenuState
Var MW_DesktopBox
Var MW_StartMenuBox

; Both run before the welcome page. The first one has no page of its own: it asks with
; message boxes and then skips itself.
Page custom MW_PageRemovePrevious
Page custom MW_PageShortcuts MW_LeaveShortcuts

Function MW_PageRemovePrevious
  StrCpy $MW_DeleteData 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ReadRegStr $R2 HKCU "${MW_ELECTRON_KEY}" "UninstallString"
  ReadRegStr $R3 SHCTX "${MW_UNINSTKEY}" "UninstallString"
  StrCpy $R4 0
  ${If} $R2 != ""
  ${OrIf} $R3 != ""
    StrCpy $R4 1
  ${EndIf}
  ${If} $R4 = 1
    ${If} $LANGUAGE = 1042
      MessageBox MB_OKCANCEL|MB_ICONINFORMATION "이미 설치된 프로그램이 있습니다. 완전히 삭제한 뒤 다시 설치합니다." IDOK mw_ask_data
    ${Else}
      MessageBox MB_OKCANCEL|MB_ICONINFORMATION "An existing installation was found. It will be removed completely and installed again." IDOK mw_ask_data
    ${EndIf}
    Quit
  ${EndIf}
  mw_ask_data:
  IfFileExists "$APPDATA\MyWeather\settings.json" 0 mw_remove
    ${If} $LANGUAGE = 1042
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "이전에 설치한 프로그램의 저장 데이터가 있습니다. 삭제하시겠습니까?" IDNO mw_remove
    ${Else}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Saved data from the previous installation was found. Do you want to delete it?" IDNO mw_remove
    ${EndIf}
    StrCpy $MW_DeleteData 1
  mw_remove:
  Call MW_RemovePrevious
  ${If} ${Errors}
    ${If} $LANGUAGE = 1042
      MessageBox MB_ICONEXCLAMATION "기존 MyWeather를 삭제하지 못했습니다. 프로그램을 종료한 뒤 다시 설치해 주세요."
    ${Else}
      MessageBox MB_ICONEXCLAMATION "The installed MyWeather could not be removed. Close it and run the installer again."
    ${EndIf}
    Quit
  ${EndIf}
  Abort
FunctionEnd

; Runs an uninstaller in place and waits for it. $R5 = uninstall string, $R6 = extra arguments.
; Sets the error flag when the folder still holds the program afterwards.
Function MW_RunUninstaller
  StrCpy $R7 $R5 1
  ${If} $R7 == '"'
    StrCpy $R5 $R5 "" 1
    ${StrLoc} $R7 $R5 '"' ">"
    StrCpy $R5 $R5 $R7
  ${EndIf}
  ${GetParent} $R5 $R8
  ClearErrors
  ExecWait '"$R5" /S $R6 _?=$R8' $R9
  ClearErrors
  Delete "$R5"
  RMDir /r "$R8"
  ${If} ${FileExists} "$R8\*.exe"
    SetErrors
  ${EndIf}
FunctionEnd

; Removes the Electron build and any earlier Tauri install, their shortcuts and login entry.
; $MW_DeleteData = 1 also deletes the saved data; otherwise only Electron's browser caches go.
Function MW_RemovePrevious
  ClearErrors
  ReadRegStr $R5 HKCU "${MW_ELECTRON_KEY}" "UninstallString"
  ${If} $R5 != ""
    StrCpy $R6 "/currentuser"
    Call MW_RunUninstaller
    ${If} ${Errors}
      Return
    ${EndIf}
    DeleteRegKey HKCU "${MW_ELECTRON_KEY}"
    ; The Electron copy wrote its own login entry; the new copy writes it again if asked to.
    ReadRegStr $R7 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MyWeather"
    ${StrLoc} $R9 $R7 "Programs\MyWeather\MyWeather.exe" ">"
    ${If} $R9 != ""
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MyWeather"
    ${EndIf}
  ${EndIf}
  ReadRegStr $R5 SHCTX "${MW_UNINSTKEY}" "UninstallString"
  ${If} $R5 != ""
    StrCpy $R6 ""
    Call MW_RunUninstaller
    ${If} ${Errors}
      Return
    ${EndIf}
  ${EndIf}
  Delete "$DESKTOP\MyWeather.lnk"
  Delete "$SMPROGRAMS\MyWeather.lnk"
  ${If} $MW_DeleteData = 1
    RMDir /r "$APPDATA\MyWeather"
    RMDir /r "$LOCALAPPDATA\${MW_IDENTIFIER}"
  ${Else}
    ; Chromium caches the Electron build kept beside settings.json. Nothing reads them now.
    RMDir /r "$APPDATA\MyWeather\Cache"
    RMDir /r "$APPDATA\MyWeather\Code Cache"
    RMDir /r "$APPDATA\MyWeather\GPUCache"
    RMDir /r "$APPDATA\MyWeather\DawnGraphiteCache"
    RMDir /r "$APPDATA\MyWeather\DawnWebGPUCache"
    RMDir /r "$APPDATA\MyWeather\Dictionaries"
    RMDir /r "$APPDATA\MyWeather\Local Storage"
    RMDir /r "$APPDATA\MyWeather\Network"
    RMDir /r "$APPDATA\MyWeather\Session Storage"
    RMDir /r "$APPDATA\MyWeather\Shared Dictionary"
    RMDir /r "$APPDATA\MyWeather\blob_storage"
    Delete "$APPDATA\MyWeather\SharedStorage"
    Delete "$APPDATA\MyWeather\SharedStorage-wal"
    Delete "$APPDATA\MyWeather\Local State"
    Delete "$APPDATA\MyWeather\Preferences"
    Delete "$APPDATA\MyWeather\lockfile"
  ${EndIf}
  ClearErrors
FunctionEnd

Function MW_PageShortcuts
  ${If} $MW_ShortcutsChosen != 1
    StrCpy $MW_DesktopState ${BST_CHECKED}
    StrCpy $MW_StartMenuState ${BST_CHECKED}
  ${EndIf}
  nsDialogs::Create 1018
  Pop $R0
  ${If} $R0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Choose shortcuts. They use the MyWeather program icon.$\n바로가기를 선택하세요. 프로그램 아이콘과 같은 파일을 사용합니다."
  Pop $R0
  ${NSD_CreateCheckbox} 0 30u 100% 12u "Create a desktop shortcut / 바탕화면 바로가기 만들기"
  Pop $MW_DesktopBox
  ${NSD_SetState} $MW_DesktopBox $MW_DesktopState
  ${NSD_CreateCheckbox} 0 46u 100% 12u "Create a Start menu shortcut / 시작 메뉴 바로가기 만들기"
  Pop $MW_StartMenuBox
  ${NSD_SetState} $MW_StartMenuBox $MW_StartMenuState
  nsDialogs::Show
FunctionEnd

Function MW_LeaveShortcuts
  ${NSD_GetState} $MW_DesktopBox $MW_DesktopState
  ${NSD_GetState} $MW_StartMenuBox $MW_StartMenuState
  StrCpy $MW_ShortcutsChosen 1
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs (/S) show no pages, so the previous install is removed here, keeping data.
  ${If} ${Silent}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/UPDATE" $R1
    ${If} ${Errors}
      StrCpy $MW_DeleteData 0
      Call MW_RemovePrevious
    ${EndIf}
  ${EndIf}
  ; The shortcut page decided, so Tauri's own shortcuts (Start menu, finish page) stay off.
  ${If} $MW_ShortcutsChosen = 1
    StrCpy $NoShortcutMode 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MW_ShortcutsChosen = 1
    ${If} $MW_DesktopState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\MyWeather.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\icon.ico" 0
      !insertmacro SetLnkAppUserModelId "$DESKTOP\MyWeather.lnk"
    ${EndIf}
    ${If} $MW_StartMenuState == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\MyWeather.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\icon.ico" 0
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\MyWeather.lnk"
    ${EndIf}
  ${EndIf}
  ; Documents keep their own icon instead of the program's.
  WriteRegStr SHCTX "Software\Classes\${MW_FILECLASS}\DefaultIcon" "" "$INSTDIR\file.ico,0"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; User data stays unless the installer was told to delete it.
  Delete "$DESKTOP\MyWeather.lnk"
  Delete "$SMPROGRAMS\MyWeather.lnk"
!macroend
