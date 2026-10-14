; MyPhotoManager installer hooks (included by Tauri's NSIS template).
;
; Before installing:
;  1. Saved data from a previous installation (catalog database, settings,
;     thumbnail cache, backups of edited originals) - the user is asked
;     whether to delete it.
;     %APPDATA%\${BUNDLEID}       catalog.json, originals\, window place
;     %LOCALAPPDATA%\${BUNDLEID}  WebView2 profile (settings, thumbnail cache)
;  2. A previous installation is always removed completely (its uninstaller
;     runs silently, then its folder is deleted) before the new files go in.
; After installing:
;  3. MyPhotoManager is offered in "Open with" for image files. It never takes
;     over the default program: only OpenWithProgids / SupportedTypes entries
;     are written, which the uninstaller removes again.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!macro MYPHOTO_ASSOC EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "MyPhotoManager.Image" ""
  WriteRegStr SHCTX "Software\Classes\Applications\MyPhotoManager.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro MYPHOTO_UNASSOC EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "MyPhotoManager.Image"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; 1. Saved data
  ${If} ${FileExists} "$APPDATA\${BUNDLEID}\*.*"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\${BUNDLEID}\*.*"
    ${If} $PassiveMode <> 1
    ${AndIfNot} ${Silent}
      StrCpy $R8 "Saved data from a previous MyPhotoManager installation was found (catalog: ratings, labels, keywords; settings; thumbnail cache; backups of edited originals). Do you want to delete it?"
      ${If} $LANGUAGE == 1042
        StrCpy $R8 "이전에 설치한 MyPhotoManager 가 저장한 데이터(카탈로그: 별점·색상 레이블·키워드, 설정, 미리 보기 캐시, 편집 전 원본 백업)가 있습니다. 삭제하시겠습니까?"
      ${EndIf}
      MessageBox MB_YESNO|MB_ICONQUESTION $R8 IDNO myphoto_keep_data
        RMDir /r "$APPDATA\${BUNDLEID}"
        RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
      myphoto_keep_data:
    ${EndIf}
  ${EndIf}

  ; 2. Previous installation
  ReadRegStr $R6 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $R6 != ""
  ${AndIf} ${FileExists} "$R6\uninstall.exe"
    DetailPrint "Removing the previous installation: $R6"
    ExecWait '"$R6\uninstall.exe" /S _?=$R6' $R5
    Delete "$R6\uninstall.exe"
    ; Only a folder of our own is deleted as a whole.
    ${GetFileName} "$R6" $R4
    ${If} $R4 == "${PRODUCTNAME}"
      RMDir /r "$R6"
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 3. "Open with" for images
  WriteRegStr SHCTX "Software\Classes\MyPhotoManager.Image" "" "MyPhotoManager Image"
  WriteRegStr SHCTX "Software\Classes\MyPhotoManager.Image\DefaultIcon" "" "$INSTDIR\MyPhotoManager.exe,0"
  WriteRegStr SHCTX "Software\Classes\MyPhotoManager.Image\shell\open\command" "" '"$INSTDIR\MyPhotoManager.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\MyPhotoManager.exe" "FriendlyAppName" "MyPhotoManager"
  WriteRegStr SHCTX "Software\Classes\Applications\MyPhotoManager.exe\shell\open\command" "" '"$INSTDIR\MyPhotoManager.exe" "%1"'
  !insertmacro MYPHOTO_ASSOC "jpg"
  !insertmacro MYPHOTO_ASSOC "jpeg"
  !insertmacro MYPHOTO_ASSOC "jpe"
  !insertmacro MYPHOTO_ASSOC "jfif"
  !insertmacro MYPHOTO_ASSOC "png"
  !insertmacro MYPHOTO_ASSOC "gif"
  !insertmacro MYPHOTO_ASSOC "webp"
  !insertmacro MYPHOTO_ASSOC "avif"
  !insertmacro MYPHOTO_ASSOC "bmp"
  !insertmacro MYPHOTO_ASSOC "dib"
  !insertmacro MYPHOTO_ASSOC "tif"
  !insertmacro MYPHOTO_ASSOC "tiff"
  !insertmacro MYPHOTO_ASSOC "heic"
  !insertmacro MYPHOTO_ASSOC "heif"
  !insertmacro MYPHOTO_ASSOC "hif"
  !insertmacro MYPHOTO_ASSOC "psd"
  !insertmacro MYPHOTO_ASSOC "ico"
  !insertmacro MYPHOTO_ASSOC "svg"
  !insertmacro MYPHOTO_ASSOC "dng"
  !insertmacro MYPHOTO_ASSOC "cr2"
  !insertmacro MYPHOTO_ASSOC "cr3"
  !insertmacro MYPHOTO_ASSOC "nef"
  !insertmacro MYPHOTO_ASSOC "nrw"
  !insertmacro MYPHOTO_ASSOC "arw"
  !insertmacro MYPHOTO_ASSOC "srf"
  !insertmacro MYPHOTO_ASSOC "sr2"
  !insertmacro MYPHOTO_ASSOC "orf"
  !insertmacro MYPHOTO_ASSOC "rw2"
  !insertmacro MYPHOTO_ASSOC "raf"
  !insertmacro MYPHOTO_ASSOC "pef"
  !insertmacro MYPHOTO_ASSOC "srw"
  !insertmacro MYPHOTO_ASSOC "x3f"
  !insertmacro MYPHOTO_ASSOC "3fr"
  !insertmacro MYPHOTO_ASSOC "erf"
  !insertmacro MYPHOTO_ASSOC "kdc"
  !insertmacro MYPHOTO_ASSOC "mrw"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MYPHOTO_UNASSOC "jpg"
  !insertmacro MYPHOTO_UNASSOC "jpeg"
  !insertmacro MYPHOTO_UNASSOC "jpe"
  !insertmacro MYPHOTO_UNASSOC "jfif"
  !insertmacro MYPHOTO_UNASSOC "png"
  !insertmacro MYPHOTO_UNASSOC "gif"
  !insertmacro MYPHOTO_UNASSOC "webp"
  !insertmacro MYPHOTO_UNASSOC "avif"
  !insertmacro MYPHOTO_UNASSOC "bmp"
  !insertmacro MYPHOTO_UNASSOC "dib"
  !insertmacro MYPHOTO_UNASSOC "tif"
  !insertmacro MYPHOTO_UNASSOC "tiff"
  !insertmacro MYPHOTO_UNASSOC "heic"
  !insertmacro MYPHOTO_UNASSOC "heif"
  !insertmacro MYPHOTO_UNASSOC "hif"
  !insertmacro MYPHOTO_UNASSOC "psd"
  !insertmacro MYPHOTO_UNASSOC "ico"
  !insertmacro MYPHOTO_UNASSOC "svg"
  !insertmacro MYPHOTO_UNASSOC "dng"
  !insertmacro MYPHOTO_UNASSOC "cr2"
  !insertmacro MYPHOTO_UNASSOC "cr3"
  !insertmacro MYPHOTO_UNASSOC "nef"
  !insertmacro MYPHOTO_UNASSOC "nrw"
  !insertmacro MYPHOTO_UNASSOC "arw"
  !insertmacro MYPHOTO_UNASSOC "srf"
  !insertmacro MYPHOTO_UNASSOC "sr2"
  !insertmacro MYPHOTO_UNASSOC "orf"
  !insertmacro MYPHOTO_UNASSOC "rw2"
  !insertmacro MYPHOTO_UNASSOC "raf"
  !insertmacro MYPHOTO_UNASSOC "pef"
  !insertmacro MYPHOTO_UNASSOC "srw"
  !insertmacro MYPHOTO_UNASSOC "x3f"
  !insertmacro MYPHOTO_UNASSOC "3fr"
  !insertmacro MYPHOTO_UNASSOC "erf"
  !insertmacro MYPHOTO_UNASSOC "kdc"
  !insertmacro MYPHOTO_UNASSOC "mrw"
  DeleteRegKey SHCTX "Software\Classes\MyPhotoManager.Image"
  DeleteRegKey SHCTX "Software\Classes\Applications\MyPhotoManager.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
