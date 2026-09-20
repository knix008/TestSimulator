!include "LogicLib.nsh"

; ---------------------------------------------------------------------------
; Remove a previous NSIS/Tauri install recorded under ROOT_KEY (HKCU or HKLM).
; PRODUCT_KEY is the Uninstall registry subkey / product folder name.
; ---------------------------------------------------------------------------
!macro MMS_UNINSTALL_FROM_ROOT ROOT_KEY PRODUCT_KEY
  Push $R0
  Push $R1
  Push $R2
  Push $R3

  SetRegView 64
  ReadRegStr $R0 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_KEY}" "InstallLocation"
  ${If} $R0 == ""
    ReadRegStr $R0 ${ROOT_KEY} "Software\${PRODUCT_KEY}" ""
  ${EndIf}

  ReadRegStr $R1 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_KEY}" "QuietUninstallString"
  ReadRegStr $R2 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_KEY}" "UninstallString"

  ${If} $R1 != ""
    DetailPrint "Quiet-uninstalling previous ${PRODUCT_KEY} (${ROOT_KEY})..."
    ExecWait '$R1' $R3
  ${ElseIf} $R2 != ""
    DetailPrint "Uninstalling previous ${PRODUCT_KEY} (${ROOT_KEY})..."
    ${If} $R0 != ""
      ExecWait '$R2 /S _?=$R0' $R3
    ${Else}
      ExecWait '$R2 /S' $R3
    ${EndIf}
  ${EndIf}

  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0\uninstall.exe"
    DetailPrint "Running leftover uninstaller in $R0..."
    ExecWait '"$R0\uninstall.exe" /S _?=$R0' $R3
  ${EndIf}

  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0"
    DetailPrint "Removing leftover install directory: $R0"
    RMDir /r "$R0"
  ${EndIf}

  DeleteRegKey ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_KEY}"
  DeleteRegKey ${ROOT_KEY} "Software\${PRODUCT_KEY}"

  SetRegView 32
  DeleteRegKey ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_KEY}"
  DeleteRegKey ${ROOT_KEY} "Software\${PRODUCT_KEY}"
  SetRegView 64

  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; ---------------------------------------------------------------------------
; Remove MSI/WiX installs whose DisplayName is "My Music Station".
; ---------------------------------------------------------------------------
!macro MMS_UNINSTALL_MSI_MATCHING ROOT_KEY
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4

  SetRegView 64
  StrCpy $R0 0

  mms_msi_loop_${ROOT_KEY}:
    EnumRegKey $R1 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
    StrCmp $R1 "" mms_msi_done_${ROOT_KEY}
    IntOp $R0 $R0 + 1

    ReadRegStr $R2 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
    StrCmp $R2 "My Music Station" mms_msi_hit_${ROOT_KEY}
    StrCmp $R2 "${PRODUCTNAME}" mms_msi_hit_${ROOT_KEY} mms_msi_loop_${ROOT_KEY}

    mms_msi_hit_${ROOT_KEY}:
    ReadRegStr $R3 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "UninstallString"
    StrCmp $R3 "" mms_msi_loop_${ROOT_KEY}

    DetailPrint "Uninstalling MSI/WiX My Music Station ($R1)..."
    StrCpy $R4 $R1 1
    ${If} $R4 == "{"
      ExecWait 'msiexec /x $R1 /qn /norestart' $R4
    ${Else}
      ExecWait '$R3 /quiet /norestart' $R4
    ${EndIf}
    StrCpy $R0 0
    Goto mms_msi_loop_${ROOT_KEY}

  mms_msi_done_${ROOT_KEY}:
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

!macro MMS_CLEAN_ONE_AUDIO_ASSOC ROOT_KEY EXT
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.${EXT}\OpenWithProgids" "MyMusicStation.Audio"
  ; Only clear the default ProgID when it still points at us.
  Push $R9
  ReadRegStr $R9 ${ROOT_KEY} "Software\Classes\.${EXT}" ""
  ${If} $R9 == "MyMusicStation.Audio"
    DeleteRegValue ${ROOT_KEY} "Software\Classes\.${EXT}" ""
  ${EndIf}
  Pop $R9
