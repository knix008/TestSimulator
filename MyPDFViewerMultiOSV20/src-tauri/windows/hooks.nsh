; MyPDFViewer installer additions (read by the Tauri NSIS template).
;
;  • removes an earlier Electron build of MyPDFViewer before installing, and
;    asks whether to keep the settings and recent files it left behind
;  • a page to choose Desktop / Start Menu shortcuts and whether to make
;    MyPDFViewer the default PDF viewer (Korean when the installer runs in
;    Korean, English otherwise)
;  • gives the .pdfvw document type its own icon, adds MyPDFViewer to the
;    "Open with" list for .pdf and registers it under Default Programs
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
; Tauri includes this file before its own pages, so the page below comes in
; front of the welcome page. PRODUCTNAME and the other template defines are
; set after this file is read, so Functions spell the names out
; (test/desktop-contract.test.js checks them against tauri.conf.json).
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include nsDialogs.nsh

!define MP_NAME "MyPDFViewer"
!define MP_IDENTIFIER "com.shkwon.mypdfviewer"
!define MP_DATA_DIR "MyPDFViewer"
!define MP_WS_EXT ".pdfvw"
!define MP_WS_PROGID "MyPDFViewer.Workspace"
!define MP_PDF_PROGID "MyPDFViewer.PDF"
; electron-builder's per-user uninstall key for appId com.shkwon.mypdfviewer
; (UUIDv5 of the appId). UninstallString is
; "%LOCALAPPDATA%\Programs\MyPDFViewer\Uninstall MyPDFViewer.exe" /currentuser
!define MP_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ff66f4e8-808c-501b-b35e-de9a5c336dd9"

Var MP_ShortcutsChosen
Var MP_DesktopState
Var MP_StartMenuState
Var MP_DefaultPdfState
Var MP_DesktopBox
Var MP_StartMenuBox
Var MP_DefaultPdfBox

Page custom MP_PageShortcuts MP_LeaveShortcuts

