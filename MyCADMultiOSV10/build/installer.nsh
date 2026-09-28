!include "LogicLib.nsh"
!include "installer-associations.nsh"

!macro customInit
  ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${EndIf}
  ; An installed copy is never removed behind the user's back: they decide.
  ${If} $R0 != ""
    StrCpy $R3 "MyCAD is already installed. Remove it before installing this version?$\r$\n$\r$\nChoose No to install over it."
    ${If} $LANGUAGE == 1042
      StrCpy $R3 "MyCAD 가 이미 설치되어 있습니다. 이번 설치 전에 제거할까요?$\r$\n$\r$\n아니요를 누르면 기존 설치 위에 덮어씁니다."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION $R3 IDYES removeOld IDNO keepOld
    removeOld:
      ExecWait '$R0'
      DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
      RMDir /r "$INSTDIR"
    keepOld:
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

  ; Start the association page with the recommended selection.
  !insertmacro MyCadAssocDefaults
!macroend

; An extra wizard page: the user ticks the file types MyCAD should own.
!macro customPageAfterChangeDir
  Page custom MyCadAssocPageShow MyCadAssocPageLeaveFn
!macroend

; The wizard page belongs to the installer; the uninstaller pass compiles this
; same script and has neither the dialog nor MUI2 loaded.
!ifndef BUILD_UNINSTALLER
Function MyCadAssocPageShow
  !insertmacro MyCadAssocPageCreate
FunctionEnd

Function MyCadAssocPageLeaveFn
  !insertmacro MyCadAssocPageLeave
FunctionEnd

; The two buttons on the page: tick everything, or clear everything.
Function MyCadAssocSelectAll
  Pop $0
  !insertmacro MyCadAssocCheckAll
FunctionEnd

Function MyCadAssocSelectNone
  Pop $0
  !insertmacro MyCadAssocUncheckAll
FunctionEnd
!endif

!macro customInstall
  !insertmacro MyCadWriteAssociations
!macroend

!macro customUnInstall
  !insertmacro MyCadDeleteAssociations
!macroend
