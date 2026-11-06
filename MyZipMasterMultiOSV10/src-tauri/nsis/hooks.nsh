; Ask for the installer's language every time, rather than only on the first install.
!define MUI_LANGDLL_ALWAYSSHOW

; Tauri registers each supported extension under its own ProgId and points them all at the program's
; icon. Each format gets its own document icon here. Uninstalling removes the ProgId with this in it.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.zip\DefaultIcon" "" "$INSTDIR\resources\file-icons\zip.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.7z\DefaultIcon" "" "$INSTDIR\resources\file-icons\7z.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.rar\DefaultIcon" "" "$INSTDIR\resources\file-icons\rar.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.tar\DefaultIcon" "" "$INSTDIR\resources\file-icons\tar.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.gz\DefaultIcon" "" "$INSTDIR\resources\file-icons\gz.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.bz2\DefaultIcon" "" "$INSTDIR\resources\file-icons\bz2.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.xz\DefaultIcon" "" "$INSTDIR\resources\file-icons\xz.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.zst\DefaultIcon" "" "$INSTDIR\resources\file-icons\zst.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.cab\DefaultIcon" "" "$INSTDIR\resources\file-icons\cab.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.iso\DefaultIcon" "" "$INSTDIR\resources\file-icons\iso.ico,0"
  WriteRegStr SHCTX "Software\Classes\MyZipMaster.part\DefaultIcon" "" "$INSTDIR\resources\file-icons\part.ico,0"
  ; The language chosen for this installer becomes the program's, until the user picks another.
  FileOpen $0 "$INSTDIR\install-language.txt" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
  ; The right-click menu, in the language just written. The program does this and leaves, windowless.
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --register-shell-menu'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unregister-shell-menu'
  Delete "$INSTDIR\install-language.txt"
!macroend
