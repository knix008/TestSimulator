; Custom NSIS script for MyPDFViewer
;
;  • adds a page letting the user choose Desktop / Start Menu shortcuts
;    (bilingual — Korean when the installer runs in Korean, English otherwise)
;  • registers the .pdfvw document type with its own icon (electron-builder
;    writes the association itself; here we make sure the icon, the friendly
;    name and the shell verbs are exactly what we want)
;  • adds MyPDFViewer to the "Open with" list for .pdf without stealing the
;    user's existing default PDF application
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
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var PrevInstalled

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"

  ; Detect a previous installation so we can wipe its leftovers before reinstalling.
  StrCpy $PrevInstalled "0"
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $0 != ""
    StrCpy $PrevInstalled "1"
  ${Else}
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $0 != ""
      StrCpy $PrevInstalled "1"
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
    ${NSD_CreateLabel} 0 76u 100% 24u ".pdfvw (MyPDFViewer 작업 파일) 형식이 시스템에 등록되고, PDF 파일의 [연결 프로그램] 목록에 추가됩니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 76u 100% 24u "The .pdfvw workspace type will be registered, and MyPDFViewer will be added to the 'Open with' list for PDF files."
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
  ; A previous version leaves settings behind; start clean.
  ${If} $PrevInstalled == "1"
    SetShellVarContext current
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
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

  ; ── PDF: offered in "Open with", but the current default is left alone ──
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}" "" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${PDF_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "${PDF_PROGID}" ""

  ; Register the application so it shows up in "Default apps".
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${WS_EXT}" ""

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"

  DeleteRegKey HKCU "Software\Classes\${WS_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${PDF_PROGID}"
  DeleteRegValue HKCU "Software\Classes\${WS_EXT}\OpenWithProgids" "${WS_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "${PDF_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${WS_EXT}"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"

  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
