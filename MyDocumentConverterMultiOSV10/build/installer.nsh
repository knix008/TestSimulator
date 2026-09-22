; Custom NSIS script for My Document Converter V1.0
;
;  • an earlier installation is removed completely before the new one goes
;    in: its uninstaller runs silently, then whatever it left behind is swept
;  • the data an earlier installation left (settings, recent files, the
;    background image) is deleted only if the user says so — a silent
;    install keeps it
;  • .mdcv project files are registered with their own icon (the association
;    itself comes from package.json > build > fileAssociations; the icon and
;    the "Open with" entry are refreshed here so Explorer picks them up)
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var PrevInstallDir
Var PrevUninstaller

!macro customInit
  StrCpy $PrevInstallDir ""
  StrCpy $PrevUninstaller ""

  ; Where the previous copy lives: per-user first, then per-machine.
  ReadRegStr $PrevUninstaller HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $PrevInstallDir HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $PrevUninstaller == ""
    ReadRegStr $PrevUninstaller HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $PrevInstallDir HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}

  ${If} $PrevUninstaller != ""
    DetailPrint "Removing the previous ${PRODUCT_NAME} installation..."
    ; A running copy would keep its files locked.
    nsExec::Exec 'taskkill /F /IM ${APP_EXECUTABLE_FILENAME} /T'
    ${If} $PrevInstallDir == ""
      StrCpy $PrevInstallDir "$INSTDIR"
    ${EndIf}
    ; _?= keeps the run synchronous and points it at the old folder.
    ExecWait '"$PrevUninstaller" /S _?=$PrevInstallDir'
    ; Whatever the uninstaller left behind, including its own copy.
    RMDir /r "$PrevInstallDir"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${SHORTCUT_NAME}"
    RMDir /r "$LOCALAPPDATA\mydocumentconvertermultiosv10-updater"
  ${EndIf}
!macroend

!macro customInstall
  SetShellVarContext current

  ; ── Data left behind by an earlier installation ─────────
  StrCpy $0 "0"
  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} $0 == "1"
    ${If} $LANGUAGE == 1042
      StrCpy $1 "이전에 설치된 ${PRODUCT_NAME} 의 데이터가 남아 있습니다.$\r$\n(설정, 최근 파일, 테마·언어·글꼴, 창 위치, 배경 이미지)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
    ${Else}
      StrCpy $1 "Data from a previous ${PRODUCT_NAME} installation is still on this PC.$\r$\n(settings, recent files, theme/language/fonts, window position, background image)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES MdcvWipeData IDNO MdcvKeepData
    MdcvWipeData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    MdcvKeepData:
  ${EndIf}

  ; ── The project file type, with its own icon ────────────
  WriteRegStr HKCU "Software\Classes\.mdcv" "" "MyDocumentConverter.mdcv"
  WriteRegStr HKCU "Software\Classes\.mdcv" "Content Type" "application/x-mydocumentconverter"
  WriteRegStr HKCU "Software\Classes\.mdcv\OpenWithProgids" "MyDocumentConverter.mdcv" ""
  WriteRegStr HKCU "Software\Classes\MyDocumentConverter.mdcv" "" "My Document Converter Project"
  WriteRegStr HKCU "Software\Classes\MyDocumentConverter.mdcv" "FriendlyTypeName" "My Document Converter Project"
  WriteRegStr HKCU "Software\Classes\MyDocumentConverter.mdcv\DefaultIcon" "" "$INSTDIR\resources\file-icon.ico,0"
  WriteRegStr HKCU "Software\Classes\MyDocumentConverter.mdcv\shell\open" "" "Open with ${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\MyDocumentConverter.mdcv\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$INSTDIR\resources\icon.ico,0"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".mdcv" ""
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.mdcv\UserChoice"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

!macro customUnInstall
  SetShellVarContext current
  DeleteRegKey HKCU "Software\Classes\MyDocumentConverter.mdcv"
  DeleteRegValue HKCU "Software\Classes\.mdcv\OpenWithProgids" "MyDocumentConverter.mdcv"
  ReadRegStr $0 HKCU "Software\Classes\.mdcv" ""
  ${If} $0 == "MyDocumentConverter.mdcv"
    DeleteRegKey HKCU "Software\Classes\.mdcv"
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
