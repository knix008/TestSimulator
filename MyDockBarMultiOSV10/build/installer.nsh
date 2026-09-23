; ---------------------------------------------------------------------------
; MyDockBar - NSIS customisations
;
; Two things the stock electron-builder installer does not do:
;
;  * ask whether to remove an already-installed copy before installing, and
;  * ask each of its questions only once.
;
; The second is not something the wizard gets wrong on its own. It happens
; because "install for everyone" relaunches the installer with administrator
; rights, and that relaunch is a whole new process that runs the wizard again
; from the top - language, licence, destination folder and the question below,
; all for a second time. MyDockBar has no reason to be installed machine-wide,
; so this file settles that question itself and the relaunch never happens.
;
; Removing the old copy is otherwise left to electron-builder, whose install
; section already runs `uninstallOldVersion` against the hive it is installing
; into. Doing it here as well would uninstall twice, and clearing the registry
; before the wizard runs would bring back the licence and destination-folder
; pages that are meant to be skipped on an upgrade. So this file asks;
; electron-builder acts. The one case it cannot act on - a machine-wide copy
; left by an older installer, which a per-user install does not touch - is
; handled in customInstall.
; ---------------------------------------------------------------------------

!include "LogicLib.nsh"

; Only the installer pass touches these, and NSIS does not compile customInit
; into the uninstaller - declaring them there would trip "variable never set",
; and electron-builder promotes NSIS warnings to errors.
!ifndef BUILD_UNINSTALLER
  Var PreviousUninstaller
  Var PreviousVersion
  Var PreviousLocation
  Var PreviousPerMachine
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
  ; Nothing below should ever run twice. The elevated relaunch is a second
  ; process running the same .onInit, and it has already been answered.
  ${If} ${UAC_IsInnerInstance}
    Goto mdbInitDone
  ${EndIf}

  StrCpy $PreviousUninstaller ""
  StrCpy $PreviousVersion ""
  StrCpy $PreviousLocation ""
  StrCpy $PreviousPerMachine "0"

  ; Per-user first, then per-machine: whichever is found is the one in the way.
  ReadRegStr $PreviousUninstaller HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $PreviousVersion     HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $PreviousLocation    HKCU "${INSTALL_REGISTRY_KEY}"   "InstallLocation"

  ${If} $PreviousUninstaller == ""
    ReadRegStr $PreviousUninstaller HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $PreviousVersion     HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $PreviousLocation    HKLM "${INSTALL_REGISTRY_KEY}"   "InstallLocation"
    ${If} $PreviousUninstaller != ""
      StrCpy $PreviousPerMachine "1"
    ${EndIf}
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
; Who the install is for.
;
; Answering this here removes the page that would otherwise ask, and with it
; the elevated relaunch and every question that relaunch would repeat.
;
; Per-user is not a compromise for this program: MyDockBar's settings, its icon
; cache and its startup entry all live in the user's profile, so a machine-wide
; install would still be configured one user at a time. It also means the
; installer never needs administrator rights, so there is no UAC prompt either.
; ---------------------------------------------------------------------------
!macro customInstallMode
!ifndef BUILD_UNINSTALLER
  StrCpy $isForceCurrentInstall "1"
!endif
!macroend

; ---------------------------------------------------------------------------
; Finishing up.
;
; Shortcuts: electron-builder creates them from the `nsis` options; recreating
; them here guarantees the desktop and Start Menu entries exist even when an
; earlier install recorded "KeepShortcuts", and the shell is told to refresh so
; they appear at once rather than after the next sign-in.
;
; Before that, the one copy electron-builder cannot have removed: a machine-wide
; install left by an older version of this installer, which offered the choice.
; A per-user install only ever clears the per-user hive, so that copy would be
; left behind in Program Files and in the Add/Remove Programs list, and the
; user has just been told it would be removed.
;
; Its own uninstaller can do it and asks Windows for the rights it needs, which
; is why this is worth doing rather than elevating the whole wizard: one prompt
; at the end instead of a restart in the middle. It runs after the new copy is
; in place, so a wizard cancelled half way through leaves the old one alone,
; and it works on the all-users Start Menu and desktop while the shortcuts
; written below are this user's - the two never collide.
; ---------------------------------------------------------------------------
!macro customInstall
  ${If} $PreviousPerMachine == "1"
  ${AndIf} $PreviousUninstaller != ""
    Push $R8
    Push $R9

    ; The UninstallString is a quoted path followed by its own switches.
    !insertmacro GetInQuotes $R8 "$PreviousUninstaller"
    ${If} $R8 == ""
      StrCpy $R8 "$PreviousUninstaller"
    ${EndIf}

    ${If} ${FileExists} "$R8"
      ; An uninstaller deletes the folder it sits in, so it has to be run from
      ; a copy elsewhere, with _?= naming the folder it is to clear.
      Push $R8
      Call GetFileParent
      Pop $R9

      !insertmacro copyFile "$R8" "$PLUGINSDIR\old-machine-uninstaller.exe"
      ExecWait '"$PLUGINSDIR\old-machine-uninstaller.exe" /S /KEEP_APP_DATA /allusers --updated _?=$R9' $0
      ${If} $0 != 0
        DetailPrint "Could not remove the machine-wide MyDockBar (code $0); it is still listed in Add/Remove Programs."
      ${EndIf}
    ${EndIf}

    Pop $R9
    Pop $R8
  ${EndIf}

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
