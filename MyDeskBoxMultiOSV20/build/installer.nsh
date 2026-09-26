; 설치할 때 바로 가기를 만들지 물어보는 페이지.
; 글은 설치 프로그램에서 고른 언어를 따른다. 한국어(1042)와 영어를 지원한다.
;
; 이미 깔려 있는 프로그램이 있으면 설정은 손대지 않는다.
; 박스 배치와 박스에 담아 둔 파일은 그대로 두고 프로그램만 다시 깐다.
; '예전 설정을 모두 지우기' 는 프로그램이 깔려 있지 않을 때만 물어본다.
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
; 프로그램이 이미 깔려 있으면 1. 이때는 설정을 절대 건드리지 않는다.
Var HasOldApp
; 예전 설정이 남아 있으면 1. 깔려 있지 않을 때만 지울지 물어본다.
Var HasOldData

; 페이지를 보지 않고 조용히 설치할 때를 위해 기본값을 켜 둔다.
!macro customInit
  StrCpy $MakeDesktop ${BST_CHECKED}
  StrCpy $MakeStartMenu ${BST_CHECKED}
  ; 설정을 지우는 것은 되돌릴 수 없으므로 기본은 '지우지 않음' 이다.
  StrCpy $WipeData 0

  ; 이미 깔려 있는가. 레지스트리에 적힌 자리에 실행 파일이 있으면 그렇다.
  ; 적힌 자리가 없으면 사용자용과 컴퓨터용을 차례로 더 본다.
  StrCpy $HasOldApp 0
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0\${APP_EXECUTABLE_FILENAME}"
    StrCpy $HasOldApp 1
  ${EndIf}

  ; 예전 설정이 남아 있는가. 박스 배치는 layout.json 에 적혀 있다.
  StrCpy $HasOldData 0
  ${If} ${FileExists} "$APPDATA\${PRODUCT_FILENAME}\layout.json"
    StrCpy $HasOldData 1
  ${EndIf}

  ; 다시 까는 것이라면 지금 있는 바로 가기를 그대로 따라간다.
  ; 지워 두었던 바로 가기가 설치할 때마다 되살아나지 않게 한다.
  ${If} $HasOldApp == 1
    ${IfNot} ${FileExists} "$DESKTOP\${PRODUCT_FILENAME}.lnk"
      StrCpy $MakeDesktop 0
    ${EndIf}
    ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
      StrCpy $MakeStartMenu 0
    ${EndIf}
  ${EndIf}
!macroend

Function ShortcutPageCreate
  ; 지울 것이 있을 때만 물어본다. 깔려 있는 동안에는 묻지 않는다.
  ${If} $HasOldApp == 0
  ${AndIf} $HasOldData == 1
    StrCpy $R7 1
  ${Else}
    StrCpy $R7 0
  ${EndIf}

  ${If} $LANGUAGE == 1042
    StrCpy $R0 "설치 옵션"
    StrCpy $R1 "바로 가기를 만들지 고르세요."
    ${If} $R7 == 1
      StrCpy $R1 "바로 가기를 만들지, 예전 설정을 지울지 고르세요."
    ${EndIf}
    StrCpy $R2 "바탕화면에 바로 가기 만들기"
    StrCpy $R3 "시작 메뉴에 바로 가기 만들기"
    StrCpy $R5 "예전 설정을 모두 지우고 새로 시작 (박스 배치가 사라집니다)"
    StrCpy $R6 "이미 설치되어 있습니다. 박스 배치와 박스에 담아 둔 파일은 그대로 두고 프로그램만 다시 설치합니다."
  ${Else}
    StrCpy $R0 "Setup options"
    StrCpy $R1 "Choose the shortcuts you want."
    ${If} $R7 == 1
      StrCpy $R1 "Choose shortcuts, and whether to clear earlier settings."
    ${EndIf}
    StrCpy $R2 "Create a shortcut on the desktop"
    StrCpy $R3 "Create a shortcut in the Start Menu"
    StrCpy $R5 "Erase earlier settings and start fresh (your boxes are lost)"
    StrCpy $R6 "MyDeskBox is already installed. Your boxes and the files inside them are kept; only the program is reinstalled."
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

  ; 이미 깔려 있으면 지우는 칸을 아예 만들지 않는다. 대신 그대로 둔다고 알린다.
  StrCpy $WipeCheck ""
  ${If} $HasOldApp == 1
    ${NSD_CreateLabel} 0 52u 100% 24u "$R6"
    Pop $R4
  ${ElseIf} $R7 == 1
    ${NSD_CreateCheckbox} 0 52u 100% 12u "$R5"
    Pop $WipeCheck
    ${If} $WipeData == ${BST_CHECKED}
      ${NSD_Check} $WipeCheck
    ${EndIf}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function ShortcutPageLeave
  ${NSD_GetState} $DesktopCheck $MakeDesktop
  ${NSD_GetState} $StartMenuCheck $MakeStartMenu

  ; 지우는 칸을 만들지 않았으면 물어볼 것도 없다.
  ${If} $WipeCheck == ""
    StrCpy $WipeData 0
    Return
  ${EndIf}

  ${NSD_GetState} $WipeCheck $WipeData
  ; 되돌릴 수 없는 일이므로 한 번 더 묻는다.
  ${If} $WipeData == ${BST_CHECKED}
    ${If} $LANGUAGE == 1042
      StrCpy $R0 "예전 설정을 모두 지웁니다. 박스 배치는 되돌릴 수 없습니다.$\n박스에 담겨 있던 파일은 바탕화면으로 돌려 놓습니다.$\n$\n지울까요?"
    ${Else}
      StrCpy $R0 "All earlier settings will be erased. Your box layout cannot be brought back.$\nFiles kept inside the boxes are returned to the desktop.$\n$\nErase them?"
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "$R0" IDYES wipeOk
    StrCpy $WipeData 0
    ${NSD_Uncheck} $WipeCheck
    Abort
    wipeOk:
  ${EndIf}
