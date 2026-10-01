; Reinstall removes the previous program completely.
; User data (settings, credentials, remote cache) is removed only when the user asks.

!ifndef BUILD_UNINSTALLER
Var CreateDesktopShortcut
Var CreateStartMenuShortcut
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DeleteUserDataCheckbox
Var ShowDataChoice
!endif
Var DeleteUserData
Var MyGitPrevious

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    LangString ShortcutPageTitle ${LANG_KOREAN} "바로 가기"
    LangString ShortcutPageTitle ${LANG_ENGLISH} "Shortcuts"
    LangString ShortcutPageSubtitle ${LANG_KOREAN} "만들 바로 가기를 선택합니다."
    LangString ShortcutPageSubtitle ${LANG_ENGLISH} "Choose which shortcuts to create."
    LangString DesktopShortcutLabel ${LANG_KOREAN} "바탕 화면에 바로 가기 만들기"
    LangString DesktopShortcutLabel ${LANG_ENGLISH} "Create a desktop shortcut"
    LangString StartMenuShortcutLabel ${LANG_KOREAN} "시작 메뉴에 바로 가기 만들기"
    LangString StartMenuShortcutLabel ${LANG_ENGLISH} "Create a Start menu shortcut"
    LangString ReplaceInstallNote ${LANG_KOREAN} "기존 설치를 완전히 삭제한 뒤 다시 설치합니다."
    LangString ReplaceInstallNote ${LANG_ENGLISH} "The existing installation will be removed completely, then MyGit will be installed again."
    LangString DeleteUserDataLabel ${LANG_KOREAN} "사용자 데이터도 삭제"
    LangString DeleteUserDataLabel ${LANG_ENGLISH} "Also delete user data"
    LangString DeleteUserDataHint ${LANG_KOREAN} "설정, 로그인 정보, 원격 저장소 캐시를 삭제합니다. 선택하지 않으면 유지됩니다."
    LangString DeleteUserDataHint ${LANG_ENGLISH} "Removes settings, saved credentials, and the remote repository cache. Leave this unchecked to keep them."
  !endif
  LangString DeleteUserDataQuestion ${LANG_KOREAN} "사용자 데이터(설정, 로그인 정보, 원격 저장소 캐시)도 삭제하시겠습니까?$\r$\n$\r$\n예: 삭제$\r$\n아니오: 유지"
  LangString DeleteUserDataQuestion ${LANG_ENGLISH} "Also delete user data (settings, saved credentials, and the remote repository cache)?$\r$\n$\r$\nYes: delete$\r$\nNo: keep"
!macroend

!macro MyGitRemoveUserData
  RMDir /r "$APPDATA\MyGitJS"
  RMDir /r "$LOCALAPPDATA\MyGitJS"
  RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
  RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
  RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
!macroend

!macro MyGitDetectBody
  ; 2 = a registered installation exists, 1 = only user data remains, 0 = nothing
  StrCpy $MyGitPrevious "0"
  ClearErrors
  ReadRegStr $R8 SHCTX "Software\${APP_GUID}" InstallLocation
  IfErrors mygit_try_hkcu
  StrCmp $R8 "" mygit_try_hkcu mygit_is_install
  mygit_try_hkcu:
  ClearErrors
  ReadRegStr $R8 HKCU "Software\${APP_GUID}" InstallLocation
  IfErrors mygit_try_hklm
  StrCmp $R8 "" mygit_try_hklm mygit_is_install
  mygit_try_hklm:
  ClearErrors
  ReadRegStr $R8 HKLM "Software\${APP_GUID}" InstallLocation
  IfErrors mygit_try_files
  StrCmp $R8 "" mygit_try_files mygit_is_install
  mygit_is_install:
  StrCpy $MyGitPrevious "2"
  Goto mygit_detect_end
  mygit_try_files:
  IfFileExists "$APPDATA\MyGitJS\*.*" mygit_found_data 0
  IfFileExists "$LOCALAPPDATA\MyGitJS\*.*" mygit_found_data 0
  IfFileExists "$APPDATA\${PRODUCT_FILENAME}\*.*" mygit_found_data 0
  IfFileExists "$LOCALAPPDATA\${PRODUCT_FILENAME}\*.*" mygit_found_data 0
  IfFileExists "$APPDATA\${APP_PACKAGE_NAME}\*.*" mygit_found_data mygit_detect_end
  mygit_found_data:
  StrCpy $MyGitPrevious "1"
  mygit_detect_end:
!macroend

!ifndef BUILD_UNINSTALLER
Function MyGitDetectPrevious
  !insertmacro MyGitDetectBody
