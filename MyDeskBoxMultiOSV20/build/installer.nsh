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
; --updated 를 스스로 읽는다. 조용한 업데이트 제거에서는 바탕화면을 건드리지 않는다.
!include "FileFunc.nsh"

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

  ; 이미 깔려 있는 위에 다시 깔았다. 앞선 판이 박스에 담아 둔 파일이 남아 있으면
  ; 바탕화면으로 되돌릴지 물어본다. 되돌리는 일은 새로 깐 프로그램이 한다.
  ; 그 길이 감춘 휴지통과 비켜 둔 아이콘 자리까지 함께 되돌린다.
  ; 조용히 설치하는 길에서는 묻지 않고 그대로 둔다.
  ${IfNot} ${Silent}
  ${AndIf} $HasOldApp == 1
  ${AndIf} ${FileExists} "$APPDATA\${PRODUCT_FILENAME}\boxes\restore.json"
    ${If} $LANGUAGE == 1042
      StrCpy $R0 "박스에 담아 둔 파일이 남아 있습니다.$\n$\n바탕화면을 원래대로 돌려놓을까요?$\n담아 둔 파일은 담기 전 자리로 돌아가고, 감춘 휴지통도 다시 보입니다.$\n'아니오' 를 고르면 박스에 그대로 두고 프로그램만 다시 깝니다."
    ${Else}
      StrCpy $R0 "Files are still kept inside your boxes.$\n$\nRestore the desktop to how it was?$\nThe files go back where they came from, and the hidden Recycle Bin comes back.$\nChoose No to keep them in the boxes and only reinstall the program."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$R0" IDNO skipRestore
      DetailPrint "바탕화면을 되돌립니다"
      ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --restore-desktop' $R1
      ; 프로그램이 되돌리지 못한 것은 손으로 옮긴다. 보관함에 남겨 두면 보이지 않는다.
      ${If} $R1 != 0
        Call RestoreBoxFiles
      ${EndIf}
    skipRestore:
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

; 프로그램을 지운다. 지우고 나면 바탕화면이 켜기 전 모습이어야 한다.
;
; 파일을 지우기 전에 되돌려야 하므로 여기(un.onInit)에서 한다. customUnInstall 은
; 실행 파일이 이미 지워진 뒤에 돌아서, 프로그램에게 되돌리라고 부를 수 없다.
;
; 다시 깔 때에도 예전 제거 프로그램이 조용히 한 번 돌아간다(--updated).
; 그때는 아무것도 되돌리지 않는다. 박스에 담아 둔 파일은 그 자리에 그대로 있어야 하고,
; 되돌릴지 묻는 일은 새로 까는 설치 프로그램이 맡는다.
!macro customUnInit
  ${GetParameters} $R9
  ClearErrors
  ${GetOptions} $R9 "--updated" $R8
  ${If} ${Errors}
    ; 프로그램에게 되돌리라고 부른다. 아이콘 자리는 프로그램만 되돌릴 수 있다
    ; (icon-homes.json 에 적어 둔 자리로 탐색기 목록을 옮긴다).
    ; 아직 돌고 있으면 그 판이 감춘 것을 다시 감출 수 있다. 그래서 마지막 판단은
    ; 앱이 확실히 멈춘 뒤에 도는 customUnInstall 이 한다.
    ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      DetailPrint "바탕화면을 되돌립니다"
      ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --restore-desktop' $R6
    ${Else}
      StrCpy $R6 1
    ${EndIf}
    ; 프로그램이 없거나 되돌리지 못한 것이 있으면 손으로 옮긴다.
    ${If} $R6 != 0
      Call un.RestoreBoxFiles
    ${EndIf}
    ; 감춘 셸 아이콘은 프로그램이 되살린다. 그 길이 막혔을 때를 위해 여기서도 되살린다.
    Call un.ShowShellIcons
  ${EndIf}
!macroend

; 직접 만든 바로 가기는 지울 때도 직접 치운다.
;
; 다시 깔 때에도 예전 제거 프로그램이 조용히 한 번 돌아간다(--updated).
; 그때는 아무것도 건드리지 않는다. 바로 가기는 곧 새 설치가 다시 만들고,
; 박스에 담아 둔 파일은 그 자리에 그대로 있어야 한다.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    ; 프로그램이 스스로 적어 둔 시작프로그램 자리를 치운다.
    ; 남겨 두면 로그인할 때마다 없어진 실행 파일을 부른다.
    ; 이름은 src/main/autostart.js 가 적는 것과 같아야 한다.
    ; 'com.suhokwon.mydeskbox' 는 이름을 적어 주기 전 판이 남긴 것이다.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_FILENAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.suhokwon.mydeskbox"
    Call un.RestoreHeld
    ; 여기가 마지막 판단이다. 앱은 이미 멈췄으므로 다시 감추거나 다시 담을 수 없다.
    ; 프로그램이 앞서 되돌렸으면 옮길 것도, 지울 값도 없어 아무 일도 하지 않는다.
    Call un.RestoreBoxFiles
    Call un.ShowShellIcons
  ${EndIf}
