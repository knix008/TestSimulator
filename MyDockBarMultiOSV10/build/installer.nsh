; ---------------------------------------------------------------------------
; MyDockBar - NSIS customisations
;
; Adds the one question the stock electron-builder installer does not ask:
; whether to remove an already-installed copy before installing this one.
;
; The removal itself is deliberately left to electron-builder, whose install
; section already runs `uninstallOldVersion` for both the per-machine and the
; per-user registry hives. Doing it here as well would uninstall twice, and
; clearing the registry before the wizard runs would make the licence and
; destination-folder pages - which are meant to be skipped on an upgrade -
; appear again. So this file asks; electron-builder acts.
; ---------------------------------------------------------------------------

!include "LogicLib.nsh"

; Only customInit touches these, and NSIS does not compile customInit into the
; uninstaller pass - declaring them there would trip "variable never set", and
; electron-builder promotes NSIS warnings to errors.
!ifndef BUILD_UNINSTALLER
  Var PreviousUninstaller
  Var PreviousVersion
  Var PreviousLocation
!endif

; ---------------------------------------------------------------------------
; Localised strings. `addLangs` has already run by the time customHeader is
; inserted, so LangString is available here.
; ---------------------------------------------------------------------------
!macro customHeader
!ifndef BUILD_UNINSTALLER
  LangString mdbFound   ${LANG_ENGLISH} "MyDockBar $PreviousVersion is already installed:$\r$\n$PreviousLocation$\r$\n$\r$\nRemove it and install this version?$\r$\n$\r$\nYes - uninstall the existing version, then install this one.$\r$\nNo  - cancel and leave the installed version untouched."
  LangString mdbFound   ${LANG_KOREAN}  "MyDockBar $PreviousVersion 이(가) 이미 설치되어 있습니다:$\r$\n$PreviousLocation$\r$\n$\r$\n기존 프로그램을 삭제하고 이 버전을 설치할까요?$\r$\n$\r$\n예   - 기존 버전을 제거한 뒤 새로 설치합니다.$\r$\n아니오 - 설치를 취소하고 기존 버전을 그대로 둡니다."
!endif
!macroend

; ---------------------------------------------------------------------------
; Ask about an existing installation. Runs after initMultiUser, so the install
; mode has already been worked out from the registry.
; ---------------------------------------------------------------------------
!macro customInit
  StrCpy $PreviousUninstaller ""
  StrCpy $PreviousVersion ""
  StrCpy $PreviousLocation ""

  ; Per-user first, then per-machine: whichever is found is the one in the way.
  ReadRegStr $PreviousUninstaller HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $PreviousVersion     HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $PreviousLocation    HKCU "${INSTALL_REGISTRY_KEY}"   "InstallLocation"

  ${If} $PreviousUninstaller == ""
    ReadRegStr $PreviousUninstaller HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $PreviousVersion     HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $PreviousLocation    HKLM "${INSTALL_REGISTRY_KEY}"   "InstallLocation"
  ${EndIf}

  ; Nothing installed: carry straight on with a clean install.
  ${If} $PreviousUninstaller == ""
    Goto mdbInitDone
  ${EndIf}

  ${If} $PreviousLocation == ""
    StrCpy $PreviousLocation "$INSTDIR"
  ${EndIf}

  ; /SD IDYES keeps `/S` silent installs and CI unattended.
  ;
  ; Declining ends the installer straight away: the user has already said no,
  ; and an extra "cancelled" dialog would only be a second click for an answer
  ; they have given.
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "$(mdbFound)" /SD IDYES IDYES mdbInitDone
  Quit

mdbInitDone:
!macroend

; ---------------------------------------------------------------------------
; Shortcuts. electron-builder creates them from the `nsis` options; this hook
; guarantees the desktop and Start Menu entries exist even when an earlier
; install recorded "KeepShortcuts", and refreshes the shell so they appear at
; once rather than after the next sign-in.
; ---------------------------------------------------------------------------
!macro customInstall
  CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; The dock runs from the tray, so it must be closed before its files are
; replaced or removed. This covers both the standalone uninstall and the
; uninstall electron-builder runs on an upgrade.
!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
!macroend
