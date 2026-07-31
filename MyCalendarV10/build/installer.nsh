; Custom NSIS include for MyCalendar
; Adds a page (after the install-directory page) letting the user choose whether
; to create Desktop and Start Menu shortcuts. Both are ON by default.
;
; Requires (in package.json > build.nsis):
;   createDesktopShortcut: false
;   createStartMenuShortcut: false
;   include: "build/installer.nsh"

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var Dialog
Var CheckboxDesktop
Var CheckboxStartMenu
Var CreateDesktop
Var CreateStartMenu

; --- Custom page inserted right after the "Choose Install Location" page ---
!macro customPageAfterChangeDir
  Page custom shortcutPageCreate shortcutPageLeave
!macroend

Function shortcutPageCreate
  !insertmacro MUI_HEADER_TEXT "바로가기 설정" "생성할 바로가기를 선택하세요."

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "MyCalendar 를 더 쉽게 실행할 수 있도록 바로가기를 만들 수 있습니다."
  Pop $0

  ${NSD_CreateCheckbox} 0 34u 100% 14u "바탕화면에 바로가기 만들기"
  Pop $CheckboxDesktop
  ${NSD_Check} $CheckboxDesktop

  ${NSD_CreateCheckbox} 0 54u 100% 14u "시작 메뉴에 바로가기 만들기"
  Pop $CheckboxStartMenu
  ${NSD_Check} $CheckboxStartMenu

  nsDialogs::Show
FunctionEnd

Function shortcutPageLeave
  ${NSD_GetState} $CheckboxDesktop $CreateDesktop
  ${NSD_GetState} $CheckboxStartMenu $CreateStartMenu
FunctionEnd

; --- Create the chosen shortcuts during install ---
!macro customInstall
  ${If} $CreateDesktop == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${EndIf}
  ${If} $CreateStartMenu == ${BST_CHECKED}
    CreateDirectory "$SMPROGRAMS\${PRODUCT_FILENAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_FILENAME}\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${EndIf}
!macroend

; --- Clean up shortcuts on uninstall ---
!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}\${PRODUCT_FILENAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_FILENAME}"
!macroend
