; Custom NSIS script for MyEBookReader
;
;  • adds a page letting the user choose Desktop / Start Menu shortcuts
;    (bilingual — Korean when the installer runs in Korean, English otherwise)
;  • registers the .ebkr document type with its own icon (electron-builder
;    writes the association itself; here we make sure the icon, the friendly
;    name and the shell verbs are exactly what we want)
;  • adds MyEBookReader to the "Open with" list, and to the Windows
;    "Default apps" list, for every format it reads — books, documents and
;    pictures alike — and, only if the user ticks a box on that page, makes it
;    the default for the book formats, the picture formats, or both
;  • asks before deleting the data an earlier installation left behind
;
; On making MyEBookReader the default for a format:
;   Since Windows 8 the actual default lives in a hash-protected UserChoice key
;   that no installer may write; Windows resets any forged value. What an
;   installer *can* do is what this script does:
;     1. register the app under Default Programs (RegisteredApplications +
;        Capabilities\FileAssociations), which is what puts MyEBookReader in the
;        Settings → "Default apps" list at all;
;     2. point the per-user ProgID at MyEBookReader, which takes effect on
;        machines where no UserChoice has been made yet;
;     3. open the Settings page for this app so one click confirms the change
;        where a UserChoice already exists.
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define LIB_EXT ".ebkr"
!define LIB_PROGID "MyEBookReader.Library"
; The ProgID every readable format points at. The name still says EPUB because
; that is what earlier versions wrote, and changing it would orphan the
; registrations they left behind; it stands for "a file MyEBookReader reads".
!define BOOK_PROGID "MyEBookReader.EPUB"
!define PIC_PROGID "MyEBookReader.Picture"

; ── Every format the reader opens, in one place ────────────────────────────
;
; Four things are done with these lists — the "Open with" entries, the
; Default Programs capabilities, the opt-in defaults and the uninstall
; cleanup — and each used to spell its own subset out by hand, which is how
; PDF ended up offered in "Open with" but missing from Default Programs, and
; how everything past CBZ was offered nowhere at all. One list each now, walked
; by whichever action is wanted. Keep them in step with BOOK_EXTENSIONS in
; src/lib/book.js and OPENABLE_EXTENSIONS in electron/folder-list.js.
!macro EbkEachBookFormat ACTION
  !insertmacro ${ACTION} ".epub"
  !insertmacro ${ACTION} ".pdf"
  !insertmacro ${ACTION} ".mobi"
  !insertmacro ${ACTION} ".prc"
  !insertmacro ${ACTION} ".azw"
  !insertmacro ${ACTION} ".azw3"
  !insertmacro ${ACTION} ".fb2"
  !insertmacro ${ACTION} ".cbz"
  !insertmacro ${ACTION} ".cbr"
  !insertmacro ${ACTION} ".md"
  !insertmacro ${ACTION} ".markdown"
  !insertmacro ${ACTION} ".mdown"
  !insertmacro ${ACTION} ".html"
  !insertmacro ${ACTION} ".htm"
  !insertmacro ${ACTION} ".xhtml"
  !insertmacro ${ACTION} ".txt"
  !insertmacro ${ACTION} ".text"
  !insertmacro ${ACTION} ".log"
!macroend

!macro EbkEachPictureFormat ACTION
  !insertmacro ${ACTION} ".jpg"
  !insertmacro ${ACTION} ".jpeg"
  !insertmacro ${ACTION} ".jpe"
  !insertmacro ${ACTION} ".png"
  !insertmacro ${ACTION} ".gif"
  !insertmacro ${ACTION} ".webp"
  !insertmacro ${ACTION} ".bmp"
  !insertmacro ${ACTION} ".avif"
  !insertmacro ${ACTION} ".svg"
  !insertmacro ${ACTION} ".tif"
  !insertmacro ${ACTION} ".tiff"
  !insertmacro ${ACTION} ".heic"
  !insertmacro ${ACTION} ".heif"
  !insertmacro ${ACTION} ".ico"
  !insertmacro ${ACTION} ".dcm"
  !insertmacro ${ACTION} ".dicom"