!macroend

!macro MMS_CLEAN_ASSOCIATIONS ROOT_KEY
  DeleteRegKey ${ROOT_KEY} "Software\Classes\.mplist"
  DeleteRegKey ${ROOT_KEY} "Software\Classes\MyMusicStation.Playlist"
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} mp3
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} flac
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} wav
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} ogg
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} aac
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} m4a
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} webm
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} opus
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} wma
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} aiff
  !insertmacro MMS_CLEAN_ONE_AUDIO_ASSOC ${ROOT_KEY} aif
  DeleteRegKey ${ROOT_KEY} "Software\Classes\MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\RegisteredApplications" "My Music Station"
  DeleteRegKey ${ROOT_KEY} "Software\Clients\Media\My Music Station"
!macroend

!macro MMS_REGISTER_OPEN_WITH EXT MIME
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".${EXT}" "MyMusicStation.Audio"
  ; Content Type is helpful for Explorer; do not overwrite an existing non-empty value.
  Push $R9
  ReadRegStr $R9 SHCTX "Software\Classes\.${EXT}" "Content Type"
  ${If} $R9 == ""
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "Content Type" "${MIME}"
  ${EndIf}
  Pop $R9
!macroend

!macro MMS_SET_DEFAULT_AUDIO EXT MIME
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "Content Type" "${MIME}"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".${EXT}" "MyMusicStation.Audio"
!macroend

; ---------------------------------------------------------------------------
; Force desktop / start-menu shortcuts to use the EXE-embedded app icon (index 0).
; ---------------------------------------------------------------------------
!macro MMS_SET_SHORTCUT_ICON LNK_PATH
  ${If} ${FileExists} "${LNK_PATH}"
    CreateShortcut "${LNK_PATH}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
    !insertmacro SetLnkAppUserModelId "${LNK_PATH}"
  ${EndIf}
!macroend

!macro MMS_REFRESH_SHORTCUT_ICONS
  !if "${STARTMENUFOLDER}" != ""
    !insertmacro MMS_SET_SHORTCUT_ICON "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    !insertmacro MMS_SET_SHORTCUT_ICON "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
  !insertmacro MMS_SET_SHORTCUT_ICON "$DESKTOP\${PRODUCTNAME}.lnk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro MMS_REMOVE_LEFTOVERS
  ; Legacy product-name folders (pre V1.0.0 branding).
  RMDir /r "$LOCALAPPDATA\Programs\My Music Station"
  RMDir /r "$PROGRAMFILES\My Music Station"
  RMDir /r "$PROGRAMFILES64\My Music Station"
  RMDir /r "$LOCALAPPDATA\My Music Station"
  RMDir /r "$PROGRAMFILES\My Music Station V1.0.0"
  RMDir /r "$PROGRAMFILES64\My Music Station V1.0.0"
  RMDir /r "$LOCALAPPDATA\My Music Station V1.0.0"
  ; Current product folder (when reinstalling after a full wipe).
  RMDir /r "$PROGRAMFILES\${PRODUCTNAME}"
  RMDir /r "$PROGRAMFILES64\${PRODUCTNAME}"
  RMDir /r "$LOCALAPPDATA\${PRODUCTNAME}"
  ; App settings / session data.
  RMDir /r "$APPDATA\com.mymusicstation.player"
  RMDir /r "$LOCALAPPDATA\com.mymusicstation.player"

  Delete "$DESKTOP\My Music Station.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\My Music Station.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  RMDir /r "$SMPROGRAMS\My Music Station"
  RMDir /r "$SMPROGRAMS\${PRODUCTNAME}"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; ---------------------------------------------------------------------------
