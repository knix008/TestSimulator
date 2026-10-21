; MyDCMViewer installer additions (read by the Tauri NSIS template).
;
;  • removes the earlier Electron build ("DCM Viewer") completely before installing,
;    and asks whether to delete the settings and recent folders left behind
;  • a page to choose Desktop / Start Menu shortcuts and whether to make
;    MyDCMViewer the default program for DICOM files (.dcm / .dicm / .dicom)
;    (Korean when the installer runs in Korean, English otherwise)
;  • gives DICOM files their own document icon, adds MyDCMViewer to the
;    "Open with" list and registers it under Default Programs
;
; On making MyDCMViewer the default for .dcm:
;   Since Windows 8 the actual default lives in a hash-protected UserChoice key
;   that no installer may write. The script registers the app under Default
;   Programs, points the per-user ProgID at MyDCMViewer (effective where no
;   UserChoice exists yet) and otherwise opens Settings > Default apps.
;
; Tauri includes this file before its own pages, so the page below comes in
; front of the welcome page. Template defines are set after this file is read,
; so Functions spell the names out (test/desktop-contract.test.js checks them).
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include nsDialogs.nsh

!define MP_NAME "MyDCMViewer"
!define MP_IDENTIFIER "com.shkwon.mydcmviewer"
!define MP_DATA_DIR "MyDCMViewer"
; the Electron build kept its data under the product name and the package name
!define MP_OLD_DATA_DIR "DCM Viewer"
!define MP_OLD_PKG_DIR "dcm-viewer-multios"
!define MP_OLD_NAME "DCM Viewer"
!define MP_DCM_PROGID "MyDCMViewer.DICOM"
; electron-builder's per-user uninstall key for appId com.shkwon.dcmviewer
; (UUIDv5 of the appId). UninstallString is
; "%LOCALAPPDATA%\Programs\DCM Viewer\Uninstall DCM Viewer.exe" /currentuser
!define MP_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\bebd86e1-8572-5a5e-8c99-121fc77e109e"

Var MP_ShortcutsChosen
Var MP_DesktopState
Var MP_StartMenuState
Var MP_DefaultDcmState
Var MP_DesktopBox
Var MP_StartMenuBox
Var MP_DefaultDcmBox

Page custom MP_PageShortcuts MP_LeaveShortcuts

