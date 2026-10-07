; Tauri includes this file before it defines PRODUCTNAME, BUNDLEID, UNINSTKEY and MAINBINARYNAME,
; so the page function below spells them out. Keep them in step with tauri.conf.json and Cargo.toml
; (test/installer.test.ts checks this).
!define MC_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Calendar"
!define MC_BUNDLEID "com.mycalendar.multios"
!define MC_MAINBINARY "my-calendar.exe"

; Runs before the welcome page: an existing install is removed completely before anything else,
; so Tauri's own reinstall page never appears. Tauri's updater (/UPDATE) keeps its in-place path.
Page custom MC_PageRemovePrevious

Function MC_PageRemovePrevious
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ReadRegStr $R2 SHCTX "${MC_UNINSTKEY}" "UninstallString"
  ${If} $R2 == ""
    Abort
  ${EndIf}

  ; Passive installs (/P) cannot ask, so they keep the user's data.
  StrCpy $R6 0
  ClearErrors
  ${GetOptions} $R0 "/P" $R1
  ${IfNot} ${Errors}
    Goto mc_remove
  ${EndIf}
  ReadRegStr $R5 SHCTX "${MC_UNINSTKEY}" "DisplayVersion"
  ${If} $LANGUAGE = 1042
    StrCpy $R7 "이미 설치된 My Calendar $R5 버전을 찾았습니다.$\r$\n$\r$\n설치를 계속하면 기존 프로그램을 완전히 삭제한 뒤 새로 설치합니다.$\r$\n$\r$\n일정과 설정 같은 사용자 데이터도 삭제할까요?$\r$\n$\r$\n예: 사용자 데이터까지 삭제합니다.$\r$\n아니요: 사용자 데이터는 남겨 둡니다.$\r$\n취소: 설치를 그만둡니다."
  ${Else}
    StrCpy $R7 "My Calendar $R5 is already installed.$\r$\n$\r$\nTo continue, the installed program will be removed completely and installed again.$\r$\n$\r$\nDo you also want to delete your user data, such as events and settings?$\r$\n$\r$\nYes: delete the user data too.$\r$\nNo: keep the user data.$\r$\nCancel: stop the installation."
  ${EndIf}
  MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON2 $R7 IDYES mc_delete_data IDNO mc_remove
  Quit
  mc_delete_data:
    StrCpy $R6 1
  mc_remove:
  Call MC_UninstallPrevious
  ${If} ${Errors}
    ${If} $LANGUAGE = 1042
      MessageBox MB_ICONEXCLAMATION "기존 My Calendar를 삭제하지 못했습니다. 프로그램을 종료한 뒤 다시 설치해 주세요."
    ${Else}
      MessageBox MB_ICONEXCLAMATION "The installed My Calendar could not be removed. Close the program and run the installer again."
    ${EndIf}
    Quit
  ${EndIf}
  Abort
FunctionEnd

; Runs the installed uninstaller silently (it closes the app first), then removes what it leaves behind.
; $R6 = 1 also deletes the user data. Sets the error flag when the old program is still there.
Function MC_UninstallPrevious
  ReadRegStr $R2 SHCTX "${MC_UNINSTKEY}" "UninstallString"
  ${If} $R2 == ""
    ClearErrors
    Return
  ${EndIf}
  StrCpy $R3 $R2 1
  ${If} $R3 == '"'
    StrCpy $R2 $R2 -1 1
  ${EndIf}
  ${GetParent} $R2 $R3
  ClearErrors
  ExecWait '"$R2" /S _?=$R3' $R4
  ${If} ${Errors}
  ${OrIf} $R4 <> 0
  ${OrIf} ${FileExists} "$R3\${MC_MAINBINARY}"
    SetErrors
    Return
  ${EndIf}
  ; Run in place (_?=), the uninstaller cannot delete itself or its folder.
  Delete "$R3\uninstall.exe"
  Delete "$R3\install-language.txt"
  RMDir "$R3"
  ${If} $R6 = 1
    SetShellVarContext current
    RMDir /r "$APPDATA\${MC_BUNDLEID}"
    RMDir /r "$LOCALAPPDATA\${MC_BUNDLEID}"
  ${EndIf}
  ClearErrors
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Silent installs (/S) show no pages, so the previous install is removed here, keeping user data.
  ${If} ${Silent}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/UPDATE" $R1
    ${If} ${Errors}
      StrCpy $R6 0
      Call MC_UninstallPrevious
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 1042 is Korean. The language selector writes the choice next to the app.
  FileOpen $0 "$INSTDIR\install-language.txt" w
  ${If} $LANGUAGE = 1042
    FileWrite $0 "ko$\r$\n"
  ${Else}
    FileWrite $0 "en$\r$\n"
  ${EndIf}
  FileClose $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The installer writes this file, so Tauri's uninstaller does not know to remove it.
  Delete "$INSTDIR\install-language.txt"
  RMDir "$INSTDIR"
!macroend
