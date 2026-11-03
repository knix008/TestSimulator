; MyEBookReader installer additions (read by the Tauri NSIS template).
;
;  • removes the earlier Electron build (MyEbooks, the same app id) before
;    installing, and asks whether to keep the settings and recent files it
;    left behind
;  • a page to choose Desktop / Start Menu shortcuts and whether to make
;    MyEBookReader the default reader for e-books (Korean when the installer
;    runs in Korean, English otherwise)
;  • removes the file associations an earlier MyEBookReader build left behind
;  • gives the .ebkvw document type its own icon, adds MyEBookReader to the
;    "Open with" list for PDF and every e-book type, and registers it under
;    Default Programs
;  • offers MyEBookReader for Markdown, plain text and ZIP archives of
;    pictures (comics), each with its own document icon, without taking
;    those types' default
;
; On making MyEBookReader the default for e-books:
;   Since Windows 8 the actual default lives in a hash-protected UserChoice key
;   that no installer may write; Windows resets any forged value. What an
;   installer *can* do is what this script does:
;     1. register the app under Default Programs (RegisteredApplications +
;        Capabilities\FileAssociations), which is what puts MyEBookReader in the
;        Settings → "Default apps" list at all;
;     2. point the per-user e-book ProgIDs at MyEBookReader, which takes effect
;        on machines where no UserChoice has been made yet;
;     3. open the Settings page for this app so one click confirms the change
;        where a UserChoice already exists.
;   PDF is only added to "Open with": the PDF default stays whatever it was.
;
; Tauri includes this file before its own pages, so the page below comes in
; front of the welcome page. PRODUCTNAME and the other template defines are
; set after this file is read, so Functions spell the names out
; (test/desktop-contract.test.js checks them against tauri.conf.json).
;
; Keep this file UTF-8 with a BOM, or NSIS reads the Korean text as ANSI.

!include nsDialogs.nsh

; ── Installer language (Korean / English) ─────────────────────
; tauri.conf.json turns on the language selector, but MUI only shows it when
; no "Installer Language" was saved by an earlier install — so after the first
; install every reinstall silently reused that language. Always ask; the saved
; one is still preselected. ALLLANGUAGES keeps LangDLL from hiding a language
; whose codepage differs from the system's (English on Korean Windows).
!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_WINDOWTITLE "설치 언어 / Installer Language"
!define MUI_LANGDLL_INFO "설치에 사용할 언어를 고르세요.$\r$\nPlease select the installer language."

!define MP_NAME "MyEBookReader"
!define MP_IDENTIFIER "com.shkwon.myebookreader"
; Windows paths ignore case, so this is also the folder the Electron build
; (package name "myebookreader") kept its settings in.
!define MP_DATA_DIR "MyEBookReader"
!define MP_WS_EXT ".ebkvw"
!define MP_WS_PROGID "MyEBookReader.Workspace"
!define MP_BOOK_PROGID "MyEBookReader.Book"
!define MP_PDF_PROGID "MyEBookReader.PDF"
; Markdown, plain text and ZIP archives of pictures (comics): offered in
; "Open with" and Default Programs, each with its own document icon, never
; made the default by the installer — editors and the system's own ZIP
; folder keep those.
!define MP_MD_PROGID "MyEBookReader.Markdown"
!define MP_TXT_PROGID "MyEBookReader.Text"
!define MP_ZIP_PROGID "MyEBookReader.Archive"
; electron-builder's per-user uninstall key for appId com.shkwon.myebookreader
; (UUIDv5 of the appId). UninstallString is
; "%LOCALAPPDATA%\Programs\MyEbooks\Uninstall MyEbooks.exe" /currentuser
!define MP_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\b852d017-31fd-500a-919f-b1216aed68d8"
!define MP_ELECTRON_NAME "MyEbooks"

Var MP_ShortcutsChosen
Var MP_DesktopState
Var MP_StartMenuState
Var MP_DefaultBookState
Var MP_DesktopBox
Var MP_StartMenuBox
Var MP_DefaultBookBox

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