!macroend

; ── What is done to one extension ──────────────────────────────────────────
; Each of these is handed to EbkEachBookFormat / EbkEachPictureFormat above.

; Offered in "Open with", and listed as a type this application supports.
!macro EbkOpenWithBook EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${BOOK_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}" ""
!macroend
!macro EbkOpenWithPicture EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PIC_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}" ""
!macroend

; Declared under Default Programs, which is what puts the format in the
; Windows "Default apps" page so the reader can choose it there later.
!macro EbkCapabilityBook EXT
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities\FileAssociations" "${EXT}" "${BOOK_PROGID}"
!macroend
!macro EbkCapabilityPicture EXT
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities\FileAssociations" "${EXT}" "${PIC_PROGID}"
!macroend

; Pointed at us by default. Takes effect on a machine where nothing has been
; chosen for that extension yet — see the note at the top about UserChoice.
!macro EbkMakeDefaultBook EXT
  WriteRegStr HKCU "Software\Classes\${EXT}" "" "${BOOK_PROGID}"
!macroend
!macro EbkMakeDefaultPicture EXT
  WriteRegStr HKCU "Software\Classes\${EXT}" "" "${PIC_PROGID}"
!macroend

; Handed back on uninstall: the "Open with" entry goes, and the extension is
; only released if it is still pointing at a ProgID that is about to vanish.
!macro EbkUnregisterBook EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "${BOOK_PROGID}"
  ReadRegStr $0 HKCU "Software\Classes\${EXT}" ""
  ${If} $0 == "${BOOK_PROGID}"
    DeleteRegValue HKCU "Software\Classes\${EXT}" ""
  ${EndIf}