!macro MP_OpenWith EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${MP_DCM_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${EXT}" ""
!macroend

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

; ── Shortcuts and the DICOM default ─────────────────────────────
Function MP_PageShortcuts
  Call MP_AbortIfUnattended
  ${If} $MP_ShortcutsChosen != 1
    StrCpy $MP_DesktopState ${BST_CHECKED}
    StrCpy $MP_StartMenuState ${BST_CHECKED}
    ; A DICOM viewer is what people install this for: on by default, as in the Electron build.
    StrCpy $MP_DefaultDcmState ${BST_CHECKED}
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
    ${NSD_CreateCheckbox} 0 70u 100% 12u "DICOM 파일(.dcm, .dicm, .dicom)의 기본 프로그램으로 등록"
    Pop $MP_DefaultDcmBox
    ${NSD_CreateLabel} 0 88u 100% 48u "DICOM 파일에 전용 아이콘이 표시되고 [연결 프로그램] 목록에 MyDCMViewer 가 추가됩니다.$\r$\n다른 프로그램이 이미 기본으로 지정되어 있으면 Windows [기본 앱] 설정 창이 열립니다. 마지막 확인은 Windows 정책상 사용자가 직접 해야 합니다."
    Pop $0
  ${Else}
    !insertmacro MP_SetHeader "Shortcuts and File Types" "Choose the shortcuts and file associations to create."
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts and file associations to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $MP_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $MP_StartMenuBox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Make MyDCMViewer the default program for DICOM files (.dcm, .dicm, .dicom)"
    Pop $MP_DefaultDcmBox
    ${NSD_CreateLabel} 0 88u 100% 48u "DICOM files get their own document icon and MyDCMViewer is added to their 'Open with' list.$\r$\nIf another program is already the default, Windows Settings will open on the 'Default apps' page; Windows requires you to confirm that last step yourself."
    Pop $0
  ${EndIf}

  ${NSD_SetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_SetState} $MP_StartMenuBox $MP_StartMenuState
  ${NSD_SetState} $MP_DefaultDcmBox $MP_DefaultDcmState
  nsDialogs::Show
FunctionEnd

Function MP_LeaveShortcuts
  ${NSD_GetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_GetState} $MP_StartMenuBox $MP_StartMenuState
  ${NSD_GetState} $MP_DefaultDcmBox $MP_DefaultDcmState
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
  ; "C:\...\Uninstall DCM Viewer.exe" /currentuser → only the quoted path
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
  DetailPrint "Removing the Electron build of DCM Viewer: $R6"
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
  Delete "$DESKTOP\${MP_OLD_NAME}.lnk"
  Delete "$SMPROGRAMS\${MP_OLD_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${MP_OLD_NAME}"
  ; its .dcm registration (installer.nsh of the Electron build)
  DeleteRegKey HKCU "Software\Classes\DCMViewer.dcm"
  DeleteRegKey HKCU "Software\com.shkwon.dcmviewer"
  DeleteRegValue HKCU "Software\RegisteredApplications" "${MP_OLD_NAME}"

  ; Chromium caches of the Electron build: nothing reads them any more.
  RMDir /r "$LOCALAPPDATA\${MP_OLD_DATA_DIR}"
  RMDir /r "$LOCALAPPDATA\${MP_OLD_PKG_DIR}-updater"
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
  ${If} ${FileExists} "$APPDATA\${MP_OLD_DATA_DIR}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\${MP_OLD_PKG_DIR}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} $0 != "1"
    Return
  ${EndIf}
  ${If} $LANGUAGE == 1042
    StrCpy $1 "이전에 설치된 ${MP_NAME} 의 데이터가 남아 있습니다.$\r$\n(설정, 최근 폴더 목록, 창 상태)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
  ${Else}
    StrCpy $1 "Data from a previous ${MP_NAME} installation is still on this PC.$\r$\n(settings, recent folders, window state)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
  ${EndIf}
  MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES mp_wipe IDNO mp_keep
  mp_wipe:
    RMDir /r "$APPDATA\${MP_DATA_DIR}"
    RMDir /r "$LOCALAPPDATA\${MP_IDENTIFIER}"
    RMDir /r "$APPDATA\${MP_OLD_DATA_DIR}"
    RMDir /r "$APPDATA\${MP_OLD_PKG_DIR}"
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

  ; -- DICOM files: own document icon, "Open with", Default Programs --
  WriteRegStr HKCU "Software\Classes\${MP_DCM_PROGID}" "" "DICOM Image"
  WriteRegStr HKCU "Software\Classes\${MP_DCM_PROGID}" "FriendlyTypeName" "DICOM Image"
  WriteRegStr HKCU "Software\Classes\${MP_DCM_PROGID}" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_DCM_PROGID}\DefaultIcon" "" "$INSTDIR\dcmfile.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_DCM_PROGID}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_DCM_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  !insertmacro MP_OpenWith ".dcm"
  !insertmacro MP_OpenWith ".dicm"
  !insertmacro MP_OpenWith ".dicom"

  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationName" "${MP_NAME}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationDescription" "DICOM viewer"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" ".dcm" "${MP_DCM_PROGID}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" ".dicm" "${MP_DCM_PROGID}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" ".dicom" "${MP_DCM_PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${MP_NAME}" "Software\${MP_NAME}\Capabilities"

  ${If} $MP_DefaultDcmState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\.dcm" "" "${MP_DCM_PROGID}"
    WriteRegStr HKCU "Software\Classes\.dicm" "" "${MP_DCM_PROGID}"
    WriteRegStr HKCU "Software\Classes\.dicom" "" "${MP_DCM_PROGID}"
    WriteRegStr HKCU "Software\Classes\.dcm" "Content Type" "application/dicom"
  ${Else}
    ; Not chosen as the default: give the extensions back if they point at us.
    ReadRegStr $0 HKCU "Software\Classes\.dcm" ""
    ${If} $0 == "${MP_DCM_PROGID}"
      DeleteRegValue HKCU "Software\Classes\.dcm" ""
      DeleteRegValue HKCU "Software\Classes\.dicm" ""
      DeleteRegValue HKCU "Software\Classes\.dicom" ""
    ${EndIf}
  ${EndIf}

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ${If} $MP_DefaultDcmState == ${BST_CHECKED}
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.dcm\UserChoice" "ProgId"
    ${If} $0 != ""
    ${AndIf} $0 != "${MP_DCM_PROGID}"
      ExecShell "open" "ms-settings:defaultapps?registeredAppName=${MP_NAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    ; The shortcuts made here; Tauri only removes the ones it made itself.
    Delete "$DESKTOP\${MP_NAME}.lnk"
    Delete "$SMPROGRAMS\${MP_NAME}.lnk"

    ; Hand the extensions back to the shell rather than pointing at a ProgID about to go.
    ReadRegStr $0 HKCU "Software\Classes\.dcm" ""
    ${If} $0 == "${MP_DCM_PROGID}"
      DeleteRegValue HKCU "Software\Classes\.dcm" ""
      DeleteRegValue HKCU "Software\Classes\.dicm" ""
      DeleteRegValue HKCU "Software\Classes\.dicom" ""
    ${EndIf}
    DeleteRegKey HKCU "Software\Classes\${MP_DCM_PROGID}"
    DeleteRegValue HKCU "Software\Classes\.dcm\OpenWithProgids" "${MP_DCM_PROGID}"
    DeleteRegValue HKCU "Software\Classes\.dicm\OpenWithProgids" "${MP_DCM_PROGID}"
    DeleteRegValue HKCU "Software\Classes\.dicom\OpenWithProgids" "${MP_DCM_PROGID}"
    DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"
    DeleteRegValue HKCU "Software\RegisteredApplications" "${MP_NAME}"
    DeleteRegKey HKCU "Software\${MP_NAME}"

    ; "Delete app data" also takes settings.json (Tauri only knows %APPDATA%\${MP_IDENTIFIER}).
    ${If} $DeleteAppDataCheckboxState = 1
      RMDir /r "$APPDATA\${MP_DATA_DIR}"
      RMDir /r "$LOCALAPPDATA\${MP_IDENTIFIER}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
