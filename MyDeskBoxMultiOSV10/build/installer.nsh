; 설치할 때 바로 가기를 만들지 물어보는 페이지.
; 글은 설치 프로그램에서 고른 언어를 따른다. 한국어(1042)와 영어를 지원한다.
;
; 이 파일은 설치 프로그램을 만들 때와 제거 프로그램을 만들 때 두 번 읽힌다.
; 제거 프로그램에는 페이지가 없으므로, 그때 쓰지 않는 것은 BUILD_UNINSTALLER 로 걸러 낸다.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BST_CHECKED
  !define BST_CHECKED 1
!endif

!ifndef BUILD_UNINSTALLER

Var ShortcutDialog
Var DesktopCheck
Var StartMenuCheck
Var WipeCheck
Var MakeDesktop
Var MakeStartMenu
Var WipeData

; 페이지를 보지 않고 조용히 설치할 때를 위해 기본값을 켜 둔다.
!macro customInit
  StrCpy $MakeDesktop ${BST_CHECKED}
  StrCpy $MakeStartMenu ${BST_CHECKED}
  ; 설정을 지우는 것은 되돌릴 수 없으므로 기본은 '지우지 않음' 이다.
  StrCpy $WipeData 0
!macroend

Function ShortcutPageCreate
  ${If} $LANGUAGE == 1042
    StrCpy $R0 "설치 옵션"
    StrCpy $R1 "바로 가기를 만들지, 예전 설정을 지울지 고르세요."
    StrCpy $R2 "바탕화면에 바로 가기 만들기"
    StrCpy $R3 "시작 메뉴에 바로 가기 만들기"
    StrCpy $R5 "예전 설정을 모두 지우고 새로 시작 (박스 배치가 사라집니다)"
  ${Else}
    StrCpy $R0 "Setup options"
    StrCpy $R1 "Choose shortcuts, and whether to clear earlier settings."
    StrCpy $R2 "Create a shortcut on the desktop"
    StrCpy $R3 "Create a shortcut in the Start Menu"
    StrCpy $R5 "Erase earlier settings and start fresh (your boxes are lost)"
  ${EndIf}

  ; MUI 의 제목 매크로는 이 파일보다 늦게 정의되므로 창에 직접 글을 넣는다.
  GetDlgItem $R4 $HWNDPARENT 1037
  SendMessage $R4 ${WM_SETTEXT} 0 "STR:$R0"
  GetDlgItem $R4 $HWNDPARENT 1038
  SendMessage $R4 ${WM_SETTEXT} 0 "STR:$R1"

  nsDialogs::Create 1018
  Pop $ShortcutDialog
  ${If} $ShortcutDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 0 8u 100% 12u "$R2"
  Pop $DesktopCheck
  ${If} $MakeDesktop == ${BST_CHECKED}
    ${NSD_Check} $DesktopCheck
  ${EndIf}

  ${NSD_CreateCheckbox} 0 26u 100% 12u "$R3"
  Pop $StartMenuCheck
  ${If} $MakeStartMenu == ${BST_CHECKED}
    ${NSD_Check} $StartMenuCheck
  ${EndIf}

  ${NSD_CreateCheckbox} 0 52u 100% 12u "$R5"
  Pop $WipeCheck
  ${If} $WipeData == ${BST_CHECKED}
    ${NSD_Check} $WipeCheck
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function ShortcutPageLeave
  ${NSD_GetState} $DesktopCheck $MakeDesktop
  ${NSD_GetState} $StartMenuCheck $MakeStartMenu
  ${NSD_GetState} $WipeCheck $WipeData
FunctionEnd

; 설치 위치를 고른 다음에 이 페이지를 보여 준다.
!macro customPageAfterChangeDir
  Page custom ShortcutPageCreate ShortcutPageLeave
!macroend

; 고른 대로 바로 가기를 만든다. 아이콘은 프로그램 자체의 것을 쓴다.
!macro customInstall
  ; 고른 경우에만 예전 설정을 지운다. 박스 배치와 아이콘 자리가 모두 사라진다.
  ${If} $WipeData == ${BST_CHECKED}
    RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
  ${EndIf}

  ${If} $MakeDesktop == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${Else}
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  ${EndIf}

  ${If} $MakeStartMenu == ${BST_CHECKED}
    CreateShortCut "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${Else}
    Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER

; 직접 만든 바로 가기는 지울 때도 직접 치운다.
!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  Call un.RestoreHeld
!macroend

; 아래는 제거 프로그램에만 들어가는 코드이다.
; 설치 프로그램을 만들 때도 읽히면 NSIS 가 '쓰지 않는 제거 코드' 로 보고 경고를 낸다.
; electron-builder 는 경고를 오류로 다루므로 반드시 걸러 내야 한다.
!ifdef BUILD_UNINSTALLER

; 박스에 넣어 둔 파일은 설정 폴더에 있다. 지우기 전에 바탕화면으로 되돌린다.
; 예전 판이 파일을 held 폴더로 옮겨 두었을 때를 위한 것이다.
Function un.RestoreHeld
  IfFileExists "$APPDATA\mydeskbox\held\*.*" 0 heldDone
  FindFirst $0 $1 "$APPDATA\mydeskbox\held\*.*"
  heldLoop:
    StrCmp $1 "" heldClose
    StrCmp $1 "." heldNext
    StrCmp $1 ".." heldNext
    IfFileExists "$DESKTOP\$1" 0 heldMove
      StrCpy $2 "$DESKTOP\restored-$1"
      Goto heldGo
    heldMove:
      StrCpy $2 "$DESKTOP\$1"
    heldGo:
      Rename "$APPDATA\mydeskbox\held\$1" "$2"
    heldNext:
      FindNext $0 $1
      Goto heldLoop
    heldClose:
      FindClose $0
  heldDone:
FunctionEnd

!endif ; BUILD_UNINSTALLER
