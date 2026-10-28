; MyVideoPlayer installer additions (read by Tauri's NSIS template).
;
;  - The Electron build is removed before installing: its files, uninstall entry, shortcuts,
;    "Open with" registrations and Chromium caches. Its own uninstaller is NOT run, because it
;    deletes %APPDATA%\MyVideoPlayer (persist.json) and this build migrates settings from there.
;  - Uninstall with "delete app data" also deletes the Electron build's data folders.
;
;  - The installer always asks for its language (Korean / English) first. Without
;    MUI_LANGDLL_ALWAYSSHOW, NSIS remembers the first answer in the registry and never asks
;    again. The languages come from bundle.windows.nsis.languages; this file is included
;    before the template's MUI_LANGDLL_DISPLAY, so the defines below take effect.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.
;
; Functions here must not use the template's variables ($UpdateMode, ...): they are declared
; after this file is included. The hook macros at the bottom may, they expand inside Sections.

!define MUI_LANGDLL_ALWAYSSHOW
!define MUI_LANGDLL_WINDOWTITLE "MyVideoPlayer Setup / 설치"
!define MUI_LANGDLL_INFO "Please select the installer language.$\r$\n설치 언어를 선택하세요."

!define MVP_EXE "MyVideoPlayer.exe"
; electron-builder's per-user keys for appId com.shkwon.myvideoplayer
; (GUID = UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)).
!define MVP_ELECTRON_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\44e0e4c6-d712-5478-8fdc-abb27f0f5e8e"
!define MVP_ELECTRON_INSTALL_KEY "Software\44e0e4c6-d712-5478-8fdc-abb27f0f5e8e"
; Electron userData: packaged builds (product name) and unpackaged runs (package name).
!define MVP_DATA_DIR "MyVideoPlayer"
!define MVP_LEGACY_DATA_DIR "my-video-player-multios"

; "C:\dir\x.exe" /args -> C:\dir\x.exe   (in: $R0, out: $R0)
Function MVP_FirstQuoted
  StrCpy $R1 $R0 1
  ${If} $R1 == '"'
    StrCpy $R0 $R0 "" 1
    StrCpy $R2 0
    mvp_find_quote:
      StrCpy $R1 $R0 1 $R2
      StrCmp $R1 '"' mvp_quote_found
      StrCmp $R1 "" mvp_quote_found
      IntOp $R2 $R2 + 1
      Goto mvp_find_quote
    mvp_quote_found:
    StrCpy $R0 $R0 $R2
  ${EndIf}
FunctionEnd

; Chromium's folders inside an Electron userData folder; persist.json stays.
!macro MVP_RemoveChromiumCache dir
  RMDir /r "${dir}\Cache"
  RMDir /r "${dir}\Code Cache"
  RMDir /r "${dir}\GPUCache"
  RMDir /r "${dir}\DawnGraphiteCache"
  RMDir /r "${dir}\DawnWebGPUCache"
  RMDir /r "${dir}\Local Storage"
  RMDir /r "${dir}\Session Storage"
  RMDir /r "${dir}\Shared Dictionary"
  RMDir /r "${dir}\blob_storage"
  RMDir /r "${dir}\Network"
  RMDir /r "${dir}\Crashpad"
  RMDir /r "${dir}\Partitions"
  RMDir /r "${dir}\compat-cache"
  Delete "${dir}\Local State"
  Delete "${dir}\Preferences"
  Delete "${dir}\SharedStorage"
  Delete "${dir}\lockfile"
!macroend

; The Electron installer's own "Open with" entries (Tauri registers its own).
!macro MVP_RemoveElectronAssoc EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "MyVideoPlayer.${EXT}"
  DeleteRegKey HKCU "Software\Classes\MyVideoPlayer.${EXT}"
!macroend

Function MVP_RemoveElectron
  ReadRegStr $R0 HKCU "${MVP_ELECTRON_KEY}" "UninstallString"
  ${If} $R0 != ""
    Call MVP_FirstQuoted
    ${GetParent} $R0 $R6
    DetailPrint "Removing the Electron build of MyVideoPlayer: $R6"
    ; Never the folder being installed into right now.
    ${If} $R6 != ""
    ${AndIf} $R6 != $INSTDIR
      RMDir /r "$R6"
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "${MVP_ELECTRON_KEY}"
  DeleteRegKey HKCU "${MVP_ELECTRON_INSTALL_KEY}"
  ${If} "$LOCALAPPDATA\Programs\MyVideoPlayer" != $INSTDIR
    RMDir /r "$LOCALAPPDATA\Programs\MyVideoPlayer"
  ${EndIf}
  RMDir /r "$LOCALAPPDATA\my-video-player-multios-updater"

  DeleteRegValue HKCU "Software\RegisteredApplications" "MyVideoPlayer"
  DeleteRegKey HKCU "Software\MyVideoPlayer\Capabilities"
  DeleteRegKey HKCU "Software\Classes\Applications\${MVP_EXE}"
  !insertmacro MVP_RemoveElectronAssoc "mp4"
  !insertmacro MVP_RemoveElectronAssoc "m4v"
  !insertmacro MVP_RemoveElectronAssoc "webm"
  !insertmacro MVP_RemoveElectronAssoc "mkv"
  !insertmacro MVP_RemoveElectronAssoc "mov"
  !insertmacro MVP_RemoveElectronAssoc "avi"
  !insertmacro MVP_RemoveElectronAssoc "ogv"
  !insertmacro MVP_RemoveElectronAssoc "hevc"
  !insertmacro MVP_RemoveElectronAssoc "h265"
  !insertmacro MVP_RemoveElectronAssoc "mp3"
  !insertmacro MVP_RemoveElectronAssoc "aac"
  !insertmacro MVP_RemoveElectronAssoc "m4a"
  !insertmacro MVP_RemoveElectronAssoc "wav"
  !insertmacro MVP_RemoveElectronAssoc "flac"
  !insertmacro MVP_RemoveElectronAssoc "opus"
  !insertmacro MVP_RemoveElectronAssoc "ogg"
  !insertmacro MVP_RemoveElectronAssoc "wma"

  !insertmacro MVP_RemoveChromiumCache "$APPDATA\${MVP_DATA_DIR}"
  !insertmacro MVP_RemoveChromiumCache "$APPDATA\${MVP_LEGACY_DATA_DIR}"
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode <> 1
    Call MVP_RemoveElectron
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ${If} $DeleteAppDataCheckboxState = 1
      SetShellVarContext current
      RMDir /r "$APPDATA\${MVP_DATA_DIR}"
      RMDir /r "$APPDATA\${MVP_LEGACY_DATA_DIR}"
      RMDir /r "$TEMP\my-video-player-remote"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