; Detect any previous My Music Station install (NSIS / MSI / leftover folders).
; Sets $R7 to 1 when found, else 0.
; ---------------------------------------------------------------------------
!macro MMS_DETECT_EXISTING
  StrCpy $R7 0
  Push $R0

  SetRegView 64
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
  ${If} $R0 != ""
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R7 1
    ${EndIf}
  ${EndIf}
  ${If} $R7 == 0
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R7 1
    ${EndIf}
  ${EndIf}
  ${If} $R7 == 0
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R7 1
    ${EndIf}
  ${EndIf}
  SetRegView 32
  ${If} $R7 == 0
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R7 1
    ${EndIf}
  ${EndIf}
  ${If} $R7 == 0
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R7 1
    ${EndIf}
  ${EndIf}
  SetRegView 64

  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$LOCALAPPDATA\${PRODUCTNAME}\${MAINBINARYNAME}.exe"
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$PROGRAMFILES64\${PRODUCTNAME}\${MAINBINARYNAME}.exe"
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$PROGRAMFILES\${PRODUCTNAME}\${MAINBINARYNAME}.exe"
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$LOCALAPPDATA\Programs\My Music Station"
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$APPDATA\com.mymusicstation.player"
    StrCpy $R7 1
  ${EndIf}
  ${If} $R7 == 0
  ${AndIf} ${FileExists} "$LOCALAPPDATA\com.mymusicstation.player"
    StrCpy $R7 1
  ${EndIf}

  Pop $R0
!macroend

!macro MMS_DO_FULL_CLEAN
  DetailPrint "Completely removing previous My Music Station installation..."
  !insertmacro MMS_UNINSTALL_FROM_ROOT HKCU "My Music Station"
  !insertmacro MMS_UNINSTALL_FROM_ROOT HKLM "My Music Station"
  !insertmacro MMS_UNINSTALL_FROM_ROOT HKCU "${PRODUCTNAME}"
  !insertmacro MMS_UNINSTALL_FROM_ROOT HKLM "${PRODUCTNAME}"
  !insertmacro MMS_UNINSTALL_MSI_MATCHING HKCU
  !insertmacro MMS_UNINSTALL_MSI_MATCHING HKLM

  !insertmacro MMS_CLEAN_ASSOCIATIONS HKCU
  !insertmacro MMS_CLEAN_ASSOCIATIONS HKLM
  !insertmacro MMS_REMOVE_LEFTOVERS
