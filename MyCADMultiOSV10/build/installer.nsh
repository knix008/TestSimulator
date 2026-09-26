!include "LogicLib.nsh"

!macro customInit
  ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${EndIf}
  ${If} $R0 != ""
    ExecWait '$R0'
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
    RMDir /r "$INSTDIR"
  ${EndIf}

  StrCpy $R1 "$APPDATA\MyCAD"
  ${If} ${FileExists} "$R1\*.*"
    StrCpy $R2 "Saved data from the installed program was found. Do you want to delete it?"
    ${If} $LANGUAGE == 1042
      StrCpy $R2 "이미 설치한 프로그램에서 저장한 데이터가 있습니다. 삭제하시겠습니까?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION $R2 IDYES deleteUserData IDNO keepUserData
    deleteUserData:
      RMDir /r "$R1"
    keepUserData:
  ${EndIf}
!macroend