!macroend

; 아래는 제거 프로그램에만 들어가는 코드이다.
; 설치 프로그램을 만들 때도 읽히면 NSIS 가 '쓰지 않는 제거 코드' 로 보고 경고를 낸다.
; electron-builder 는 경고를 오류로 다루므로 반드시 걸러 내야 한다.
!ifdef BUILD_UNINSTALLER

; 프로그램이 되돌리지 못했을 때 쓰는 손 복구.
;
; 보관함(설정 폴더 아래 boxes)의 박스 폴더마다 든 파일을 바탕화면으로 옮긴다.
; 어디서 왔는지는 보지 않는다. 눈에 보이는 자리에 두는 것이 보관함에 남기는 것보다 낫다.
Function un.RestoreBoxFiles
  StrCpy $R0 "$APPDATA\${PRODUCT_FILENAME}\boxes"
  IfFileExists "$R0\*.*" 0 unBoxesDone
  FindFirst $R1 $R2 "$R0\*.*"
  unBoxLoop:
    StrCmp $R2 "" unBoxClose
    StrCmp $R2 "." unBoxNext
    StrCmp $R2 ".." unBoxNext
    IfFileExists "$R0\$R2\*.*" 0 unBoxNext
      Push "$R0\$R2"
      Call un.EmptyToDesktop
    unBoxNext:
      FindNext $R1 $R2
      Goto unBoxLoop
  unBoxClose:
    FindClose $R1
  unBoxesDone:
FunctionEnd

; 폴더 하나에 든 것을 모두 바탕화면으로 옮긴다. 폴더 경로를 넣는다.
; 같은 이름이 이미 있으면 앞에 번호를 붙여 둘 다 남긴다. 덮어쓰지 않는다.
Function un.EmptyToDesktop
  Exch $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  FindFirst $R4 $R5 "$R3\*.*"
  unMoveLoop:
    StrCmp $R5 "" unMoveClose
    StrCmp $R5 "." unMoveNext
    StrCmp $R5 ".." unMoveNext
    StrCpy $R7 0
    StrCpy $R6 "$DESKTOP\$R5"
    unSpareLoop:
      IfFileExists "$R6" 0 unMoveGo
      IntOp $R7 $R7 + 1
      StrCpy $R6 "$DESKTOP\($R7) $R5"
      Goto unSpareLoop
    unMoveGo:
      ClearErrors
      Rename "$R3\$R5" "$R6"
      ${IfNot} ${Errors}
        SetFileAttributes "$R6" NORMAL
      ${EndIf}
    unMoveNext:
      FindNext $R4 $R5
      Goto unMoveLoop
  unMoveClose:
    FindClose $R4
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
FunctionEnd

; 감춰 둔 셸 아이콘(휴지통, 내 PC 등)을 다시 보이게 한다.
;
; 박스에 담은 셸 아이콘은 레지스트리로 감춘다(HideDesktopIcons 아래 NewStartPanel).
; 프로그램이 끝날 때 되살리지만, 작업 관리자로 끝났거나 지우는 길에 멈췄으면 값이 남는다.
; 그러면 프로그램을 지운 뒤에도 휴지통이 보이지 않는다. 그 값을 지워 기본값(보이기)으로 둔다.
; 아이콘 목록은 src/main/desktop/windows.js 의 SHELL_CLSID 와 같아야 한다.
Function un.ShowShellIcons
  StrCpy $R0 "Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel"
  DeleteRegValue HKCU "$R0" "{645FF040-5081-101B-9F08-00AA002F954E}"
  DeleteRegValue HKCU "$R0" "{20D04FE0-3AEA-1069-A2D8-08002B30309D}"
  DeleteRegValue HKCU "$R0" "{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}"
  DeleteRegValue HKCU "$R0" "{59031A47-3F72-44A7-89C5-5595FE6B30EE}"
  DeleteRegValue HKCU "$R0" "{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}"
  ; 탐색기에게 바탕화면을 다시 그리라고 알린다.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
FunctionEnd

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