; ── Shortcuts and the e-book default ──────────────────────────
Function MP_PageShortcuts
  Call MP_AbortIfUnattended
  ${If} $MP_ShortcutsChosen != 1
    StrCpy $MP_DesktopState ${BST_CHECKED}
    StrCpy $MP_StartMenuState ${BST_CHECKED}
    ; Taking over the e-book default is opt-in: an installer should not
    ; silently replace whichever reader the user already chose.
    StrCpy $MP_DefaultBookState ${BST_UNCHECKED}
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
    ${NSD_CreateCheckbox} 0 70u 100% 12u "전자책(EPUB·MOBI·AZW·DjVu·FB2·CBZ)의 기본 리더로 설정"
    Pop $MP_DefaultBookBox
    ${NSD_CreateLabel} 0 88u 100% 48u ".ebkvw (MyEBookReader 작업 파일) 형식이 시스템에 등록되고, PDF·전자책·Markdown·텍스트·ZIP(그림 묶음) 파일의 [연결 프로그램] 목록에 추가됩니다.$\r$\n기본 리더로 설정을 선택하면, 이미 다른 프로그램이 기본으로 지정되어 있는 경우 Windows [기본 앱] 설정 창이 열립니다. 마지막 확인은 Windows 정책상 사용자가 직접 해야 합니다."
    Pop $0
  ${Else}
    !insertmacro MP_SetHeader "Shortcuts and File Types" "Choose the shortcuts and file associations to create."
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts and file associations to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $MP_DesktopBox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $MP_StartMenuBox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Set as the default reader for e-books (EPUB, MOBI, AZW, DjVu, FB2, CBZ)"
    Pop $MP_DefaultBookBox
    ${NSD_CreateLabel} 0 88u 100% 48u "The .ebkvw workspace type will be registered, and MyEBookReader will be added to the 'Open with' list for PDF, e-book, Markdown, text and ZIP (pictures) files.$\r$\nIf you set it as the default reader and another application is already the default, Windows Settings will open on the 'Default apps' page — Windows requires you to confirm that last step yourself."
    Pop $0
  ${EndIf}

  ${NSD_SetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_SetState} $MP_StartMenuBox $MP_StartMenuState
  ${NSD_SetState} $MP_DefaultBookBox $MP_DefaultBookState
  nsDialogs::Show
FunctionEnd

