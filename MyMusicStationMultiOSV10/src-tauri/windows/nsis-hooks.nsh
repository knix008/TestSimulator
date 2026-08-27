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
    ; Tauri NSIS uninstaller expects /S and the install directory via _?=
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
    ; Prefer msiexec /x {ProductCode} /qn when the key looks like a GUID.
    StrCpy $R4 $R1 1
    ${If} $R4 == "{"
      ExecWait 'msiexec /x $R1 /qn /norestart' $R4
    ${Else}
      ExecWait '$R3 /quiet /norestart' $R4
    ${EndIf}
    ; Registry keys shift after delete; restart enumeration.
    StrCpy $R0 0
    Goto mms_msi_loop_${ROOT_KEY}

  mms_msi_done_${ROOT_KEY}:
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

!macro MMS_CLEAN_ASSOCIATIONS ROOT_KEY
  DeleteRegKey ${ROOT_KEY} "Software\Classes\.mplist"
  DeleteRegKey ${ROOT_KEY} "Software\Classes\MyMusicStation.Playlist"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.mp3\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.flac\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.wav\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.ogg\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.aac\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.m4a\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.webm\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\Classes\.opus\OpenWithProgids" "MyMusicStation.Audio"
  DeleteRegKey ${ROOT_KEY} "Software\Classes\MyMusicStation.Audio"
  DeleteRegValue ${ROOT_KEY} "Software\RegisteredApplications" "My Music Station"
  DeleteRegKey ${ROOT_KEY} "Software\Clients\Media\My Music Station"
!macroend

; ---------------------------------------------------------------------------
; Force the desktop / start-menu shortcuts to use the app icon.ico explicitly.
; Tauri creates the shortcuts with only the .exe as target (icon = exe,0), which
; leaves them at the mercy of the Windows icon cache. Re-stamping the shortcut
; with an explicit icon path guarantees the new icon shows up. We only touch
; shortcuts that already exist so update / silent / no-shortcut modes are honored.
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
  ; Common Tauri / Windows install locations
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
  ExecWait 'taskkill /F /IM my_music_station.exe /T' $R9
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
  ExecWait 'taskkill /F /IM my_music_station.exe /T' $R9
  Sleep 300
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\.mplist" "" "MyMusicStation.Playlist"
  WriteRegStr SHCTX "Software\Classes\.mplist" "Content Type" "application/vnd.mymusicstation.playlist+json"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist" "" "My Music Station Playlist"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\DefaultIcon" "" "$INSTDIR\resources\playlist-icons\icon.ico"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\shell\open\command" "" '"$INSTDIR\my_music_station.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio" "" "My Music Station Audio"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio\DefaultIcon" "" "$INSTDIR\my_music_station.exe,0"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Audio\shell\open\command" "" '"$INSTDIR\my_music_station.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\.mp3" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.mp3" "Content Type" "audio/mpeg"
  WriteRegStr SHCTX "Software\Classes\.mp3\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.flac" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.flac" "Content Type" "audio/flac"
  WriteRegStr SHCTX "Software\Classes\.flac\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.wav" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.wav" "Content Type" "audio/wav"
  WriteRegStr SHCTX "Software\Classes\.wav\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.ogg" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.ogg" "Content Type" "audio/ogg"
  WriteRegStr SHCTX "Software\Classes\.ogg\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.aac" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.aac" "Content Type" "audio/aac"
  WriteRegStr SHCTX "Software\Classes\.aac\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.m4a" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.m4a" "Content Type" "audio/mp4"
  WriteRegStr SHCTX "Software\Classes\.m4a\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.webm" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.webm" "Content Type" "audio/webm"
  WriteRegStr SHCTX "Software\Classes\.webm\OpenWithProgids" "MyMusicStation.Audio" ""
  WriteRegStr SHCTX "Software\Classes\.opus" "" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Classes\.opus" "Content Type" "audio/opus"
  WriteRegStr SHCTX "Software\Classes\.opus\OpenWithProgids" "MyMusicStation.Audio" ""

  WriteRegStr SHCTX "Software\Clients\Media\My Music Station" "" "My Music Station"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities" "ApplicationName" "My Music Station"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities" "ApplicationDescription" "A multi-platform music player."
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".mp3" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".flac" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".wav" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".ogg" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".aac" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".m4a" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".webm" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\Clients\Media\My Music Station\Capabilities\FileAssociations" ".opus" "MyMusicStation.Audio"
  WriteRegStr SHCTX "Software\RegisteredApplications" "My Music Station" "Software\Clients\Media\My Music Station\Capabilities"

  ; Stamp the new app icon onto the desktop / start-menu shortcuts.
  !insertmacro MMS_REFRESH_SHORTCUT_ICONS
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MMS_CLEAN_ASSOCIATIONS SHCTX
  !insertmacro MMS_CLEAN_ASSOCIATIONS HKCU
  !insertmacro MMS_CLEAN_ASSOCIATIONS HKLM
  !insertmacro MMS_REMOVE_LEFTOVERS
!macroend
