; Custom NSIS script for MyPDFViewer
;
;  • adds a page letting the user choose Desktop / Start Menu shortcuts
;    (bilingual — Korean when the installer runs in Korean, English otherwise)
;  • registers the .pdfvw document type with its own icon (electron-builder
;    writes the association itself; here we make sure the icon, the friendly
;    name and the shell verbs are exactly what we want)
;  • adds MyPDFViewer to the "Open with" list for .pdf, and — only if the user
;    ticks the box on that page — makes it the default PDF viewer
;  • asks before deleting the data an earlier installation left behind
;
; On making MyPDFViewer the default for .pdf:
;   Since Windows 8 the actual default lives in a hash-protected UserChoice key
;   that no installer may write; Windows resets any forged value. What an
;   installer *can* do is what this script does:
;     1. register the app under Default Programs (RegisteredApplications +
;        Capabilities\FileAssociations), which is what puts MyPDFViewer in the
;        Settings → "Default apps" list at all;
;     2. point the per-user .pdf ProgID at MyPDFViewer, which takes effect on
;        machines where no UserChoice has been made yet;
;     3. open the Settings page for this app so one click confirms the change
;        where a UserChoice already exists.
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define WS_EXT ".pdfvw"
!define WS_PROGID "MyPDFViewer.Workspace"
!define PDF_PROGID "MyPDFViewer.PDF"

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DefaultPdfCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var DoSetDefaultPdf

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"
  ; Taking over the PDF default is opt-in: an installer should not silently
  ; replace whichever reader the user already chose.
  StrCpy $DoSetDefaultPdf "0"
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
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기와 파일 연결을 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "PDF 파일의 기본 뷰어로 설정"
    Pop $DefaultPdfCheckbox
    ${NSD_CreateLabel} 0 88u 100% 40u ".pdfvw (MyPDFViewer 작업 파일) 형식이 시스템에 등록되고, PDF 파일의 [연결 프로그램] 목록에 추가됩니다.$\r$\n기본 뷰어로 설정을 선택하면, 이미 다른 PDF 프로그램이 기본으로 지정되어 있는 경우 Windows [기본 앱] 설정 창이 열립니다. 마지막 확인은 Windows 정책상 사용자가 직접 해야 합니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts and file associations to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Set as the default PDF viewer"
    Pop $DefaultPdfCheckbox
    ${NSD_CreateLabel} 0 88u 100% 40u "The .pdfvw workspace type will be registered, and MyPDFViewer will be added to the 'Open with' list for PDF files.$\r$\nIf you set it as the default viewer and another PDF application is already the default, Windows Settings will open on the 'Default apps' page — Windows requires you to confirm that last step yourself."
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

  ${NSD_GetState} $DefaultPdfCheckbox $0
  ${If} $0 == 1
    StrCpy $DoSetDefaultPdf "1"
  ${Else}
    StrCpy $DoSetDefaultPdf "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; ── Data left behind by an earlier installation ─────────
  ; The program files themselves are already gone: electron-builder runs the
  ; previous version's uninstaller (which does RMDir /r on its install dir)
  ; before a single new file is copied, so every install is a clean one.
  ;
  ; It hands that uninstaller the --updated flag, which is what stops it acting
  ; on our `deleteAppDataOnUninstall` setting — so the settings, recent-file
  ; list and window state survive to here. Throwing them away is the user's
  ; decision, so ask, and only when there is actually something to delete.
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
    ; Silent installs keep the data — an unattended run must never destroy it.
    MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES MpvWipeData IDNO MpvKeepData
    MpvWipeData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    MpvKeepData:
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

  ; ── The app's own document type (.pdfvw), with its own icon ──
  WriteRegStr HKCU "Software\Classes\${WS_PROGID}" "" "MyPDFViewer Workspace"
  WriteRegStr HKCU "Software\Classes\${WS_PROGID}" "FriendlyTypeName" "MyPDFViewer Workspace"
  ; file.ico is shipped verbatim as an extraResource so the shell can read it
  ; (icons inside app.asar are not addressable by Explorer).
  WriteRegStr HKCU "Software\Classes\${WS_PROGID}\DefaultIcon" "" "$INSTDIR\resources\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${WS_PROGID}\shell\open" "" "Open with MyPDFViewer"
  WriteRegStr HKCU "Software\Classes\${WS_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${WS_EXT}" "" "${WS_PROGID}"
  WriteRegStr HKCU "Software\Classes\${WS_EXT}" "Content Type" "application/x-mypdfviewer-workspace"
  WriteRegStr HKCU "Software\Classes\${WS_EXT}\OpenWithProgids" "${WS_PROGID}" ""

  ; ── PDF: always offered in "Open with" ──
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}" "" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}" "FriendlyTypeName" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}\shell\open" "" "Open with ${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "${PDF_PROGID}" ""

  ; Register the application so it shows up in "Default apps".
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${WS_EXT}" ""

  ; ── Default Programs: what puts MyPDFViewer in Settings → "Default apps" ──
  ; Without these keys the app cannot be picked as the default for .pdf at all,
  ; so they are written whether or not the box was ticked.
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities" "ApplicationDescription" "${APP_DESCRIPTION}"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities\FileAssociations" ".pdf" "${PDF_PROGID}"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities\FileAssociations" "${WS_EXT}" "${WS_PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\${PRODUCT_NAME}\Capabilities"

  ${If} $DoSetDefaultPdf == "1"
    ; Takes effect immediately on a machine that has never had a PDF default
    ; chosen; where a UserChoice exists Windows keeps honouring that instead.
    WriteRegStr HKCU "Software\Classes\.pdf" "" "${PDF_PROGID}"
    WriteRegStr HKCU "Software\Classes\.pdf" "Content Type" "application/pdf"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'

  ${If} $DoSetDefaultPdf == "1"
    ; The hash-protected UserChoice key can only be changed by the user, so
    ; hand them the Settings page for this app (Windows 10 1803+). Last, so the
    ; window does not appear on top of the remaining install steps.
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice" "ProgId"
    ${If} $0 != ""
    ${AndIf} $0 != "${PDF_PROGID}"
      ExecShell "open" "ms-settings:defaultapps?registeredAppName=${PRODUCT_NAME}"
    ${EndIf}
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"

  ; If we are still the default for .pdf, hand the extension back to the shell
  ; rather than leaving it pointing at a ProgID that is about to disappear.
  ReadRegStr $0 HKCU "Software\Classes\.pdf" ""
  ${If} $0 == "${PDF_PROGID}"
    DeleteRegValue HKCU "Software\Classes\.pdf" ""
  ${EndIf}

  DeleteRegKey HKCU "Software\Classes\${WS_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${PDF_PROGID}"
  DeleteRegValue HKCU "Software\Classes\${WS_EXT}\OpenWithProgids" "${WS_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "${PDF_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${WS_EXT}"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"

  DeleteRegValue HKCU "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}"

  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