!macroend
!macro EbkUnregisterPicture EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PIC_PROGID}"
  ReadRegStr $0 HKCU "Software\Classes\${EXT}" ""
  ${If} $0 == "${PIC_PROGID}"
    DeleteRegValue HKCU "Software\Classes\${EXT}" ""
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DefaultBooksCheckbox
Var DefaultPicturesCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var DoSetDefaultBooks
Var DoSetDefaultPictures

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"
  ; Taking a format over is opt-in, and off to begin with: an installer should
  ; not silently replace whichever reader — or browser, or picture viewer —
  ; the user already chose.
  StrCpy $DoSetDefaultBooks "0"
  StrCpy $DoSetDefaultPictures "0"
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
    ${NSD_CreateCheckbox} 0 70u 100% 12u "책·문서 형식의 기본 프로그램으로 설정 (EPUB·PDF·MOBI·AZW·FB2·CBZ·CBR·Markdown·HTML·텍스트)"
    Pop $DefaultBooksCheckbox
    ${NSD_CreateCheckbox} 0 88u 100% 12u "그림 형식의 기본 프로그램으로 설정 (JPG·PNG·GIF·WEBP·BMP·AVIF·SVG·TIFF·HEIC·ICO·DICOM)"
    Pop $DefaultPicturesCheckbox
    ${NSD_CreateLabel} 0 106u 100% 52u "읽을 수 있는 모든 형식이 [연결 프로그램] 목록과 Windows [기본 앱] 목록에 등록됩니다. 위 두 항목을 선택하지 않아도 나중에 [기본 앱]에서 직접 고를 수 있습니다.$\r$\n기본 프로그램으로 설정을 선택했는데 이미 다른 프로그램이 기본으로 지정되어 있으면 Windows [기본 앱] 설정 창이 열립니다. 마지막 확인은 Windows 정책상 사용자가 직접 해야 합니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts and file associations to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateCheckbox} 0 70u 100% 12u "Make it the default for books and documents (EPUB, PDF, MOBI, AZW, FB2, CBZ, CBR, Markdown, HTML, text)"
    Pop $DefaultBooksCheckbox
    ${NSD_CreateCheckbox} 0 88u 100% 12u "Make it the default for pictures (JPG, PNG, GIF, WEBP, BMP, AVIF, SVG, TIFF, HEIC, ICO, DICOM)"
    Pop $DefaultPicturesCheckbox
    ${NSD_CreateLabel} 0 106u 100% 52u "Every format MyEBookReader reads is added to the 'Open with' list and to the Windows 'Default apps' list. You can pick it there later whether or not you tick these boxes.$\r$\nIf you do tick one and another application is already the default, Windows Settings will open on the 'Default apps' page — Windows requires you to confirm that last step yourself."
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

  ${NSD_GetState} $DefaultBooksCheckbox $0
  ${If} $0 == 1
    StrCpy $DoSetDefaultBooks "1"
  ${Else}
    StrCpy $DoSetDefaultBooks "0"
  ${EndIf}

  ${NSD_GetState} $DefaultPicturesCheckbox $0
  ${If} $0 == 1
    StrCpy $DoSetDefaultPictures "1"
  ${Else}
    StrCpy $DoSetDefaultPictures "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; ── Data left behind by an earlier installation ─────────
  ; The program files themselves are already gone: electron-builder runs the
  ; previous version's uninstaller (which does RMDir /r on its install dir)
  ; before a single new file is copied, so every install is a clean one.
  ;
  ; It hands that uninstaller the --updated flag, which is what stops it acting
  ; on our `deleteAppDataOnUninstall` setting — so the settings, recent-book
  ; list, reading positions and window state survive to here. Throwing them away
  ; is the user's decision, so ask, and only when there is something to delete.
  SetShellVarContext current
  StrCpy $0 "0"
  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\MyEBookReader\*.*"
    StrCpy $0 "1"
  ${EndIf}

  ${If} $0 == "1"
    ${If} $LANGUAGE == 1042
      StrCpy $1 "이전에 설치된 ${PRODUCT_NAME} 의 데이터가 남아 있습니다.$\r$\n(설정, 최근 파일 목록, 읽던 위치, 창 상태)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
    ${Else}
      StrCpy $1 "Data from a previous ${PRODUCT_NAME} installation is still on this PC.$\r$\n(settings, recent books, reading positions, window state)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
    ${EndIf}
    ; Silent installs keep the data — an unattended run must never destroy it.
    MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES EbkWipeData IDNO EbkKeepData
    EbkWipeData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
      ; And under the name the program used to have, which is where an
      ; installation from before the rename left its data.
      RMDir /r "$APPDATA\MyEBookReader"
      RMDir /r "$LOCALAPPDATA\MyEBookReader"
    EbkKeepData:
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

  ; ── The app's own document type (.ebkr), with its own icon ──
  WriteRegStr HKCU "Software\Classes\${LIB_PROGID}" "" "${PRODUCT_NAME} Reading File"
  WriteRegStr HKCU "Software\Classes\${LIB_PROGID}" "FriendlyTypeName" "${PRODUCT_NAME} Reading File"
  ; file.ico is shipped verbatim as an extraResource so the shell can read it
  ; (icons inside app.asar are not addressable by Explorer).
  WriteRegStr HKCU "Software\Classes\${LIB_PROGID}\DefaultIcon" "" "$INSTDIR\resources\file.ico,0"
  WriteRegStr HKCU "Software\Classes\${LIB_PROGID}\shell\open" "" "Open with ${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${LIB_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${LIB_EXT}" "" "${LIB_PROGID}"
  WriteRegStr HKCU "Software\Classes\${LIB_EXT}" "Content Type" "application/x-myebookreader-library"
  WriteRegStr HKCU "Software\Classes\${LIB_EXT}\OpenWithProgids" "${LIB_PROGID}" ""

  ; ── Everything the reader opens: always offered in "Open with" ──
  ; Two document types rather than one, so that Explorer and the Default apps
  ; page can call a book a book and a picture a picture.
  WriteRegStr HKCU "Software\Classes\${BOOK_PROGID}" "" "E-book or document"
  WriteRegStr HKCU "Software\Classes\${BOOK_PROGID}" "FriendlyTypeName" "E-book or document"
  WriteRegStr HKCU "Software\Classes\${BOOK_PROGID}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${BOOK_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${BOOK_PROGID}\shell\open" "" "Open with ${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${BOOK_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\${PIC_PROGID}" "" "Picture"
  WriteRegStr HKCU "Software\Classes\${PIC_PROGID}" "FriendlyTypeName" "Picture"
  WriteRegStr HKCU "Software\Classes\${PIC_PROGID}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${PIC_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${PIC_PROGID}\shell\open" "" "Open with ${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\${PIC_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${LIB_EXT}" ""

  !insertmacro EbkEachBookFormat EbkOpenWithBook
  !insertmacro EbkEachPictureFormat EbkOpenWithPicture

  ; ── Default Programs: what puts MyEBookReader in Settings → "Default apps" ──
  ; Without these keys the app cannot be picked as the default at all, so they
  ; are written whether or not the box was ticked.
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities" "ApplicationDescription" "${APP_DESCRIPTION}"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  !insertmacro EbkEachBookFormat EbkCapabilityBook
  !insertmacro EbkEachPictureFormat EbkCapabilityPicture
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Capabilities\FileAssociations" "${LIB_EXT}" "${LIB_PROGID}"
  WriteRegStr HKCU "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\${PRODUCT_NAME}\Capabilities"

  ; Takes effect immediately on a machine that has never had a default chosen
  ; for that extension; where a UserChoice exists Windows keeps honouring that
  ; instead, which is what the Settings page below is for.
  ${If} $DoSetDefaultBooks == "1"
    !insertmacro EbkEachBookFormat EbkMakeDefaultBook
    WriteRegStr HKCU "Software\Classes\.epub" "Content Type" "application/epub+zip"
    WriteRegStr HKCU "Software\Classes\.pdf" "Content Type" "application/pdf"
  ${EndIf}
  ${If} $DoSetDefaultPictures == "1"
    !insertmacro EbkEachPictureFormat EbkMakeDefaultPicture
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'

  ${If} $DoSetDefaultBooks == "1"
  ${OrIf} $DoSetDefaultPictures == "1"
    ; The hash-protected UserChoice key can only be changed by the user, so
    ; hand them the Settings page for this app (Windows 10 1803+). Last, so the
    ; window does not appear on top of the remaining install steps. EPUB stands
    ; for the book formats and JPG for the pictures: if either is already spoken
    ; for by something else, the page is worth opening.
    StrCpy $1 "0"
    ${If} $DoSetDefaultBooks == "1"
      ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.epub\UserChoice" "ProgId"
      ${If} $0 != ""
      ${AndIf} $0 != "${BOOK_PROGID}"
        StrCpy $1 "1"
      ${EndIf}
    ${EndIf}
    ${If} $DoSetDefaultPictures == "1"
      ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoice" "ProgId"
      ${If} $0 != ""
      ${AndIf} $0 != "${PIC_PROGID}"
        StrCpy $1 "1"
      ${EndIf}
    ${EndIf}
    ${If} $1 == "1"
      ExecShell "open" "ms-settings:defaultapps?registeredAppName=${PRODUCT_NAME}"
    ${EndIf}
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"

  ; Every extension is handed back to the shell: the "Open with" entry goes,
  ; and an extension still pointing at one of our ProgIDs is released rather
  ; than left aimed at a document type that is about to disappear.
  !insertmacro EbkEachBookFormat EbkUnregisterBook
  !insertmacro EbkEachPictureFormat EbkUnregisterPicture

  DeleteRegKey HKCU "Software\Classes\${LIB_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${BOOK_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${PIC_PROGID}"
  DeleteRegValue HKCU "Software\Classes\${LIB_EXT}\OpenWithProgids" "${LIB_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${LIB_EXT}"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"

  DeleteRegValue HKCU "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}"

  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
