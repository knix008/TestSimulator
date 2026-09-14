; Custom NSIS script for CaptureMaster
;
;  • a page letting the user choose Desktop / Start Menu shortcuts
;    (bilingual: Korean when the installer runs in Korean, English otherwise)
;  • a completely clean reinstall: electron-builder runs the previous
;    version's uninstaller before copying a single new file, and this script
;    additionally sweeps whatever that uninstaller may have left behind
;  • asks before deleting the data (settings, recent files, window state) an
;    earlier installation left behind
;  • registers the .cmcap document type with its own icon, friendly name and
;    shell verbs (electron-builder writes the association; this makes sure the
;    icon and the verbs are exactly what we want)
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define DOC_EXT ".cmcap"
!define DOC_PROGID "CaptureMaster.Capture"
!define DOC_MIME "application/x-capturemaster-capture"

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var PrevInstallDir

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"

  ; Remember where the previous copy lives so it can be wiped completely even
  ; if its own uninstaller fails or is missing.
  StrCpy $PrevInstallDir ""
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $PrevInstallDir $0
  ${Else}
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $PrevInstallDir $0
    ${EndIf}
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
    ${NSD_CreateLabel} 0 76u 100% 40u ".cmcap (CaptureMaster 캡처 파일) 형식이 시스템에 등록되어 탐색기에서 더블클릭으로 열 수 있습니다.$\r$\n이미 설치된 CaptureMaster 가 있으면 완전히 삭제한 뒤 다시 설치합니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 76u 100% 40u "The .cmcap (CaptureMaster capture) document type will be registered so captures open with a double-click in Explorer.$\r$\nAn existing CaptureMaster installation is removed completely before the new one is installed."
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
  ; electron-builder already ran the old uninstaller. If it left program files
  ; behind (a locked file, an older installer version), clear them now so the
  ; new copy never sits on top of stale files.
  ${If} $PrevInstallDir != ""
  ${AndIf} $PrevInstallDir != $INSTDIR
    RMDir /r "$PrevInstallDir"
  ${EndIf}

  ; ── Data left behind by an earlier installation ─────────
  ; The old uninstaller is run with --updated, which keeps it from acting on
  ; `deleteAppDataOnUninstall`, so settings / recent files / window state
  ; survive to here. Throwing them away is the user's decision: ask, and only
  ; when there is actually something to delete.
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
      StrCpy $1 "이전에 설치된 ${PRODUCT_NAME} 의 데이터가 남아 있습니다.$\r$\n(설정, 최근 파일 목록, 창 상태)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
    ${Else}
      StrCpy $1 "Data from a previous ${PRODUCT_NAME} installation is still on this PC.$\r$\n(settings, recent files, window state)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
    ${EndIf}
    ; Silent installs keep the data: an unattended run must never destroy it.
    MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES CmWipeData IDNO CmKeepData
    CmWipeData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    CmKeepData:
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

  ; ── The app's own document type (.cmcap), with its own icon ──
  WriteRegStr HKCU "Software\Classes\${DOC_PROGID}" "" "CaptureMaster Capture"
  WriteRegStr HKCU "Software\Classes\${DOC_PROGID}" "FriendlyTypeName" "CaptureMaster Capture"
  ; file.ico is shipped verbatim as an extraResource so the shell can read it
  ; (icons inside app.asar are not addressable by Explorer).
  WriteRegStr HKCU "Software\Classes\${DOC_PROGID}\DefaultIcon" "" "$INSTDIR\resources\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${DOC_PROGID}\shell\open" "" "Open with CaptureMaster"
  WriteRegStr HKCU "Software\Classes\${DOC_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${DOC_EXT}" "" "${DOC_PROGID}"
  WriteRegStr HKCU "Software\Classes\${DOC_EXT}" "Content Type" "${DOC_MIME}"
  WriteRegStr HKCU "Software\Classes\${DOC_EXT}\OpenWithProgids" "${DOC_PROGID}" ""

  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${DOC_EXT}" ""

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"

  DeleteRegKey HKCU "Software\Classes\${DOC_PROGID}"
  DeleteRegValue HKCU "Software\Classes\${DOC_EXT}\OpenWithProgids" "${DOC_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${DOC_EXT}"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"

  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
