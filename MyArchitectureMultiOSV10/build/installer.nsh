!include "LogicLib.nsh"
!include "installer-associations.nsh"

!macro customInit
  ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${EndIf}
  ; An installed copy is always removed completely before this one goes in,
  ; so not a single file of the old version is left behind (installing the
  ; same version over itself would otherwise skip unchanged files). The user
  ; is told first; user data is a separate question below.
  ${If} $R0 != ""
    ${IfNot} ${Silent}
      StrCpy $R3 "An installed MyArchitecture was found.$\r$\n$\r$\nIt will be removed completely before this version is installed."
      ${If} $LANGUAGE == 1042
        StrCpy $R3 "이미 설치된 MyArchitecture 가 있습니다.$\r$\n$\r$\n이 버전을 설치하기 전에 기존 프로그램을 완전히 삭제합니다."
      ${EndIf}
      MessageBox MB_OKCANCEL|MB_ICONINFORMATION $R3 IDOK removeOld
      Quit
    ${EndIf}
    removeOld:
    ReadRegStr $R4 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
    ${If} $R4 != ""
    ${AndIf} ${FileExists} "$R4\Uninstall ${PRODUCT_FILENAME}.exe"
      ; _?= keeps the uninstaller in place so ExecWait really waits for it.
      ExecWait '"$R4\Uninstall ${PRODUCT_FILENAME}.exe" /S _?=$R4'
      Delete "$R4\Uninstall ${PRODUCT_FILENAME}.exe"
    ${Else}
      ExecWait '$R0'
    ${EndIf}
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
    ; Clear whatever is left — but only a folder that really held MyArchitecture.
    ${If} $R4 != ""
    ${AndIf} ${FileExists} "$R4\resources\app.asar"
      RMDir /r "$R4"
    ${EndIf}
    ${If} $INSTDIR != ""
    ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      RMDir /r "$INSTDIR"
    ${EndIf}
  ${EndIf}

  ; Settings live in %APPDATA%\MyArchitecture (settings.json and the window's
  ; Local Storage, which holds the autosave).
  StrCpy $R1 "$APPDATA\MyArchitecture"
  ${If} ${FileExists} "$R1\*.*"
    StrCpy $R2 "Saved data from the installed program was found (settings, autosave). Do you want to delete it?"
    ${If} $LANGUAGE == 1042
      StrCpy $R2 "이미 설치한 프로그램에서 저장한 데이터(설정, 자동 저장)가 있습니다. 삭제하시겠습니까?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION $R2 IDYES deleteUserData IDNO keepUserData
    deleteUserData:
      RMDir /r "$R1"
    keepUserData:
  ${EndIf}

  ; Start the association page with the recommended selection.
  !insertmacro MyArchAssocDefaults
!macroend

; An extra wizard page where the user ticks the file types MyArchitecture should
; own. .myarch itself is always registered (package.json fileAssociations),
; so the page only exists when scripts/create-installer.mjs lists other types.
!if ${MYARCH_ASSOC_COUNT} > 0
!macro customPageAfterChangeDir
  Page custom MyArchAssocPageShow MyArchAssocPageLeaveFn
!macroend

; The wizard page belongs to the installer; the uninstaller pass compiles this
; same script and has neither the dialog nor MUI2 loaded.
!ifndef BUILD_UNINSTALLER
Function MyArchAssocPageShow
  !insertmacro MyArchAssocPageCreate
FunctionEnd

Function MyArchAssocPageLeaveFn
  !insertmacro MyArchAssocPageLeave
FunctionEnd

; The two buttons on the page: tick everything, or clear everything.
Function MyArchAssocSelectAll
  Pop $0
  !insertmacro MyArchAssocCheckAll
FunctionEnd

Function MyArchAssocSelectNone
  Pop $0
  !insertmacro MyArchAssocUncheckAll
FunctionEnd
!endif
!endif

!macro customInstall
  !insertmacro MyArchWriteAssociations
!macroend

!macro customUnInstall
  !insertmacro MyArchDeleteAssociations
!macroend
