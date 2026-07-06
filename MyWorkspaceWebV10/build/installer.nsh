!include LogicLib.nsh

Var MyWorkspaceDeleteUserData

; NSIS language IDs (must match electron-builder installerLanguages)
!define MYW_LANG_KOREAN 1042
!define MYW_LANG_ENGLISH 1033

LangString myWorkspaceDataPrompt ${MYW_LANG_KOREAN} "기존 MyWorkspace 사용자 데이터(Workspace, 설정, DB)가 있습니다.$\r$\n$\r$\n설치를 계속하기 전에 이 데이터를 삭제하시겠습니까?"
LangString myWorkspaceDataPrompt ${MYW_LANG_ENGLISH} "Existing MyWorkspace user data (workspaces, settings, database) was found.$\r$\n$\r$\nDo you want to delete this data before continuing installation?"
LangString myWorkspaceUninstallDataPrompt ${MYW_LANG_KOREAN} "MyWorkspace 사용자 데이터(Workspace, 설정, DB)를 삭제하시겠습니까?"
LangString myWorkspaceUninstallDataPrompt ${MYW_LANG_ENGLISH} "Do you want to delete MyWorkspace user data (workspaces, settings, database)?"

!macro RemoveMyWorkspaceUserData
  SetShellVarContext current
  RMDir /r "$APPDATA\MyWorkspace\MyWorkspaceWebV10"
  RMDir /r "$APPDATA\MyWorkspace"
  RMDir /r "$APPDATA\myworkspace-web-v10"
!macroend

!macro MyWorkspaceUserDataExistsInline
  StrCpy $0 "0"
  SetShellVarContext current

  IfFileExists "$APPDATA\MyWorkspace\MyWorkspaceWebV10\myworkspace.db" 0 +2
    StrCpy $0 "1"

  ${If} $0 == "0"
    IfFileExists "$APPDATA\MyWorkspace\MyWorkspaceWebV10\appsettings.local.json" 0 +2
      StrCpy $0 "1"
  ${EndIf}

  ${If} $0 == "0"
    ClearErrors
    FindFirst $1 $R9 "$APPDATA\MyWorkspace\MyWorkspaceWebV10\*.*"
    ${IfNot} ${Errors}
      StrCpy $0 "1"
      FindClose $1
    ${EndIf}
  ${EndIf}

  ${If} $0 == "0"
    IfFileExists "$APPDATA\MyWorkspace\myworkspace.db" 0 +2
      StrCpy $0 "1"
  ${EndIf}

  ${If} $0 == "0"
    IfFileExists "$APPDATA\myworkspace-web-v10\*.*" 0 +2
      StrCpy $0 "1"
  ${EndIf}
!macroend

Function un.MyWorkspaceUserDataExists
  Push $0
  Push $1
  !insertmacro MyWorkspaceUserDataExistsInline
  Pop $1
  Exch $0
FunctionEnd

!macro customInit
  StrCpy $MyWorkspaceDeleteUserData "0"
  Push $1
  !insertmacro MyWorkspaceUserDataExistsInline
  Pop $1

  ${If} $0 == "1"
    MessageBox MB_YESNO|MB_ICONQUESTION "$(myWorkspaceDataPrompt)" IDYES initUserDataDelete IDNO initUserDataKeep
    initUserDataDelete:
      StrCpy $MyWorkspaceDeleteUserData "1"
      Goto initUserDataPromptDone
    initUserDataKeep:
      StrCpy $MyWorkspaceDeleteUserData "0"
  ${EndIf}

  initUserDataPromptDone:
!macroend

!macro customInstall
  ${If} $MyWorkspaceDeleteUserData == "1"
    !insertmacro RemoveMyWorkspaceUserData
  ${EndIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    Call un.MyWorkspaceUserDataExists
    Pop $0
    ${If} $0 == "1"
      MessageBox MB_YESNO|MB_ICONQUESTION "$(myWorkspaceUninstallDataPrompt)" IDNO unDataKeep
      !insertmacro RemoveMyWorkspaceUserData
      unDataKeep:
    ${EndIf}
  ${endif}
!macroend