; No pages for update (/UPDATE) or passive (/P) installs.
; (Tauri's mode variables are declared after this file and cannot be used in Functions.)
Function MP_AbortIfUnattended
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/P" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ClearErrors
FunctionEnd

; A custom page inherits the previous page's header; write into the header
; controls (1037/1038) directly.
!macro MP_SetHeader title subtitle
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${title}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${subtitle}"
!macroend

; ── Shortcuts and the PDF default ─────────────────────────────
Function MP_PageShortcuts
  Call MP_AbortIfUnattended
  ${If} $MP_ShortcutsChosen != 1
    StrCpy $MP_DesktopState ${BST_CHECKED}
    StrCpy $MP_StartMenuState ${BST_CHECKED}
    ; Taking over the PDF default is opt-in: an installer should not silently
    ; replace whichever reader the user already chose.
    StrCpy $MP_DefaultPdfState ${BST_UNCHECKED}
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; 1042 = Korean
  ${If} $LANGUAGE == 1042
    !insertmacro MP_SetHeader "바로가기와 파일 연결" "설치 후 만들 바로가기와 파일 연결을 고르세요."
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기와 파일 연결을 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $MP_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $MP_StartMenuBox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "PDF 파일의 기본 뷰어로 설정"
    Pop $MP_DefaultPdfBox
    ${NSD_CreateLabel} 0 88u 100% 48u ".pdfvw (MyPDFViewer 작업 파일) 형식이 시스템에 등록되고, PDF 파일의 [연결 프로그램] 목록에 추가됩니다.$\r$\n기본 뷰어로 설정을 선택하면, 이미 다른 PDF 프로그램이 기본으로 지정되어 있는 경우 Windows [기본 앱] 설정 창이 열립니다. 마지막 확인은 Windows 정책상 사용자가 직접 해야 합니다."
    Pop $0
  ${Else}
    !insertmacro MP_SetHeader "Shortcuts and File Types" "Choose the shortcuts and file associations to create."
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts and file associations to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $MP_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $MP_StartMenuBox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Set as the default PDF viewer"
    Pop $MP_DefaultPdfBox
    ${NSD_CreateLabel} 0 88u 100% 48u "The .pdfvw workspace type will be registered, and MyPDFViewer will be added to the 'Open with' list for PDF files.$\r$\nIf you set it as the default viewer and another PDF application is already the default, Windows Settings will open on the 'Default apps' page — Windows requires you to confirm that last step yourself."
    Pop $0
  ${EndIf}

  ${NSD_SetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_SetState} $MP_StartMenuBox $MP_StartMenuState
  ${NSD_SetState} $MP_DefaultPdfBox $MP_DefaultPdfState
  nsDialogs::Show
FunctionEnd

Function MP_LeaveShortcuts
  ${NSD_GetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_GetState} $MP_StartMenuBox $MP_StartMenuState
  ${NSD_GetState} $MP_DefaultPdfBox $MP_DefaultPdfState
  StrCpy $MP_ShortcutsChosen 1
FunctionEnd

; ── The Electron build ────────────────────────────────────────
; Runs its uninstaller in place, silently, and waits for it. --updated stops
; the electron-builder uninstaller from deleting the user's data; whether that
; data stays is asked separately (MP_AskAboutData).
Function MP_RemoveElectron
  ReadRegStr $R5 HKCU "${MP_ELECTRON_KEY}" "UninstallString"
  ${If} $R5 == ""
    Return
  ${EndIf}
  ; "C:\...\Uninstall MyPDFViewer.exe" /currentuser → only the quoted path
  StrCpy $R7 $R5 1
  ${If} $R7 == '"'
    StrCpy $R5 $R5 "" 1
    StrCpy $R8 0
    mp_find_quote:
      StrCpy $R7 $R5 1 $R8
      StrCmp $R7 '"' mp_quote_found
      StrCmp $R7 "" mp_quote_found
      IntOp $R8 $R8 + 1
      Goto mp_find_quote
    mp_quote_found:
    StrCpy $R5 $R5 $R8
  ${EndIf}
  ${GetParent} $R5 $R6
  DetailPrint "Removing the Electron build of MyPDFViewer: $R6"
  ${If} ${FileExists} "$R5"
    ExecWait '"$R5" /S /currentuser --updated _?=$R6' $R9
    Delete "$R5"
  ${EndIf}
  ; Never the folder being installed into right now.
  ${If} $R6 != $INSTDIR
    RMDir /r "$R6"
  ${EndIf}
  DeleteRegKey HKCU "${MP_ELECTRON_KEY}"
  ; Its own shortcuts (electron-builder's, and the ones installer.nsh made).
  Delete "$DESKTOP\${MP_NAME}.lnk"
  Delete "$SMPROGRAMS\${MP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${MP_NAME}"

  ; Chromium's caches next to settings.json: nothing reads them any more.
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Cache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Code Cache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\GPUCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\DawnCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\DawnGraphiteCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\DawnWebGPUCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Local Storage"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Session Storage"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Shared Dictionary"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\blob_storage"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Network"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Crashpad"
  Delete "$APPDATA\${MP_DATA_DIR}\Local State"
  Delete "$APPDATA\${MP_DATA_DIR}\Preferences"
  Delete "$APPDATA\${MP_DATA_DIR}\SharedStorage"
  Delete "$APPDATA\${MP_DATA_DIR}\lockfile"
FunctionEnd

; Settings, recent files and window state from an earlier installation:
; throwing them away is the user's decision, so ask — only when there is
; something to delete. Silent installs keep the data.
Function MP_AskAboutData
  SetShellVarContext current
  StrCpy $0 "0"
  ${If} ${FileExists} "$APPDATA\${MP_DATA_DIR}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\${MP_IDENTIFIER}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} $0 != "1"
    Return
  ${EndIf}
  ${If} $LANGUAGE == 1042
    StrCpy $1 "이전에 설치된 ${MP_NAME} 의 데이터가 남아 있습니다.$\r$\n(설정, 최근 파일 목록, 창 상태)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
  ${Else}
    StrCpy $1 "Data from a previous ${MP_NAME} installation is still on this PC.$\r$\n(settings, recent files, window state)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
  ${EndIf}
  MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES mp_wipe IDNO mp_keep
  mp_wipe:
    RMDir /r "$APPDATA\${MP_DATA_DIR}"
    RMDir /r "$LOCALAPPDATA\${MP_IDENTIFIER}"
  mp_keep:
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; An update (/UPDATE) only replaces the program files.
  ${If} $UpdateMode <> 1
    Call MP_RemoveElectron
    Call MP_AskAboutData
  ${EndIf}

  ; Only the shortcuts chosen on the page — Tauri's own Start Menu one is off.
  ${If} $MP_ShortcutsChosen = 1
    StrCpy $NoShortcutMode 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $MP_ShortcutsChosen = 1
    ${If} $MP_StartMenuState == ${BST_CHECKED}
      CreateShortCut "$SMPROGRAMS\${MP_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${MP_NAME}.lnk"
    ${EndIf}
    ${If} $MP_DesktopState == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${MP_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${MP_NAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; ── The app's own document type (.pdfvw), with its own icon ──
  ; Tauri registers the type (bundle.fileAssociations); this gives it the
  ; document icon instead of the program's.
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}" "" "MyPDFViewer Workspace"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}" "FriendlyTypeName" "MyPDFViewer Workspace"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}\DefaultIcon" "" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\${MP_WS_EXT}" "" "${MP_WS_PROGID}"
  WriteRegStr HKCU "Software\Classes\${MP_WS_EXT}" "Content Type" "application/x-mypdfviewer-workspace"
  WriteRegStr HKCU "Software\Classes\${MP_WS_EXT}\OpenWithProgids" "${MP_WS_PROGID}" ""

  ; ── PDF: always offered in "Open with" ──
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}" "" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}" "FriendlyTypeName" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}\DefaultIcon" "" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "${MP_PDF_PROGID}" ""

  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${MP_WS_EXT}" ""

  ; ── Default Programs: what puts MyPDFViewer in Settings → "Default apps" ──
  ; Without these keys the app cannot be picked as the default for .pdf at all,
  ; so they are written whether or not the box was ticked.
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationName" "${MP_NAME}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationDescription" "PDF viewer"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationIcon" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" ".pdf" "${MP_PDF_PROGID}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" "${MP_WS_EXT}" "${MP_WS_PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${MP_NAME}" "Software\${MP_NAME}\Capabilities"

  ${If} $MP_DefaultPdfState == ${BST_CHECKED}
    ; Takes effect immediately on a machine that has never had a PDF default
    ; chosen; where a UserChoice exists Windows keeps honouring that instead.
    WriteRegStr HKCU "Software\Classes\.pdf" "" "${MP_PDF_PROGID}"
    WriteRegStr HKCU "Software\Classes\.pdf" "Content Type" "application/pdf"
  ${EndIf}

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ${If} $MP_DefaultPdfState == ${BST_CHECKED}
    ; The hash-protected UserChoice key can only be changed by the user, so
    ; hand them the Settings page for this app (Windows 10 1803+). Last, so the
    ; window does not appear on top of the remaining install steps.
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice" "ProgId"
    ${If} $0 != ""
    ${AndIf} $0 != "${MP_PDF_PROGID}"
      ExecShell "open" "ms-settings:defaultapps?registeredAppName=${MP_NAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    ; The shortcuts made here — Tauri only removes the ones it made itself.
    Delete "$DESKTOP\${MP_NAME}.lnk"
    Delete "$SMPROGRAMS\${MP_NAME}.lnk"

    ; If we are still the default for .pdf, hand the extension back to the
    ; shell rather than leaving it pointing at a ProgID that is about to go.
    ReadRegStr $0 HKCU "Software\Classes\.pdf" ""
    ${If} $0 == "${MP_PDF_PROGID}"
      DeleteRegValue HKCU "Software\Classes\.pdf" ""
    ${EndIf}

    DeleteRegKey HKCU "Software\Classes\${MP_WS_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_PDF_PROGID}"
    DeleteRegValue HKCU "Software\Classes\${MP_WS_EXT}\OpenWithProgids" "${MP_WS_PROGID}"
    DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "${MP_PDF_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_WS_EXT}"
    DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"
    DeleteRegValue HKCU "Software\RegisteredApplications" "${MP_NAME}"
    DeleteRegKey HKCU "Software\${MP_NAME}"

    ; "Delete app data" also takes settings.json (Tauri only knows
    ; %APPDATA%\${MP_IDENTIFIER}).
    ${If} $DeleteAppDataCheckboxState = 1
      RMDir /r "$APPDATA\${MP_DATA_DIR}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
