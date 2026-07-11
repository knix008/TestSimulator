; Image Viewer — clean reinstall support for electron-builder NSIS
; On upgrade/reinstall: quit the running app, remove the old install dir,
; and wipe Electron userData so the previous program is fully replaced.

!include "LogicLib.nsh"

!macro KillImageViewerProcesses
  ; Force-close any running instance so files can be deleted
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "Image Viewer.exe" /T >nul 2>&1'
  Sleep 800
!macroend

!macro RemoveImageViewerUserData
  SetShellVarContext current
  RMDir /r "$APPDATA\Image Viewer"
  RMDir /r "$LOCALAPPDATA\Image Viewer"
  ; package name fallback (dev / older builds)
  RMDir /r "$APPDATA\image-viewer-multios"
  RMDir /r "$LOCALAPPDATA\image-viewer-multios"
!macroend

!macro customInit
  !insertmacro KillImageViewerProcesses
!macroend

; Runs after the previous uninstaller, before new files are copied
!macro preInstall
  !insertmacro KillImageViewerProcesses

  ; Wipe install directory leftovers (failed/partial uninstalls)
  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}

  ; Always start clean: remove previous app settings / cache
  !insertmacro RemoveImageViewerUserData
!macroend

!macro customUnInstall
  !insertmacro KillImageViewerProcesses

  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}

  !insertmacro RemoveImageViewerUserData
!macroend
