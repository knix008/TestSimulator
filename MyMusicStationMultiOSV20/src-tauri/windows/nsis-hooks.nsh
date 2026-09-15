!include "LogicLib.nsh"

; ---------------------------------------------------------------------------
; Remove a previous NSIS/Tauri install recorded under ROOT_KEY (HKCU or HKLM).
; ---------------------------------------------------------------------------
!macro MMS_UNINSTALL_FROM_ROOT ROOT_KEY
  Push $R0
  Push $R1
  Push $R2
  Push $R3

  SetRegView 64
  ReadRegStr $R0 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "InstallLocation"
  ${If} $R0 == ""
    ReadRegStr $R0 ${ROOT_KEY} "Software\My Music Station" ""
  ${EndIf}

  ReadRegStr $R1 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "QuietUninstallString"
  ReadRegStr $R2 ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "UninstallString"

  ${If} $R1 != ""
    DetailPrint "Quiet-uninstalling previous My Music Station (${ROOT_KEY})..."
    ExecWait '$R1' $R3
  ${ElseIf} $R2 != ""
    DetailPrint "Uninstalling previous My Music Station (${ROOT_KEY})..."
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

  DeleteRegKey ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station"
  DeleteRegKey ${ROOT_KEY} "Software\My Music Station"

  SetRegView 32
  DeleteRegKey ${ROOT_KEY} "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station"
  DeleteRegKey ${ROOT_KEY} "Software\My Music Station"
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
    StrCmp $R2 "My Music Station" 0 mms_msi_loop_${ROOT_KEY}

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
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.${EXT}\OpenWithProgids" "MyMusicStation.Audio.${EXT}"
  ; Only clear the default ProgID when it still points at us.
  Push $R9
  ReadRegStr $R9 ${ROOT_KEY} "Software\Classes\.${EXT}" ""
  ${If} $R9 == "MyMusicStation.Audio"
  ${OrIf} $R9 == "MyMusicStation.Audio.${EXT}"
    DeleteRegValue ${ROOT_KEY} "Software\Classes\.${EXT}" ""
  ${EndIf}
  Pop $R9
  DeleteRegKey ${ROOT_KEY} "Software\Classes\MyMusicStation.Audio.${EXT}"
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

!macro MMS_REGISTER_AUDIO_FORMAT EXT MIME ICON
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio.${EXT}" "" "My Music Station ${EXT} Audio"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio.${EXT}\DefaultIcon" "" "$INSTDIR\resources\audio-icons\${ICON}"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio.${EXT}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "MyMusicStation.Audio.${EXT}" ""
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".${EXT}" "MyMusicStation.Audio.${EXT}"
  ; Content Type is helpful for Explorer; do not overwrite an existing non-empty value.
  Push $R9
  ReadRegStr $R9 SHCTX "Software\Classes\.${EXT}" "Content Type"
  ${If} $R9 == ""
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "Content Type" "${MIME}"
  ${EndIf}
  Pop $R9
!macroend

!macro MMS_SET_DEFAULT_AUDIO EXT MIME ICON
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio.${EXT}" "" "My Music Station ${EXT} Audio"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio.${EXT}\DefaultIcon" "" "$INSTDIR\resources\audio-icons\${ICON}"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio.${EXT}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "MyMusicStation.Audio.${EXT}"
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "Content Type" "${MIME}"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "MyMusicStation.Audio.${EXT}" ""
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".${EXT}" "MyMusicStation.Audio.${EXT}"
!macroend

; ---------------------------------------------------------------------------
; Force the desktop / start-menu shortcuts to use the app icon.ico explicitly.
; ---------------------------------------------------------------------------
!macro MMS_SET_SHORTCUT_ICON LNK_PATH
  ${If} ${FileExists} "${LNK_PATH}"
    CreateShortcut "${LNK_PATH}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\resources\icons\icon.ico" 0
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
  RMDir /r "$LOCALAPPDATA\Programs\My Music Station"
  RMDir /r "$PROGRAMFILES\My Music Station"
  RMDir /r "$PROGRAMFILES64\My Music Station"
  RMDir /r "$APPDATA\com.mymusicstation.player"
  RMDir /r "$LOCALAPPDATA\com.mymusicstation.player"

  Delete "$DESKTOP\My Music Station.lnk"
  Delete "$SMPROGRAMS\My Music Station.lnk"
  RMDir /r "$SMPROGRAMS\My Music Station"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping running My Music Station processes..."
  ExecWait 'taskkill /F /IM ${MAINBINARYNAME}.exe /T' $R9
  Sleep 500

  DetailPrint "Removing any previous My Music Station installation..."
  !insertmacro MMS_UNINSTALL_FROM_ROOT HKCU
  !insertmacro MMS_UNINSTALL_FROM_ROOT HKLM
  !insertmacro MMS_UNINSTALL_MSI_MATCHING HKCU
  !insertmacro MMS_UNINSTALL_MSI_MATCHING HKLM

  !insertmacro MMS_CLEAN_ASSOCIATIONS HKCU
  !insertmacro MMS_CLEAN_ASSOCIATIONS HKLM
  !insertmacro MMS_REMOVE_LEFTOVERS
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
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\DefaultIcon" "" "$INSTDIR\resources\playlist-icons\icon.ico"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Per-format ProgIDs so Explorer shows MP3/WAV/... icons instead of one generic mark.
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio" "" "My Music Station Audio"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio\DefaultIcon" "" "$INSTDIR\resources\audio-icons\icon.ico"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Always register as a media client so Windows Default Apps / Open with can find us.
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station" "" "My Music Station"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities" "ApplicationName" "My Music Station"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities" "ApplicationDescription" "A multi-platform music player."
  WriteRegStr SHCTX "Software\RegisteredApplications" "My Music Station" "Software\Clients\Media\My Music Station\Capabilities"

  !insertmacro MMS_REGISTER_AUDIO_FORMAT mp3 "audio/mpeg" "mp3.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT flac "audio/flac" "flac.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT wav "audio/wav" "wav.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT ogg "audio/ogg" "ogg.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT aac "audio/aac" "aac.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT m4a "audio/mp4" "m4a.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT webm "audio/webm" "webm.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT opus "audio/opus" "opus.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT wma "audio/x-ms-wma" "wma.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT aiff "audio/aiff" "aiff.ico"
  !insertmacro MMS_REGISTER_AUDIO_FORMAT aif "audio/aiff" "aiff.ico"

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
    !insertmacro MMS_SET_DEFAULT_AUDIO mp3 "audio/mpeg" "mp3.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO flac "audio/flac" "flac.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO wav "audio/wav" "wav.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO ogg "audio/ogg" "ogg.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO aac "audio/aac" "aac.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO m4a "audio/mp4" "m4a.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO webm "audio/webm" "webm.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO opus "audio/opus" "opus.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO wma "audio/x-ms-wma" "wma.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO aiff "audio/aiff" "aiff.ico"
    !insertmacro MMS_SET_DEFAULT_AUDIO aif "audio/aiff" "aiff.ico"
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
