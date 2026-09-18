; DCM Viewer — electron-builder NSIS customisation
;
;  * Existing installation: the user chooses whether to remove it completely (program files,
;    settings, cache) before installing again, or just install over it.
;  * Options page: desktop shortcut, Start Menu shortcut, register as the default program for .dcm.
;
; Included through package.json → build.nsis.include. Text is shown in Korean when the installer
; runs in Korean (LANGUAGE 1042), otherwise in English.

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var CleanReinstall        ; "1" → wipe the previous installation and its user data first
  Var OptDesktop            ; "1" → keep the desktop shortcut
  Var OptStartMenu          ; "1" → keep the Start Menu shortcut
  Var OptFileAssoc          ; "1" → register .dcm / .dicm / .dicom for DCM Viewer
  Var OptPageHwnd
  Var OptDesktopCheck
  Var OptStartMenuCheck
  Var OptAssocCheck
!endif

!define DCM_PRODUCT "DCM Viewer"
!define DCM_EXE "DCM Viewer.exe"
!define DCM_CAPABILITIES "Software\com.shkwon.dcmviewer\Capabilities"

!macro KillDcmViewerProcesses
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "${DCM_EXE}" /T >nul 2>&1'
  Sleep 600
!macroend

!macro RemoveDcmViewerUserData
  ; Electron userData (settings, recent folders, cache) — both product-name and package-name folders
  RMDir /r "$APPDATA\${DCM_PRODUCT}"
  RMDir /r "$LOCALAPPDATA\${DCM_PRODUCT}"
  RMDir /r "$APPDATA\dcm-viewer-multios"
  RMDir /r "$LOCALAPPDATA\dcm-viewer-multios"
  RMDir /r "$LOCALAPPDATA\dcm-viewer-multios-updater"
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !include "nsDialogs.nsh"
    !include "optionsPage.nsh"
  !endif
!macroend

; ── Existing installation? ──────────────────────────────────────────────────────────────────
!macro customInit
  StrCpy $CleanReinstall "0"
  StrCpy $OptDesktop "1"
  StrCpy $OptStartMenu "1"
  StrCpy $OptFileAssoc "1"

  ; electron-builder writes the uninstall key for the current user (perMachine=false) or the machine
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${EndIf}
  ${If} $R0 != ""
    ReadRegStr $R1 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $R1 == ""
      ReadRegStr $R1 HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${EndIf}
    IfSilent keep   ; silent upgrades keep the settings
    ${If} $LANGUAGE == 1042
      MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
        "${DCM_PRODUCT} $R1 이(가) 이미 설치되어 있습니다.$\r$\n$\r$\n[예]  기존 프로그램과 설정·캐시를 완전히 삭제한 뒤 새로 설치합니다.$\r$\n[아니오]  설정을 유지한 채 기존 설치 위에 덮어씁니다.$\r$\n[취소]  설치를 중단합니다." \
        IDYES clean IDNO keep
    ${Else}
      MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
        "${DCM_PRODUCT} $R1 is already installed.$\r$\n$\r$\n[Yes]  Remove the existing program together with its settings and cache, then install fresh.$\r$\n[No]  Install over the existing installation and keep the settings.$\r$\n[Cancel]  Abort the installation." \
        IDYES clean IDNO keep
    ${EndIf}
    Quit
    clean:
      StrCpy $CleanReinstall "1"
    keep:
  ${EndIf}
  !insertmacro KillDcmViewerProcesses
!macroend

; Runs after the previous uninstaller (electron-builder runs it for upgrades), before files are copied
!macro preInstall
  !insertmacro KillDcmViewerProcesses
  ${If} $CleanReinstall == "1"
    ${If} ${FileExists} "$INSTDIR\*.*"
      RMDir /r "$INSTDIR"
    ${EndIf}
    !insertmacro RemoveDcmViewerUserData
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${EndIf}
!macroend

; ── Options page (after the directory page) ────────────────────────────────────────────────
!macro customPageAfterChangeDir
  Page custom OptionsPageCreate OptionsPageLeave
!macroend

!macro _ClearDcmCapabilities
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${DCM_PRODUCT}"
  DeleteRegKey SHELL_CONTEXT "Software\com.shkwon.dcmviewer"
!macroend

!macro _WriteDcmCapabilities
  WriteRegStr SHELL_CONTEXT "${DCM_CAPABILITIES}" "ApplicationName" "${DCM_PRODUCT}"
  WriteRegStr SHELL_CONTEXT "${DCM_CAPABILITIES}" "ApplicationDescription" "DICOM and medical image viewer"
  WriteRegStr SHELL_CONTEXT "${DCM_CAPABILITIES}" "ApplicationIcon" "$INSTDIR\${DCM_EXE},0"
  WriteRegStr SHELL_CONTEXT "${DCM_CAPABILITIES}\FileAssociations" ".dcm" "DICOM Image"
  WriteRegStr SHELL_CONTEXT "${DCM_CAPABILITIES}\FileAssociations" ".dicm" "DICOM Image"
  WriteRegStr SHELL_CONTEXT "${DCM_CAPABILITIES}\FileAssociations" ".dicom" "DICOM Image"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${DCM_PRODUCT}" "${DCM_CAPABILITIES}"
!macroend

!macro customInstall
  ; Shortcuts are created by electron-builder; remove the ones the user did not want.
  ${If} $OptDesktop != "1"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${EndIf}
  ${If} $OptStartMenu != "1"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    Delete "$SMPROGRAMS\${DCM_PRODUCT}.lnk"
  ${EndIf}

  ; File associations are registered by electron-builder (fileAssociations); undo them when declined.
  ${If} $OptFileAssoc == "1"
    !insertmacro _WriteDcmCapabilities
  ${Else}
    !insertmacro APP_UNASSOCIATE "dcm" "DICOM Image"
    !insertmacro APP_UNASSOCIATE "dicm" "DICOM Image"
    !insertmacro APP_UNASSOCIATE "dicom" "DICOM Image"
    !insertmacro _ClearDcmCapabilities
  ${EndIf}
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend

; ── Uninstall ───────────────────────────────────────────────────────────────────────────────
!macro customUnInstall
  !insertmacro KillDcmViewerProcesses
  !insertmacro _ClearDcmCapabilities
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}
  IfSilent keepUserData   ; an upgrade runs the old uninstaller silently — never wipe data then
  ${If} $LANGUAGE == 1042
    MessageBox MB_YESNO|MB_ICONQUESTION "설정, 최근 폴더, 캐시 등 사용자 데이터도 함께 삭제할까요?" IDYES wipeUserData IDNO keepUserData
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION "Also delete the user data (settings, recent folders, cache)?" IDYES wipeUserData IDNO keepUserData
  ${EndIf}
  wipeUserData:
    !insertmacro RemoveDcmViewerUserData
  keepUserData:
!macroend
