; MyImageViewer installer hooks (included by Tauri's NSIS template).
;
; Before the new files go in (after the user pressed Install):
;  1. Saved data of a previous installation is found -> the user is asked whether to delete it:
;       %APPDATA%\image-viewer-multios     settings, thumbnail DB, converted media cache
;                                          (shared with the Electron "Image Viewer" builds)
;       %LOCALAPPDATA%\${BUNDLEID}         WebView2 profile (window state, local settings)
;       %LOCALAPPDATA%\image-viewer-multios-updater   Electron update cache
;  2. A previous MyImageViewer (this Tauri build) is removed completely: its uninstaller runs
;     silently, then its folder is deleted.
;  3. A previous Electron "Image Viewer" (same app id com.shkwon.imageviewer, per-user or
;     per-machine) is removed with its own quiet uninstaller; we wait until it is gone.
; Uninstall: the uninstaller's "delete app data" box also removes the data folders above.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

; Electron-builder's uninstall key = UUIDv5(appId "com.shkwon.imageviewer")
!define MIV_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\53fff549-80b5-525f-a34e-7d99abc7f4b6"
!define MIV_DATA_DIR "$APPDATA\image-viewer-multios"
!define MIV_UPDATER_DIR "$LOCALAPPDATA\image-viewer-multios-updater"

; Run the Electron uninstaller found under ROOT (HKCU / HKLM), then wait until its key is gone.
!macro MIV_REMOVE_ELECTRON ROOT ARGS
  ReadRegStr $R7 ${ROOT} "${MIV_ELECTRON_KEY}" "UninstallString"
  ${If} $R7 != ""
    ; UninstallString = "C:\...\Uninstall Image Viewer.exe" /allusers  -> take the quoted path
    StrCpy $R6 $R7 1
    ${If} $R6 == '"'
      StrCpy $R5 1
      miv_scan_${ROOT}:
        StrCpy $R6 $R7 1 $R5
        StrCmp $R6 '"' miv_scanned_${ROOT}
        StrCmp $R6 "" miv_scanned_${ROOT}
        IntOp $R5 $R5 + 1
        Goto miv_scan_${ROOT}
      miv_scanned_${ROOT}:
      IntOp $R5 $R5 - 1
      StrCpy $R7 $R7 $R5 1
    ${EndIf}
    ${If} ${FileExists} "$R7"
      DetailPrint "Removing the previous Image Viewer (Electron): $R7"
      ; ShellExecute, not CreateProcess: a per-machine uninstaller needs elevation (UAC prompt)
      ExecShellWait "open" "$R7" "${ARGS}"
      ; It re-launches itself from %TEMP%, so wait for the key to go (up to ~60 s)
      StrCpy $R4 0
      miv_wait_${ROOT}:
        ReadRegStr $R6 ${ROOT} "${MIV_ELECTRON_KEY}" "UninstallString"
        StrCmp $R6 "" miv_done_${ROOT}
        IntOp $R4 $R4 + 1
        IntCmp $R4 120 miv_done_${ROOT}
        Sleep 500
        Goto miv_wait_${ROOT}
      miv_done_${ROOT}:
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; 1. Saved data
  ${If} ${FileExists} "${MIV_DATA_DIR}\*.*"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\${BUNDLEID}\*.*"
  ${OrIf} ${FileExists} "${MIV_UPDATER_DIR}\*.*"
    ${If} $PassiveMode <> 1
    ${AndIfNot} ${Silent}
      StrCpy $R8 "Saved data from a previous MyImageViewer / Image Viewer installation was found (settings, recent folders, thumbnail database, converted media cache).$\r$\n$\r$\nDo you want to delete it?$\r$\n$\r$\nYes: start with clean settings.   No: keep it."
      ${If} $LANGUAGE == 1042
        StrCpy $R8 "이전에 설치한 MyImageViewer / Image Viewer 가 저장한 사용자 데이터(설정, 최근 폴더, 썸네일 DB, 변환한 동영상·오디오 캐시)가 있습니다.$\r$\n$\r$\n삭제하시겠습니까?$\r$\n$\r$\n예: 설정을 처음부터 시작합니다.   아니요: 그대로 둡니다."
      ${EndIf}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 $R8 IDNO miv_keep_data
        DetailPrint "Deleting saved data"
        RMDir /r "${MIV_DATA_DIR}"
        RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
        RMDir /r "${MIV_UPDATER_DIR}"
      miv_keep_data:
    ${EndIf}
  ${EndIf}

  ; 2. Previous MyImageViewer (Tauri)
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

  ; 3. Previous Image Viewer (Electron), per-user or per-machine
  !insertmacro MIV_REMOVE_ELECTRON HKCU "/S /currentuser"
  !insertmacro MIV_REMOVE_ELECTRON HKLM "/S /allusers"

  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; The app's Node host (runtime\node.exe) goes on its own within ~2 s of the app; stop it
  ; now so its files are not locked when they are deleted
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\runtime\*' } | Stop-Process -Force"`
  Pop $R0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; "Delete app data" on the uninstaller's page: our data lives outside ${BUNDLEID} too
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RMDir /r "${MIV_DATA_DIR}"
    RMDir /r "${MIV_UPDATER_DIR}"
  ${EndIf}
!macroend
