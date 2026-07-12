; AV Editor — clean reinstall support for electron-builder NSIS
; On upgrade/reinstall: quit the running app, remove the old install dir,
; and wipe Electron userData so the previous program is fully replaced.

!include "LogicLib.nsh"

!macro KillAVEditorProcesses
  ; Force-close any running instance so files can be deleted
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "AV Editor.exe" /T >nul 2>&1'
  Sleep 800
!macroend

!macro RemoveAVEditorUserData
  SetShellVarContext current
  RMDir /r "$APPDATA\AV Editor"
  RMDir /r "$LOCALAPPDATA\AV Editor"
  ; package name / appId fallbacks
  RMDir /r "$APPDATA\av-editor"
  RMDir /r "$LOCALAPPDATA\av-editor"
!macroend

!macro customInit
  !insertmacro KillAVEditorProcesses
!macroend

; Runs after the previous uninstaller, before new files are copied
!macro preInstall
  !insertmacro KillAVEditorProcesses

  ; Wipe install directory leftovers (failed/partial uninstalls)
  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}

  ; Always start clean: remove previous app settings / cache
  !insertmacro RemoveAVEditorUserData
!macroend

!macro customUnInstall
  !insertmacro KillAVEditorProcesses

  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}

  !insertmacro RemoveAVEditorUserData
!macroend