!macroend

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping running My Music Station processes..."
  ExecWait 'taskkill /F /IM ${MAINBINARYNAME}.exe /T' $R9
  Sleep 500

  !insertmacro MMS_DETECT_EXISTING

  ${If} $R7 == 1
    ; $R8 = 1 → full clean. Silent installs keep previous behavior (clean).
    StrCpy $R8 1
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION \
        "이미 설치된 My Music Station이 있습니다.$\r$\n$\r$\n기존 프로그램을 완전히 삭제한 후 새로 설치할까요?$\r$\n$\r$\n예 = 프로그램·바로가기·설정/세션 데이터까지 모두 삭제$\r$\n아니오 = 기존 설정은 유지하고 덮어쓰기 설치" \
        IDYES mms_full_clean_yes
      StrCpy $R8 0
      mms_full_clean_yes:
    ${EndIf}

    ${If} $R8 == 1
      !insertmacro MMS_DO_FULL_CLEAN
    ${Else}
      DetailPrint "Keeping existing install data (upgrade / overwrite only)."
    ${EndIf}
  ${Else}
    DetailPrint "No previous My Music Station installation detected."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping My Music Station before uninstall..."
  ExecWait 'taskkill /F /IM ${MAINBINARYNAME}.exe /T' $R9
  Sleep 300
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Playlist association is always registered.
  WriteRegStr SHCTX "Software\Classes\.mplist" "" "MyMusicStation.Playlist"
  WriteRegStr SHCTX "Software\Classes\.mplist" "Content Type" "application/vnd.mymusicstation.playlist+json"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist" "" "My Music Station Playlist"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\DefaultIcon" "" "$INSTDIR\playlist-icons\icon.ico,0"
  ; Fallback if resource layout differs on older installs.
  ${Unless} ${FileExists} "$INSTDIR\playlist-icons\icon.ico"
    WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  ${EndUnless}
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; ProgID used for all audio formats.
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio" "" "My Music Station Audio"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Always register as a media client so Windows Default Apps / Open with can find us.
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station" "" "My Music Station"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities" "ApplicationName" "My Music Station"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities" "ApplicationDescription" "A multi-platform music player."
  WriteRegStr SHCTX "Software\RegisteredApplications" "My Music Station" "Software\Clients\Media\My Music Station\Capabilities"

  !insertmacro MMS_REGISTER_OPEN_WITH mp3 "audio/mpeg"
  !insertmacro MMS_REGISTER_OPEN_WITH flac "audio/flac"
  !insertmacro MMS_REGISTER_OPEN_WITH wav "audio/wav"
  !insertmacro MMS_REGISTER_OPEN_WITH ogg "audio/ogg"
  !insertmacro MMS_REGISTER_OPEN_WITH aac "audio/aac"
  !insertmacro MMS_REGISTER_OPEN_WITH m4a "audio/mp4"
  !insertmacro MMS_REGISTER_OPEN_WITH webm "audio/webm"
  !insertmacro MMS_REGISTER_OPEN_WITH opus "audio/opus"
  !insertmacro MMS_REGISTER_OPEN_WITH wma "audio/x-ms-wma"
  !insertmacro MMS_REGISTER_OPEN_WITH aiff "audio/aiff"
  !insertmacro MMS_REGISTER_OPEN_WITH aif "audio/aiff"

  ; Ask to become the default player (silent installs default to Yes).
  StrCpy $R8 1
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "My Music Station을 다양한 오디오 파일의 기본 플레이어로 등록하시겠습니까?$\r$\n$\r$\n지원: MP3, FLAC, WAV, OGG, AAC, M4A, WebM, OPUS, WMA, AIFF$\r$\n$\r$\n예 = 기본 플레이어로 설정$\r$\n아니오 = '연결 프로그램' / Windows 기본 앱 목록에만 추가" \
      IDYES mms_keep_default_yes
    StrCpy $R8 0
    mms_keep_default_yes:
  ${EndIf}

  ${If} $R8 == 1
    DetailPrint "Registering My Music Station as the default audio player..."
    !insertmacro MMS_SET_DEFAULT_AUDIO mp3 "audio/mpeg"
    !insertmacro MMS_SET_DEFAULT_AUDIO flac "audio/flac"
    !insertmacro MMS_SET_DEFAULT_AUDIO wav "audio/wav"
    !insertmacro MMS_SET_DEFAULT_AUDIO ogg "audio/ogg"
    !insertmacro MMS_SET_DEFAULT_AUDIO aac "audio/aac"
    !insertmacro MMS_SET_DEFAULT_AUDIO m4a "audio/mp4"
    !insertmacro MMS_SET_DEFAULT_AUDIO webm "audio/webm"
    !insertmacro MMS_SET_DEFAULT_AUDIO opus "audio/opus"
    !insertmacro MMS_SET_DEFAULT_AUDIO wma "audio/x-ms-wma"
    !insertmacro MMS_SET_DEFAULT_AUDIO aiff "audio/aiff"
    !insertmacro MMS_SET_DEFAULT_AUDIO aif "audio/aiff"
  ${Else}
    DetailPrint "Skipped default audio player registration (Open with / Default Apps list only)."
  ${EndIf}

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  !insertmacro MMS_REFRESH_SHORTCUT_ICONS
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MMS_CLEAN_ASSOCIATIONS SHCTX
  !insertmacro MMS_CLEAN_ASSOCIATIONS HKCU
  !insertmacro MMS_CLEAN_ASSOCIATIONS HKLM
  !insertmacro MMS_REMOVE_LEFTOVERS
!macroend
