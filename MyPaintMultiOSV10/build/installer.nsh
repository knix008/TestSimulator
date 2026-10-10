; MyPaint installer
; - The user picks the installer language (Korean or English) on the first screen.
; - An existing program is removed completely, then the new one is installed.
; - Saved user data is deleted only when the user says so.

!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_ALWAYSSHOW

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var HasSavedData
Var DoDeleteData

!macro MP_WipeIfApp DIR
  Push $R1
  Push $R2
  StrCpy $R1 "${DIR}"
  StrLen $R2 $R1
  ${If} $R2 > 8
  ${AndIf} $R1 != $PROGRAMFILES
  ${AndIf} $R1 != $PROGRAMFILES64
  ${AndIf} $R1 != $LOCALAPPDATA
  ${AndIf} $R1 != "$LOCALAPPDATA\Programs"
  ${AndIf} $R1 != $APPDATA
  ${AndIf} $R1 != $PROFILE
  ${AndIf} $R1 != $DESKTOP
  ${AndIf} $R1 != $TEMP
    ${If} ${FileExists} "$R1\${APP_EXECUTABLE_FILENAME}"
    ${OrIf} ${FileExists} "$R1\${UNINSTALL_FILENAME}"
    ${OrIf} ${FileExists} "$R1\resources\document.ico"
      ${If} ${FileExists} "$R1\${UNINSTALL_FILENAME}"
        ExecWait '"$R1\${UNINSTALL_FILENAME}" /S --updated _?=$R1'
      ${EndIf}
      RMDir /r "$R1"
      ${If} ${FileExists} "$R1\${APP_EXECUTABLE_FILENAME}"
        ExecWait "taskkill /F /IM ${APP_EXECUTABLE_FILENAME}"
        Sleep 400
        RMDir /r "$R1"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $R2
  Pop $R1
!macroend

!macro MP_RemoveHive ROOT
  Push $R8
  ReadRegStr $R8 ${ROOT} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  !insertmacro MP_WipeIfApp $R8
  DeleteRegKey ${ROOT} "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey ${ROOT} "${INSTALL_REGISTRY_KEY}"
  Pop $R8
!macroend

!macro customInit
  StrCpy $DoDeleteData "0"
  StrCpy $HasSavedData "0"
  ${If} ${FileExists} "$APPDATA\MyPaint\*.*"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\MyPaint\*.*"
    StrCpy $HasSavedData "1"
  ${EndIf}
!macroend

; Runs when installation actually starts, before the new files are copied.
!macro customCheckAppRunning
  ExecWait "taskkill /F /IM ${APP_EXECUTABLE_FILENAME}"
  Sleep 300
  SetOutPath $TEMP
  !insertmacro MP_RemoveHive HKCU
  !insertmacro MP_RemoveHive HKLM
  !insertmacro MP_WipeIfApp $INSTDIR
  !insertmacro MP_WipeIfApp $LOCALAPPDATA\Programs\${APP_FILENAME}
  !insertmacro MP_WipeIfApp $PROGRAMFILES64\${APP_FILENAME}
  !insertmacro MP_WipeIfApp $PROGRAMFILES\${APP_FILENAME}
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  RMDir "$SMPROGRAMS\MyPaint"
  DeleteRegKey HKCU "Software\Classes\.mpaint"
  DeleteRegKey HKCU "Software\Classes\MyPaint.Drawing"
  DeleteRegKey HKLM "Software\Classes\.mpaint"
  DeleteRegKey HKLM "Software\Classes\MyPaint.Drawing"
!macroend

!macro customPageAfterChangeDir
  Page custom DataPageCreate
!macroend

Function DataPageCreate
  ${If} $HasSavedData != "1"
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "이미 설치된 프로그램은 완전히 삭제한 뒤 다시 설치합니다.$\r$\n$\r$\n저장된 데이터가 있습니다. 삭제하시겠습니까?" /SD IDNO IDYES dataYes
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "The installed program is removed completely and installed again.$\r$\n$\r$\nSaved data was found. Do you want to delete it?" /SD IDNO IDYES dataYes
  ${EndIf}
  StrCpy $DoDeleteData "0"
  Abort

  dataYes:
    StrCpy $DoDeleteData "1"
    Abort
FunctionEnd

!macro customInstall
  ${If} $DoDeleteData == "1"
    RMDir /r "$APPDATA\MyPaint"
    RMDir /r "$LOCALAPPDATA\MyPaint"
  ${EndIf}

  WriteRegStr HKCU "Software\Classes\.mpaint" "" "MyPaint.Drawing"
  WriteRegStr HKCU "Software\Classes\MyPaint.Drawing" "" "MyPaint Drawing"
  WriteRegStr HKCU "Software\Classes\MyPaint.Drawing\DefaultIcon" "" "$INSTDIR\resources\document.ico"
  WriteRegStr HKCU "Software\Classes\MyPaint.Drawing\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!endif

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\.mpaint"
  DeleteRegKey HKCU "Software\Classes\MyPaint.Drawing"
!macroend