Function MP_LeaveShortcuts
  ${NSD_GetState} $MP_DesktopBox $MP_DesktopState
  ${NSD_GetState} $MP_StartMenuBox $MP_StartMenuState
  ${NSD_GetState} $MP_DefaultBookBox $MP_DefaultBookState
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
  ; "C:\...\Uninstall MyEbooks.exe" /currentuser → only the quoted path
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
  DetailPrint "Removing the Electron build of MyEBookReader (MyEbooks): $R6"
  ${If} ${FileExists} "$R5"
    ExecWait '"$R5" /S /currentuser --updated _?=$R6' $R9
    Delete "$R5"
  ${EndIf}
  ; Never the folder being installed into right now.
  ${If} $R6 != $INSTDIR
    RMDir /r "$R6"
  ${EndIf}
  DeleteRegKey HKCU "${MP_ELECTRON_KEY}"
  ; Its own shortcuts (electron-builder's, and the ones its installer made).
  Delete "$DESKTOP\${MP_ELECTRON_NAME}.lnk"
  Delete "$SMPROGRAMS\${MP_ELECTRON_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${MP_ELECTRON_NAME}"

  ; Chromium's caches next to settings.json: nothing reads them any more.
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Cache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Code Cache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\GPUCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\DawnCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\DawnGraphiteCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\DawnWebGPUCache"
  RMDir /r "$APPDATA\${MP_DATA_DIR}\Dictionaries"
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

; One e-book extension: offered in "Open with", listed under Default
; Programs, and — when the box was ticked — made the per-user default.
!macro MP_RegisterBookExt ext
  WriteRegStr HKCU "Software\Classes\${ext}\OpenWithProgids" "${MP_BOOK_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${ext}" ""
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" "${ext}" "${MP_BOOK_PROGID}"
  ${If} $MP_DefaultBookState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\${ext}" "" "${MP_BOOK_PROGID}"
  ${EndIf}
!macroend

; A document type of ours with its own icon, offered for some extensions.
!macro MP_WriteDocProgId progid typename icon
  WriteRegStr HKCU "Software\Classes\${progid}" "" "${typename}"
  WriteRegStr HKCU "Software\Classes\${progid}" "FriendlyTypeName" "${typename}"
  WriteRegStr HKCU "Software\Classes\${progid}" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${progid}\DefaultIcon" "" "$INSTDIR\${icon},0"
  WriteRegStr HKCU "Software\Classes\${progid}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${progid}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

; Offered in "Open with" and listed under Default Programs — not the default.
!macro MP_OfferExt ext progid
  WriteRegStr HKCU "Software\Classes\${ext}\OpenWithProgids" "${progid}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${ext}" ""
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" "${ext}" "${progid}"
!macroend

; Taken back on uninstall; the extension is released only if the user had
; made it ours (in Settings) and the ProgID is about to go.
!macro MP_WithdrawExt ext progid
  DeleteRegValue HKCU "Software\Classes\${ext}\OpenWithProgids" "${progid}"
  ReadRegStr $0 HKCU "Software\Classes\${ext}" ""
  ${If} $0 == "${progid}"
    DeleteRegValue HKCU "Software\Classes\${ext}" ""
  ${EndIf}
!macroend

!macro MP_UnregisterBookExt ext
  ReadRegStr $0 HKCU "Software\Classes\${ext}" ""
  ${If} $0 == "${MP_BOOK_PROGID}"
    DeleteRegValue HKCU "Software\Classes\${ext}" ""
  ${EndIf}
  DeleteRegValue HKCU "Software\Classes\${ext}\OpenWithProgids" "${MP_BOOK_PROGID}"
!macroend

; ── Registrations an earlier MyEBookReader build left behind ──
; The build installed in %LOCALAPPDATA%\Programs\MyEBookReader (same app id)
; registered three ProgIDs of its own for every format it read — books,
; documents and pictures — plus a ".ebkr" library type. Its folder is gone but
; those keys stayed, still pointing at the missing exe: Windows lists them in
; "Open with" (for .md, .txt, .png …) with a blank icon, and where one is the
; extension's default, opening the file fails. This takes them out wherever
; they are referenced, and only them.
!define MP_LEGACY_BOOK_PROGID "MyEBookReader.EPUB"
!define MP_LEGACY_PIC_PROGID "MyEBookReader.Picture"
!define MP_LEGACY_LIB_PROGID "MyEBookReader.Library"
!define MP_LEGACY_LIB_PROGID2 "MyEBookReader Library"
!define MP_LEGACY_LIB_EXT ".ebkr"
!define MP_FILEEXTS "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts"

!macro MP_DropLegacyValue key
  DeleteRegValue HKCU "${key}" "${MP_LEGACY_BOOK_PROGID}"
  DeleteRegValue HKCU "${key}" "${MP_LEGACY_PIC_PROGID}"
  DeleteRegValue HKCU "${key}" "${MP_LEGACY_LIB_PROGID}"
!macroend

; $0 is free here: the hooks run between Tauri's own steps.
!macro MP_DropLegacyExt ext
  ReadRegStr $0 HKCU "Software\Classes\${ext}" ""
  ${If} $0 == "${MP_LEGACY_BOOK_PROGID}"
  ${OrIf} $0 == "${MP_LEGACY_PIC_PROGID}"
  ${OrIf} $0 == "${MP_LEGACY_LIB_PROGID}"
    DeleteRegValue HKCU "Software\Classes\${ext}" ""
  ${EndIf}
  !insertmacro MP_DropLegacyValue "Software\Classes\${ext}\OpenWithProgids"
  !insertmacro MP_DropLegacyValue "${MP_FILEEXTS}\${ext}\OpenWithProgids"
  ; Default Programs entries that name a removed ProgID.
  ReadRegStr $0 HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" "${ext}"
  ${If} $0 == "${MP_LEGACY_BOOK_PROGID}"
  ${OrIf} $0 == "${MP_LEGACY_PIC_PROGID}"
  ${OrIf} $0 == "${MP_LEGACY_LIB_PROGID}"
    DeleteRegValue HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" "${ext}"
    ; Its "supported type" claim went with it; NSIS_HOOK_POSTINSTALL writes
    ; back the ones this build really registers.
    DeleteRegValue HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${ext}"
  ${EndIf}
!macroend

; Every extension the earlier build registered (its installer.nsh lists).
!macro MP_RemoveLegacyAssociations
  !insertmacro MP_DropLegacyExt ".epub"
  !insertmacro MP_DropLegacyExt ".pdf"
  !insertmacro MP_DropLegacyExt ".djvu"
  !insertmacro MP_DropLegacyExt ".djv"
  !insertmacro MP_DropLegacyExt ".mobi"
  !insertmacro MP_DropLegacyExt ".prc"
  !insertmacro MP_DropLegacyExt ".azw"
  !insertmacro MP_DropLegacyExt ".azw3"
  !insertmacro MP_DropLegacyExt ".fb2"
  !insertmacro MP_DropLegacyExt ".cbz"
  !insertmacro MP_DropLegacyExt ".cbr"
  !insertmacro MP_DropLegacyExt ".md"
  !insertmacro MP_DropLegacyExt ".markdown"
  !insertmacro MP_DropLegacyExt ".mdown"
  !insertmacro MP_DropLegacyExt ".html"
  !insertmacro MP_DropLegacyExt ".htm"
  !insertmacro MP_DropLegacyExt ".xhtml"
  !insertmacro MP_DropLegacyExt ".txt"
  !insertmacro MP_DropLegacyExt ".text"
  !insertmacro MP_DropLegacyExt ".log"
  !insertmacro MP_DropLegacyExt ".jpg"
  !insertmacro MP_DropLegacyExt ".jpeg"
  !insertmacro MP_DropLegacyExt ".jpe"
  !insertmacro MP_DropLegacyExt ".png"
  !insertmacro MP_DropLegacyExt ".gif"
  !insertmacro MP_DropLegacyExt ".webp"
  !insertmacro MP_DropLegacyExt ".bmp"
  !insertmacro MP_DropLegacyExt ".avif"
  !insertmacro MP_DropLegacyExt ".svg"
  !insertmacro MP_DropLegacyExt ".tif"
  !insertmacro MP_DropLegacyExt ".tiff"
  !insertmacro MP_DropLegacyExt ".heic"
  !insertmacro MP_DropLegacyExt ".heif"
  !insertmacro MP_DropLegacyExt ".ico"
  !insertmacro MP_DropLegacyExt ".dcm"
  !insertmacro MP_DropLegacyExt ".dicom"
  !insertmacro MP_DropLegacyExt "${MP_LEGACY_LIB_EXT}"

  ; The library type belonged to that build alone.
  ReadRegStr $0 HKCU "Software\Classes\${MP_LEGACY_LIB_EXT}" "Content Type"
  ${If} $0 == "application/x-myebookreader-library"
    DeleteRegKey HKCU "Software\Classes\${MP_LEGACY_LIB_EXT}"
  ${EndIf}
  DeleteRegValue HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${MP_LEGACY_LIB_EXT}"
  DeleteRegKey HKCU "Software\Classes\${MP_LEGACY_BOOK_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${MP_LEGACY_PIC_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${MP_LEGACY_LIB_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${MP_LEGACY_LIB_PROGID2}"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; An update (/UPDATE) only replaces the program files.
  ${If} $UpdateMode <> 1
    Call MP_RemoveElectron
    Call MP_AskAboutData
    !insertmacro MP_RemoveLegacyAssociations
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

  ; ── The app's own document type (.ebkvw), with its own icon ──
  ; Tauri registers the type (bundle.fileAssociations); this gives it the
  ; document icon instead of the program's.
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}" "" "MyEBookReader Workspace"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}" "FriendlyTypeName" "MyEBookReader Workspace"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}\DefaultIcon" "" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_WS_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\${MP_WS_EXT}" "" "${MP_WS_PROGID}"
  WriteRegStr HKCU "Software\Classes\${MP_WS_EXT}" "Content Type" "application/x-myebookreader-workspace"
  WriteRegStr HKCU "Software\Classes\${MP_WS_EXT}\OpenWithProgids" "${MP_WS_PROGID}" ""

  ; ── E-books ──
  WriteRegStr HKCU "Software\Classes\${MP_BOOK_PROGID}" "" "E-book"
  WriteRegStr HKCU "Software\Classes\${MP_BOOK_PROGID}" "FriendlyTypeName" "E-book"
  WriteRegStr HKCU "Software\Classes\${MP_BOOK_PROGID}" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_BOOK_PROGID}\DefaultIcon" "" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_BOOK_PROGID}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_BOOK_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  !insertmacro MP_RegisterBookExt ".epub"
  !insertmacro MP_RegisterBookExt ".mobi"
  !insertmacro MP_RegisterBookExt ".azw"
  !insertmacro MP_RegisterBookExt ".azw3"
  !insertmacro MP_RegisterBookExt ".djvu"
  !insertmacro MP_RegisterBookExt ".djv"
  !insertmacro MP_RegisterBookExt ".fb2"
  !insertmacro MP_RegisterBookExt ".cbz"

  ; ── PDF: only offered in "Open with" ──
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}" "" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}" "FriendlyTypeName" "PDF Document"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}\DefaultIcon" "" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}\shell\open" "" "Open with ${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\${MP_PDF_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "${MP_PDF_PROGID}" ""

  ; ── Markdown, text and ZIP archives of pictures: offered, with their own icons ──
  !insertmacro MP_WriteDocProgId "${MP_MD_PROGID}" "Markdown Document" "markdown.ico"
  !insertmacro MP_WriteDocProgId "${MP_TXT_PROGID}" "Text Document" "text.ico"
  !insertmacro MP_WriteDocProgId "${MP_ZIP_PROGID}" "ZIP Archive (pictures)" "zip.ico"
  !insertmacro MP_OfferExt ".md" "${MP_MD_PROGID}"
  !insertmacro MP_OfferExt ".markdown" "${MP_MD_PROGID}"
  !insertmacro MP_OfferExt ".mdown" "${MP_MD_PROGID}"
  !insertmacro MP_OfferExt ".txt" "${MP_TXT_PROGID}"
  !insertmacro MP_OfferExt ".text" "${MP_TXT_PROGID}"
  !insertmacro MP_OfferExt ".zip" "${MP_ZIP_PROGID}"

  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${MP_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" "${MP_WS_EXT}" ""

  ; ── Default Programs: what puts MyEBookReader in Settings → "Default apps" ──
  ; Without these keys the app cannot be picked as the default at all, so they
  ; are written whether or not the box was ticked.
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationName" "${MP_NAME}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationDescription" "E-book reader"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities" "ApplicationIcon" "$INSTDIR\file.ico,0"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" ".pdf" "${MP_PDF_PROGID}"
  WriteRegStr HKCU "Software\${MP_NAME}\Capabilities\FileAssociations" "${MP_WS_EXT}" "${MP_WS_PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${MP_NAME}" "Software\${MP_NAME}\Capabilities"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ${If} $MP_DefaultBookState == ${BST_CHECKED}
    ; The hash-protected UserChoice key can only be changed by the user, so
    ; hand them the Settings page for this app (Windows 10 1803+). Last, so the
    ; window does not appear on top of the remaining install steps.
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.epub\UserChoice" "ProgId"
    ${If} $0 != ""
    ${AndIf} $0 != "${MP_BOOK_PROGID}"
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

    ; Where we are still the default, hand the extension back to the shell
    ; rather than leaving it pointing at a ProgID that is about to go.
    !insertmacro MP_UnregisterBookExt ".epub"
    !insertmacro MP_UnregisterBookExt ".mobi"
    !insertmacro MP_UnregisterBookExt ".azw"
    !insertmacro MP_UnregisterBookExt ".azw3"
    !insertmacro MP_UnregisterBookExt ".djvu"
    !insertmacro MP_UnregisterBookExt ".djv"
    !insertmacro MP_UnregisterBookExt ".fb2"
    !insertmacro MP_UnregisterBookExt ".cbz"

    DeleteRegKey HKCU "Software\Classes\${MP_WS_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_BOOK_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_PDF_PROGID}"
    !insertmacro MP_WithdrawExt ".md" "${MP_MD_PROGID}"
    !insertmacro MP_WithdrawExt ".markdown" "${MP_MD_PROGID}"
    !insertmacro MP_WithdrawExt ".mdown" "${MP_MD_PROGID}"
    !insertmacro MP_WithdrawExt ".txt" "${MP_TXT_PROGID}"
    !insertmacro MP_WithdrawExt ".text" "${MP_TXT_PROGID}"
    !insertmacro MP_WithdrawExt ".zip" "${MP_ZIP_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_MD_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_TXT_PROGID}"
    DeleteRegKey HKCU "Software\Classes\${MP_ZIP_PROGID}"
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
