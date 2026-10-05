; MyMerge installer
; - If a previous install exists, remove that program completely and install again.
; - If saved data exists, ask the user whether to delete it.
; - Register the .mmerge document icon.
; Korean (1042) and English.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER

Var PrevInstallDir
Var HasPrevInstall
Var HasSavedData
Var DeleteDataCheckbox
Var DoDeleteData

!macro customInit
  StrCpy $DoDeleteData "0"
  StrCpy $HasPrevInstall "0"
  StrCpy $HasSavedData "0"
  StrCpy $PrevInstallDir ""

  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $0 != ""
    StrCpy $PrevInstallDir $0
    StrCpy $HasPrevInstall "1"
  ${EndIf}

  ${If} ${FileExists} "$APPDATA\MyMerge\settings.json"
    StrCpy $HasSavedData "1"
    StrCpy $HasPrevInstall "1"
  ${EndIf}

  ; Remove the installed program completely before copying the new files.
  ExecWait "taskkill /F /IM ${APP_EXECUTABLE_FILENAME}"
  ${If} $PrevInstallDir != ""
  ${AndIf} $PrevInstallDir != $PROGRAMFILES
  ${AndIf} $PrevInstallDir != $PROGRAMFILES64
    RMDir /r "$PrevInstallDir"
  ${EndIf}
  Delete "$DESKTOP\MyMerge 10.0.lnk"
  Delete "$SMPROGRAMS\MyMerge 10.0.lnk"
!macroend

!macro customPageAfterChangeDir
  Page custom DataPageCreate DataPageLeave
!macroend

!macro MM_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

Function DataPageCreate
  ${If} $HasSavedData != "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    !insertmacro MM_SetHeader "저장된 데이터" "이미 설치된 프로그램의 저장 데이터를 지울지 선택하세요."
    ${NSD_CreateLabel} 0 0u 100% 32u "저장된 데이터가 있습니다. 삭제하시겠습니까?$\r$\n프로그램 파일은 완전히 삭제한 뒤 다시 설치합니다."
    Pop $0
    ${NSD_CreateCheckbox} 0 40u 100% 12u "저장된 데이터를 삭제"
    Pop $DeleteDataCheckbox
  ${Else}
    !insertmacro MM_SetHeader "Saved data" "Choose whether to delete data from the installed program."
    ${NSD_CreateLabel} 0 0u 100% 32u "Saved data was found. Do you want to delete it?$\r$\nThe installed program is removed completely and installed again."
    Pop $0
    ${NSD_CreateCheckbox} 0 40u 100% 12u "Delete saved data"
    Pop $DeleteDataCheckbox
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function DataPageLeave
  ${NSD_GetState} $DeleteDataCheckbox $0
  ${If} $0 == 1
    StrCpy $DoDeleteData "1"
  ${Else}
    StrCpy $DoDeleteData "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $DoDeleteData == "1"
    RMDir /r "$APPDATA\MyMerge"
  ${EndIf}

  WriteRegStr HKCU "Software\Classes\.mmerge" "" "MyMerge.Session"
  WriteRegStr HKCU "Software\Classes\MyMerge.Session" "" "MyMerge Session"
  WriteRegStr HKCU "Software\Classes\MyMerge.Session\DefaultIcon" "" "$INSTDIR\resources\document.ico"
  WriteRegStr HKCU "Software\Classes\MyMerge.Session\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!endif

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\.mmerge"
  DeleteRegKey HKCU "Software\Classes\MyMerge.Session"
!macroend
