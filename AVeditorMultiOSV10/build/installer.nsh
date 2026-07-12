; Minimal NSIS hooks for electron-builder.
; (Custom nsDialogs pages are not reliable here — the script is included
; before nsDialogs/MUI macros exist during the BUILD_UNINSTALLER pass.)

!include "LogicLib.nsh"

!macro customInit
!macroend

!macro customInstall
!macroend
