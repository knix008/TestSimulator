; Custom NSIS script for My FTP Client
;
;  • an existing installation is detected first; the user is asked whether
;    to remove it and install fresh ([Yes]) or to cancel the setup ([No])
;  • a page letting the user choose Desktop / Start Menu shortcuts
;    (Korean when the installer runs in Korean, English otherwise)
;  • a clean reinstall: the previous uninstaller is run when the user agrees,
;    and this script sweeps whatever it left behind
;  • asks before deleting the data (session, settings) an earlier
;    installation left behind — silent installs keep it
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var PrevInstallDir
Var PrevUninstaller

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"

  ; ── Is My FTP Client already installed? ─────────────────
  StrCpy $PrevInstallDir ""
  StrCpy $PrevUninstaller ""
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ReadRegStr $1 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $1 == ""
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
    ReadRegStr $1 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${EndIf}
  ${If} $1 == ""
  ${AndIf} $0 != ""
  ${AndIf} ${FileExists} "$0\${APP_EXECUTABLE_FILENAME}"
    StrCpy $1 "$0\${UNINSTALL_FILENAME}"
  ${EndIf}
  ${If} $1 != ""
    StrCpy $PrevInstallDir $0
    StrCpy $PrevUninstaller $1
    ${If} $0 == ""
      ${If} $LANGUAGE == 1042
        StrCpy $0 "(알 수 없음)"
      ${Else}
        StrCpy $0 "(unknown)"
      ${EndIf}
    ${EndIf}
    ${If} $LANGUAGE == 1042
      StrCpy $2 "${PRODUCT_NAME} 이(가) 이미 설치되어 있습니다.$\r$\n$\r$\n설치 위치: $0$\r$\n$\r$\n기존 설치를 삭제한 뒤 새로 설치할까요?$\r$\n[예] 기존 버전 삭제 후 설치     [아니요] 설치 취소"
    ${Else}
      StrCpy $2 "${PRODUCT_NAME} is already installed.$\r$\n$\r$\nLocation: $0$\r$\n$\r$\nRemove the existing installation and install this version?$\r$\n[Yes] remove and install     [No] cancel the setup"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$2" /SD IDYES IDYES MfcRemovePrevious
    Abort
    MfcRemovePrevious:
      ; Close a running instance so files can be removed.
      nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
      Sleep 800
      ; --updated keeps session/settings; the later data prompt still asks.
      ; _?= makes the NSIS uninstaller run in-place so ExecWait actually waits.
      ${If} $PrevInstallDir != ""
      ${AndIf} ${FileExists} "$PrevInstallDir\${UNINSTALL_FILENAME}"
        ExecWait '"$PrevInstallDir\${UNINSTALL_FILENAME}" /S --updated _?=$PrevInstallDir'
      ${ElseIf} $PrevUninstaller != ""
        ExecWait '$PrevUninstaller /S --updated'
      ${EndIf}
      ${If} $PrevInstallDir != ""
      ${AndIf} $PrevInstallDir != "(unknown)"
        RMDir /r "$PrevInstallDir"
      ${EndIf}
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom ShortcutsPageCreate ShortcutsPageLeave
!macroend

Function ShortcutsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Language 1042 = Korean
  ${If} $LANGUAGE == 1042
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 76u 100% 40u "My FTP Client 는 FTP · FTPS · SFTP 서버에 접속해 파일을 올리고 내려받는 클라이언트입니다. 서버 목록과 로컬 폴더 트리, 전송 진행률, 접속 프로파일을 지원합니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 76u 100% 40u "My FTP Client connects to FTP, FTPS and SFTP servers to upload and download files: server listing, local folder tree, transfer progress and connection profiles."
    Pop $0
  ${EndIf}

  ${NSD_Check} $DesktopShortcutCheckbox
  ${NSD_Check} $StartMenuShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function ShortcutsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == 1
    StrCpy $DoCreateDesktopShortcut "1"
  ${Else}
    StrCpy $DoCreateDesktopShortcut "0"
  ${EndIf}

  ${NSD_GetState} $StartMenuShortcutCheckbox $0
  ${If} $0 == 1
    StrCpy $DoCreateStartMenuShortcut "1"
  ${Else}
    StrCpy $DoCreateStartMenuShortcut "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; ── Leftovers of an earlier installation ─────────────────
  ${If} $PrevInstallDir != ""
  ${AndIf} $PrevInstallDir != $INSTDIR
    RMDir /r "$PrevInstallDir"
  ${EndIf}

  ; ── Data left behind by an earlier installation ─────────
  SetShellVarContext current
  StrCpy $0 "0"
  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}

  ${If} $0 == "1"
    ${If} $LANGUAGE == 1042
      StrCpy $1 "이전에 설치된 ${PRODUCT_NAME} 의 데이터가 남아 있습니다.$\r$\n(접속 프로파일, 마지막 로컬 폴더, 테마·언어 설정, 창 위치)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
    ${Else}
      StrCpy $1 "Data from a previous ${PRODUCT_NAME} installation is still on this PC.$\r$\n(connection profiles, last local folder, theme/language settings, window position)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES MfcWipeData IDNO MfcKeepData
    MfcWipeData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    MfcKeepData:
  ${EndIf}

  ${If} $DoCreateStartMenuShortcut == "1"
    CreateDirectory "$SMPROGRAMS"
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    StrCpy $launchLink "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${EndIf}

  ${If} $DoCreateDesktopShortcut == "1"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}

  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
