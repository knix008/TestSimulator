; Custom NSIS page: choose whether to enable the system tray icon.
; Note: Do not use MUI_* macros here — electron-builder includes this
; file before MUI headers are fully available.
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var TrayDialog
Var TrayCheckbox
Var TrayLabel
Var EnableTray

Function trayOptionsPage
  nsDialogs::Create 1018
  Pop $TrayDialog

  ${If} $TrayDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 36u "Create a MyTerminal icon in the system tray after installation?$\r$\nYou can change this later in Settings."
  Pop $TrayLabel

  ${NSD_CreateCheckbox} 0 50u 100% 12u "Enable system tray icon"
  Pop $TrayCheckbox
  ${NSD_Check} $TrayCheckbox

  nsDialogs::Show
FunctionEnd

Function trayOptionsPageLeave
  ${NSD_GetState} $TrayCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $EnableTray "1"
  ${Else}
    StrCpy $EnableTray "0"
  ${EndIf}
FunctionEnd

!macro customPageAfterChangeDir
  Page custom trayOptionsPage trayOptionsPageLeave
!macroend

!macro customInstall
  ; Default if page was skipped
  ${If} $EnableTray == ""
    StrCpy $EnableTray "1"
  ${EndIf}

  CreateDirectory "$INSTDIR\resources"
  FileOpen $0 "$INSTDIR\resources\installer-options.json" w
  ${If} $EnableTray == "1"
    FileWrite $0 '{"showTrayIcon":true}'
  ${Else}
    FileWrite $0 '{"showTrayIcon":false}'
  ${EndIf}
  FileClose $0
!macroend
