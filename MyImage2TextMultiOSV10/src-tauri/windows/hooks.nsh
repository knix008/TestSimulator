; Image2Text installer hooks.
; Language selection is Tauri's displayLanguageSelector (English / Korean).
; This page lets the user choose the Desktop and Start Menu shortcuts.
; The hooks file is included before the standard pages, so this page is the
; first wizard page after the language dialog.
; Shortcuts point at the installed executable and use its icon, which is the
; same artwork as the installer icon.

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var I2tDesktopCheckbox
Var I2tStartMenuCheckbox
Var I2tWantDesktop
Var I2tWantStartMenu

; Tauri's finish page also has a desktop checkbox. Leave it unchecked so the
; choice on this page is the one that creates the shortcut.
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

Page custom I2tShortcutCreate I2tShortcutLeave

Function I2tShortcutCreate
  StrCpy $I2tWantDesktop "1"
  StrCpy $I2tWantStartMenu "1"
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
    Pop $I2tDesktopCheckbox
    ${NSD_CreateCheckbox} 0 56u 100% 14u "시작 메뉴에 바로가기 만들기"
    Pop $I2tStartMenuCheckbox
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 28u "Choose which shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 36u 100% 14u "Create a Desktop shortcut"
    Pop $I2tDesktopCheckbox
    ${NSD_CreateCheckbox} 0 56u 100% 14u "Create a Start Menu shortcut"
    Pop $I2tStartMenuCheckbox
  ${EndIf}

  ${NSD_Check} $I2tDesktopCheckbox
  ${NSD_Check} $I2tStartMenuCheckbox
  nsDialogs::Show
FunctionEnd

Function I2tShortcutLeave
  ${NSD_GetState} $I2tDesktopCheckbox $0
  ${If} $0 == 1
    StrCpy $I2tWantDesktop "1"
  ${Else}
    StrCpy $I2tWantDesktop "0"
  ${EndIf}

  ${NSD_GetState} $I2tStartMenuCheckbox $0
  ${If} $0 == 1
    StrCpy $I2tWantStartMenu "1"
  ${Else}
    StrCpy $I2tWantStartMenu "0"
  ${EndIf}
FunctionEnd

!macro I2tApplyShortcutIcon shortcut
  ; Icon index 0 of the executable is the program icon embedded from icons/icon.ico.
  CreateShortcut "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  !insertmacro SetLnkAppUserModelId "${shortcut}"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Default is both shortcuts. The page overrides this when it is shown.
  StrCpy $I2tWantDesktop "1"
  StrCpy $I2tWantStartMenu "1"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; /NS skips every shortcut, including a choice made on the page.
  ${If} $NoShortcutMode = 1
    StrCpy $I2tWantDesktop "0"
    StrCpy $I2tWantStartMenu "0"
  ${EndIf}

  FileOpen $0 "$INSTDIR\install-language.txt" w
  ${If} $0 != ""
    ${If} $LANGUAGE == 1042
      FileWrite $0 "ko$\r$\n"
    ${Else}
      FileWrite $0 "en$\r$\n"
    ${EndIf}
    FileClose $0
  ${EndIf}

  ; The template always creates the Start Menu shortcut. Remove it when the
  ; user unchecked that option, and pin the program icon when they kept it.
  ${If} $I2tWantStartMenu == "1"
    ${If} ${FileExists} "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      !insertmacro I2tApplyShortcutIcon "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      !insertmacro I2tApplyShortcutIcon "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${Else}
    Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    RMDir "$SMPROGRAMS\$AppStartMenuFolder"
  ${EndIf}

  ${If} $I2tWantDesktop == "1"
    !insertmacro I2tApplyShortcutIcon "$DESKTOP\${PRODUCTNAME}.lnk"
  ${Else}
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$INSTDIR\install-language.txt"
  RMDir "$INSTDIR"
!macroend
