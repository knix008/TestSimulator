; CaptureMaster installer hooks.
; The language picker is Tauri's displayLanguageSelector (English / Korean).
; This page lets the user choose Desktop and Start Menu shortcuts.
; It is included before the standard pages, so it is the first wizard page
; after the language dialog.

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var CmDesktopCheckbox
Var CmStartMenuCheckbox
Var CmWantDesktop
Var CmWantStartMenu

; Tauri's finish page also has a desktop checkbox. Leave it unchecked so the
; choice on this page is the one that creates the shortcut.
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

Page custom CmShortcutCreate CmShortcutLeave

Function CmShortcutCreate
  StrCpy $CmWantDesktop "1"
  StrCpy $CmWantStartMenu "1"
  ${If} ${Silent}
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $LANGUAGE == 1042
    ${NSD_CreateLabel} 0 0 100% 28u "설치 후 만들 바로가기를 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 36u 100% 14u "바탕화면에 바로가기 만들기"
    Pop $CmDesktopCheckbox
    ${NSD_CreateCheckbox} 0 56u 100% 14u "시작 메뉴에 바로가기 만들기"
    Pop $CmStartMenuCheckbox
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 28u "Choose which shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 36u 100% 14u "Create a Desktop shortcut"
    Pop $CmDesktopCheckbox
    ${NSD_CreateCheckbox} 0 56u 100% 14u "Create a Start Menu shortcut"
    Pop $CmStartMenuCheckbox
  ${EndIf}

  ${NSD_Check} $CmDesktopCheckbox
  ${NSD_Check} $CmStartMenuCheckbox
  nsDialogs::Show
FunctionEnd

Function CmShortcutLeave
  ${NSD_GetState} $CmDesktopCheckbox $0
  ${If} $0 == 1
    StrCpy $CmWantDesktop "1"
  ${Else}
    StrCpy $CmWantDesktop "0"
  ${EndIf}

  ${NSD_GetState} $CmStartMenuCheckbox $0
  ${If} $0 == 1
    StrCpy $CmWantStartMenu "1"
  ${Else}
    StrCpy $CmWantStartMenu "0"
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The template always creates the Start Menu shortcut. Remove it when the
  ; user unchecked that option.
  ${If} $CmWantStartMenu != "1"
    Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    RMDir "$SMPROGRAMS\$AppStartMenuFolder"
  ${EndIf}

  ${If} $CmWantDesktop == "1"
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${Else}
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
!macroend
