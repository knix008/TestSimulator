; MyMoney reinstall policy. Mirrors installer/plan.js.
; 1. The user chooses English or Korean (displayLanguageSelector) before this macro runs.
; 2. If a previous install exists, remove the program, its shortcuts, and its folder, then install again.
; 3. If saved user data exists, ask whether to delete it.
; 4. Desktop and Start menu shortcuts are checkboxes. Both use resources\icon.ico,
;    which is assets/icon.ico, the same file as the program and installer icon.
; electron-builder's own shortcut creation is turned off so these checkboxes are the only source.

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutState
Var StartMenuShortcutState
Var DesktopCheckbox
Var StartMenuCheckbox
!endif

!macro customHeader
  !ifndef BUILD_UNINSTALLER
  Function mymoneyShortcutsCreate
    nsDialogs::Create 1018
    Pop $R7
    ${If} $R7 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "Choose shortcuts. They use the MyMoney program icon.$\n바로가기를 선택하세요. 프로그램 아이콘과 같은 파일을 사용합니다."
    Pop $0
    ${NSD_CreateCheckbox} 0 28u 100% 12u "Create a desktop shortcut / 바탕화면 바로가기 만들기"
    Pop $DesktopCheckbox
    ${NSD_SetState} $DesktopCheckbox $DesktopShortcutState
    ${NSD_CreateCheckbox} 0 44u 100% 12u "Create a Start menu shortcut / 시작 메뉴 바로가기 만들기"
    Pop $StartMenuCheckbox
    ${NSD_SetState} $StartMenuCheckbox $StartMenuShortcutState
    nsDialogs::Show
  FunctionEnd

  Function mymoneyShortcutsLeave
    ${NSD_GetState} $DesktopCheckbox $DesktopShortcutState
    ${NSD_GetState} $StartMenuCheckbox $StartMenuShortcutState
  FunctionEnd
  !endif
!macroend

!macro customPageAfterChangeDir
  Page custom mymoneyShortcutsCreate mymoneyShortcutsLeave
!macroend

!macro customInit
  StrCpy $DesktopShortcutState ${BST_CHECKED}
  StrCpy $StartMenuShortcutState ${BST_CHECKED}
  IfFileExists "$APPDATA\MyMoney\settings.json" 0 mymoney_no_data
    MessageBox MB_YESNO|MB_ICONQUESTION "Saved data from the previous installation was found. Do you want to delete it?$\n이전에 설치한 프로그램의 저장 데이터가 있습니다. 삭제하시겠습니까?" /SD IDNO IDYES mymoney_delete_data IDNO mymoney_no_data
  mymoney_delete_data:
    RMDir /r "$APPDATA\MyMoney"
  mymoney_no_data:
  StrCpy $R9 "0"
  ${if} ${isUpdated}
    StrCpy $R9 "1"
  ${endIf}
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 +2
    StrCpy $R9 "1"
  ${if} $R9 == "1"
    DetailPrint "An existing installation was found. It will be removed completely and installed again."
    DetailPrint "이미 설치된 프로그램이 있습니다. 완전히 삭제한 뒤 다시 설치합니다."
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    ReadRegStr $R0 SHCTX "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${if} $R0 != ""
      ExecWait '$R0 /S' $1
    ${endIf}
    IfFileExists "$INSTDIR\${UNINSTALL_FILENAME}" 0 mymoney_remove_dir
      ExecWait '"$INSTDIR\${UNINSTALL_FILENAME}" /S _?=$INSTDIR'
    mymoney_remove_dir:
    RMDir /r "$INSTDIR"
    CreateDirectory "$INSTDIR"
  ${endIf}
!macroend

!macro customInstall
  StrCpy $R8 "$INSTDIR\resources\icon.ico"
  IfFileExists "$R8" mymoney_have_icon
    StrCpy $R8 "$appExe"
  mymoney_have_icon:
  ${if} $DesktopShortcutState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$R8" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${endIf}
  ${if} $StartMenuShortcutState == ${BST_CHECKED}
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$appExe" "" "$R8" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${endIf}
  DetailPrint "Register application icon assets/icon.ico and document icon assets/file.ico for .mymoney"
!macroend

!macro customUnInstall
  ; Shortcuts are removed with the program. User data stays unless the installer already deleted it.
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
!macroend
