!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "UninstallString"
  StrCmp $0 "" 0 uninstall_current_user
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\My Music Station" "UninstallString"
  StrCmp $0 "" done

  uninstall_current_user:
    ExecWait '"$0" /S'

  done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\.mmspl" "" "MyMusicStation.Playlist"
  WriteRegStr SHCTX "Software\Classes\.mmspl" "Content Type" "application/vnd.mymusicstation.playlist+json"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist" "" "My Music Station Playlist"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\DefaultIcon" "" "$INSTDIR\resources\playlist-icons\icon.ico"
  WriteRegStr SHCTX "Software\Classes\MyMusicStation.Playlist\shell\open\command" "" '"$INSTDIR\my_music_station.exe" "%1"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\.mmspl"
  DeleteRegKey SHCTX "Software\Classes\MyMusicStation.Playlist"
!macroend