FunctionEnd
!else
Function un.MyGitDetectPrevious
  !insertmacro MyGitDetectBody
FunctionEnd
!endif

!ifndef BUILD_UNINSTALLER
!macro customInit
  StrCpy $CreateDesktopShortcut ${BST_CHECKED}
  StrCpy $CreateStartMenuShortcut ${BST_CHECKED}
  StrCpy $DeleteUserData ${BST_UNCHECKED}
  StrCpy $ShowDataChoice "0"
!macroend

!macro customPageAfterChangeDir
  Page custom ShortcutPageCreate ShortcutPageLeave

  Function ShortcutPageCreate
    !insertmacro MUI_HEADER_TEXT "$(ShortcutPageTitle)" "$(ShortcutPageSubtitle)"
    Call MyGitDetectPrevious
    StrCpy $ShowDataChoice $MyGitPrevious
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${If} $ShowDataChoice != "0"
      ${If} $ShowDataChoice == "2"
        ${NSD_CreateLabel} 0 0 100% 24u "$(ReplaceInstallNote)"
        Pop $0
        StrCpy $R7 32
      ${Else}
        StrCpy $R7 0
      ${EndIf}

      ${NSD_CreateCheckbox} 0 $R7u 100% 14u "$(DesktopShortcutLabel)"
      Pop $DesktopShortcutCheckbox
      ${NSD_SetState} $DesktopShortcutCheckbox ${BST_CHECKED}

      IntOp $R7 $R7 + 18
      ${NSD_CreateCheckbox} 0 $R7u 100% 14u "$(StartMenuShortcutLabel)"
      Pop $StartMenuShortcutCheckbox
      ${NSD_SetState} $StartMenuShortcutCheckbox ${BST_CHECKED}

      IntOp $R7 $R7 + 26
      ${NSD_CreateCheckbox} 0 $R7u 100% 14u "$(DeleteUserDataLabel)"
      Pop $DeleteUserDataCheckbox
      ${NSD_SetState} $DeleteUserDataCheckbox ${BST_UNCHECKED}

      IntOp $R7 $R7 + 18
      ${NSD_CreateLabel} 16u $R7u 100% 28u "$(DeleteUserDataHint)"
      Pop $0
    ${Else}
      ${NSD_CreateCheckbox} 0 0 100% 14u "$(DesktopShortcutLabel)"
      Pop $DesktopShortcutCheckbox
      ${NSD_SetState} $DesktopShortcutCheckbox ${BST_CHECKED}

      ${NSD_CreateCheckbox} 0 24u 100% 14u "$(StartMenuShortcutLabel)"
      Pop $StartMenuShortcutCheckbox
      ${NSD_SetState} $StartMenuShortcutCheckbox ${BST_CHECKED}
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function ShortcutPageLeave
    ${NSD_GetState} $DesktopShortcutCheckbox $CreateDesktopShortcut
    ${NSD_GetState} $StartMenuShortcutCheckbox $CreateStartMenuShortcut
    ${If} $ShowDataChoice != "0"
      ${NSD_GetState} $DeleteUserDataCheckbox $DeleteUserData
    ${Else}
      StrCpy $DeleteUserData ${BST_UNCHECKED}
    ${EndIf}
  FunctionEnd
!macroend

!macro customInstall
  ${If} $CreateDesktopShortcut == ${BST_UNCHECKED}
    Delete "$newDesktopLink"
  ${EndIf}
  ${If} $CreateStartMenuShortcut == ${BST_UNCHECKED}
    Delete "$newStartMenuLink"
    StrCpy $launchLink "$appExe"
  ${EndIf}
  ${If} $DeleteUserData == ${BST_CHECKED}
  ${OrIf} ${isDeleteAppData}
    !insertmacro MyGitRemoveUserData
  ${EndIf}
!macroend
!endif

!macro customUnInit
  StrCpy $DeleteUserData ${BST_UNCHECKED}
  ${IfNot} ${Silent}
    Call un.MyGitDetectPrevious
    ${If} $MyGitPrevious != "0"
      MessageBox MB_YESNO|MB_ICONQUESTION "$(DeleteUserDataQuestion)" /SD IDNO IDYES mygit_delete_data IDNO mygit_keep_data
      mygit_delete_data:
        StrCpy $DeleteUserData ${BST_CHECKED}
        Goto mygit_data_choice_done
      mygit_keep_data:
        StrCpy $DeleteUserData ${BST_UNCHECKED}
      mygit_data_choice_done:
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ${If} $DeleteUserData == ${BST_CHECKED}
  ${OrIf} ${isDeleteAppData}
    !insertmacro MyGitRemoveUserData
  ${EndIf}
!macroend