FunctionEnd

; 설치 위치를 고른 다음에 이 페이지를 보여 준다.
!macro customPageAfterChangeDir
  Page custom ShortcutPageCreate ShortcutPageLeave
!macroend

; 박스에 담아 둔 것은 진짜 파일이다. 설정 폴더를 지우기 전에 바탕화면으로 돌려준다.
; 보관함은 설정 폴더 아래 boxes 이고, 그 아래 박스마다 폴더가 하나씩 있다.
Function RestoreBoxFiles
  StrCpy $R0 "$APPDATA\${PRODUCT_FILENAME}\boxes"
  IfFileExists "$R0\*.*" 0 boxesDone
  FindFirst $R1 $R2 "$R0\*.*"
  boxLoop:
    StrCmp $R2 "" boxClose
    StrCmp $R2 "." boxNext
    StrCmp $R2 ".." boxNext
    IfFileExists "$R0\$R2\*.*" 0 boxNext
      Push "$R0\$R2"
      Call EmptyToDesktop
    boxNext:
      FindNext $R1 $R2
      Goto boxLoop
  boxClose:
    FindClose $R1
  boxesDone:
FunctionEnd

; 폴더 하나에 든 것을 모두 바탕화면으로 옮긴다. 폴더 경로를 넣는다.
; 같은 이름이 이미 있으면 앞에 번호를 붙여 둘 다 남긴다.
Function EmptyToDesktop
  Exch $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  FindFirst $R4 $R5 "$R3\*.*"
  moveLoop:
    StrCmp $R5 "" moveClose
    StrCmp $R5 "." moveNext
    StrCmp $R5 ".." moveNext
    StrCpy $R7 0
    StrCpy $R6 "$DESKTOP\$R5"
    spareLoop:
      IfFileExists "$R6" 0 moveGo
      IntOp $R7 $R7 + 1
      StrCpy $R6 "$DESKTOP\($R7) $R5"
      Goto spareLoop
    moveGo:
      ClearErrors
      Rename "$R3\$R5" "$R6"
      ${IfNot} ${Errors}
        SetFileAttributes "$R6" NORMAL
      ${EndIf}
    moveNext:
      FindNext $R4 $R5
      Goto moveLoop
  moveClose:
    FindClose $R4
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
FunctionEnd

; 고른 대로 바로 가기를 만든다. 아이콘은 프로그램 자체의 것을 쓴다.
!macro customInstall
  ; 고른 경우에만 예전 설정을 지운다. 깔려 있던 프로그램을 다시 까는 길로는
  ; 이 자리에 오지 않는다. $HasOldApp 은 설치를 시작할 때 적어 둔 값이다.
  ${If} $WipeData == ${BST_CHECKED}
  ${AndIf} $HasOldApp == 0
    Call RestoreBoxFiles
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
;
; 다시 깔 때에도 예전 제거 프로그램이 조용히 한 번 돌아간다(--updated).
; 그때는 아무것도 건드리지 않는다. 바로 가기는 곧 새 설치가 다시 만들고,
; 박스에 담아 둔 파일은 그 자리에 그대로 있어야 한다.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    Call un.RestoreHeld
  ${EndIf}
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
