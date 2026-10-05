; MyCalc 설치 프로그램에 덧붙이는 부분.
;
; 1. 이미 깔려 있으면 통째로 들어낸 다음에 새로 깐다. 예전 판의 파일이 한 조각도
;    남지 않아야 한다. 덮어쓰기가 아니라 지우고 다시 까는 것이다.
; 2. 설정과 기록(언어, 테마, 그래프에 적어 둔 식, 받아 둔 환율표)은 사용자의
;    것이므로 함부로 지우지 않는다. 남아 있으면 지울지 묻고 고른 대로 한다.
;    아무것도 손대기 전에 먼저 묻는다. 묻기 전에 지우면 고를 것이 없다.
;    조용히 설치할 때(/S)는 물을 사람이 없으므로 그대로 둔다.
;
; electron-builder 가 붙여 주는 이름(${INSTALL_REGISTRY_KEY} 같은 것)은 이 파일을
; 읽어 들이는 시점에는 아직 정해져 있지 않다. 매크로는 끼워 넣는 자리에서 펼쳐지
; 므로 그 안에서는 쓸 수 있다. 그래서 이름을 읽는 일은 모두 customInit 안에서 하고,
; 함수들은 거기서 적어 둔 변수만 본다.
;
; 이 파일은 설치 프로그램을 만들 때와 제거 프로그램을 만들 때 두 번 읽힌다.
; 제거 프로그램에 쓰지 않는 코드가 들어가면 electron-builder 가 경고를 오류로
; 다루므로, 설치 쪽에서만 쓰는 것은 BUILD_UNINSTALLER 로 걸러 낸다.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef BUILD_UNINSTALLER

; 깔려 있는 판이 있는 자리. 없으면 빈 글자.
Var OldDir
; 그 판의 제거 프로그램. 없으면 빈 글자.
Var OldUninstaller
; 실행 파일 이름. customInit 에서 적어 둔다.
Var ExeName
; 설정이 놓이는 자리 세 가지. 쓰지 않는 것은 빈 글자.
Var DataOne
Var DataTwo
Var DataThree
; 설정이 남아 있으면 1.
Var HasOldData
; 설정을 지우기로 했으면 1. 되돌릴 수 없으므로 기본은 0.
Var WipeData

; 따옴표로 감싼 경로에서 경로만 꺼낸다.
; 제어판에 적힌 UninstallString 은 '"...exe" /currentuser' 꼴이다.
Function UnquotePath
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R1 $R0 1
  ${If} $R1 == '"'
    StrCpy $R0 $R0 "" 1
    StrCpy $R1 0
    quoteLoop:
      StrCpy $R2 $R0 1 $R1
      ${If} $R2 == ""
        Goto quoteDone
      ${EndIf}
      ${If} $R2 == '"'
        Goto quoteDone
      ${EndIf}
      IntOp $R1 $R1 + 1
      Goto quoteLoop
    quoteDone:
    StrCpy $R0 $R0 $R1
  ${EndIf}
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; 설정이 남아 있는지 본다.
;
; Electron 은 설정을 언제나 사용자별 자리에 둔다. 이름은 두 가지가 쓰인다.
; 깔아서 쓸 때는 보이는 이름(MyCalc)이고, 소스에서 바로 띄울 때는 package.json
; 의 이름(mycalc)이다. 둘 다 사용자의 것이므로 함께 본다.
Function FindOldData
  StrCpy $HasOldData 0
  SetShellVarContext current
  ${If} $DataOne != ""
  ${AndIf} ${FileExists} "$DataOne\*.*"
    StrCpy $HasOldData 1
  ${EndIf}
  ${If} $DataTwo != ""
  ${AndIf} ${FileExists} "$DataTwo\*.*"
    StrCpy $HasOldData 1
  ${EndIf}
  ${If} $DataThree != ""
  ${AndIf} ${FileExists} "$DataThree\*.*"
    StrCpy $HasOldData 1
  ${EndIf}
FunctionEnd

; 설정을 지운다. 지우기로 고른 사람이 있을 때만 불린다.
;
; 방금까지 돌던 프로그램은 파일을 바로 놓아 주지 않는다. Chromium 이 쓰는 캐시와
; Local Storage 는 창이 닫힌 뒤에도 잠깐 잡혀 있어서, 한 번에 지우면 폴더가 반만
; 지워진 채 남는다. 그래서 다 지워질 때까지 몇 번 더 해 본다.
Function WipeOldData
  SetShellVarContext current
  StrCpy $R2 0
  wipeRound:
    IntOp $R2 $R2 + 1
    ${If} $DataOne != ""
      RMDir /r "$DataOne"
    ${EndIf}
    ${If} $DataTwo != ""
      RMDir /r "$DataTwo"
    ${EndIf}
    ${If} $DataThree != ""
      RMDir /r "$DataThree"
    ${EndIf}
    ${If} $R2 >= 8
      Return
    ${EndIf}
    ${If} $DataOne != ""
    ${AndIf} ${FileExists} "$DataOne\*.*"
      Sleep 400
      Goto wipeRound
    ${EndIf}
    ${If} $DataThree != ""
    ${AndIf} ${FileExists} "$DataThree\*.*"
      Sleep 400
      Goto wipeRound
    ${EndIf}
FunctionEnd

; 깔려 있던 판을 들어낸다.
;
; 제거 프로그램은 자기가 놓인 폴더째 지워지므로, 임시 자리로 옮겨 놓고 돌린다.
; '_?=' 는 그 폴더를 자기 자리로 알고 돌되 스스로를 지우지는 말라는 뜻이다.
;
; '--updated' 를 주지 않는 것이 요점이다. 그 깃발은 '덮어쓰는 중' 이라는 뜻이어서
; 바로 가기와 적어 둔 값을 남긴다. 여기서 바라는 것은 완전히 지우는 쪽이다.
;
; 지우지 못하는 수도 있다. 프로그램이 돌고 있으면 파일이 잠긴다. 그때는 그대로
; 둔다. 이어서 electron-builder 가 가는 길에 프로그램을 닫으라는 안내가 있고,
; 거기서 제거를 다시 한 번 시도한다.
Function RemoveOldApp
  ${If} $OldUninstaller == ""
    ; 적힌 제거 프로그램이 없는데 파일만 남은 자리는 손으로 치운다.
    ${If} $OldDir != ""
    ${AndIf} ${FileExists} "$OldDir\$ExeName"
      RMDir /r "$OldDir"
    ${EndIf}
    Return
  ${EndIf}

  InitPluginsDir
  StrCpy $R0 "$PLUGINSDIR\mycalc-old-uninstaller.exe"
  ClearErrors
  CopyFiles /SILENT "$OldUninstaller" "$R0"
  ${If} ${Errors}
    StrCpy $R0 "$OldUninstaller"
  ${EndIf}

  ; 설정은 여기서 건드리지 않는다. 프로그램을 막 닫은 참이라 파일이 아직 잡혀
  ; 있어서, 지우면 반만 지워진 채 남는다. 지우는 일은 파일을 다 옮긴 뒤에 한다.
  DetailPrint "이전에 설치된 MyCalc 를 제거합니다"
  ExecWait '"$R0" /S _?=$OldDir' $R2

  ; 남은 것이 있으면 폴더째 치운다. 지난 판의 파일이 섞여 남으면 새로 깐 판이
  ; 무엇을 읽을지 알 수 없다.
  ${If} ${FileExists} "$OldDir\$ExeName"
    RMDir /r "$OldDir"
  ${Else}
    ; 껍데기만 남았을 때를 위해 한 번 더 쓸어 낸다.
    RMDir /r "$OldDir\resources"
    RMDir /r "$OldDir\locales"
    RMDir "$OldDir"
  ${EndIf}
FunctionEnd

; 설치를 시작하기 전에 자리를 비운다.
!macro customInit
  StrCpy $WipeData 0
  StrCpy $OldDir ""
  StrCpy $OldUninstaller ""
  StrCpy $ExeName "${APP_EXECUTABLE_FILENAME}"

  ; 설정이 놓이는 자리. 쓰이지 않는 이름은 빈 글자로 둔다.
  StrCpy $DataOne "$APPDATA\${APP_FILENAME}"
  !ifdef APP_PRODUCT_FILENAME
    StrCpy $DataTwo "$APPDATA\${APP_PRODUCT_FILENAME}"
  !else
    StrCpy $DataTwo ""
  !endif
  !ifdef APP_PACKAGE_NAME
    StrCpy $DataThree "$APPDATA\${APP_PACKAGE_NAME}"
  !else
    StrCpy $DataThree ""
  !endif

  ; 깔려 있는 판을 찾는다. 자리는 두 군데에 적혀 있다. 프로그램 키의
  ; InstallLocation 과 제어판 목록의 UninstallString 이다. 어느 한쪽만 남은 판도
  ; 있으므로 둘 다 본다. 사용자용과 컴퓨터용을 차례로 보는 것은 지난 판이 어느
  ; 쪽으로 깔렸는지 알 수 없기 때문이다.
  ReadRegStr $OldDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $OldDir == ""
    ReadRegStr $OldDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $OldDir == ""
    ReadRegStr $OldDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}

  ReadRegStr $R0 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${EndIf}
  ${If} $R0 != ""
    Push $R0
    Call UnquotePath
    Pop $OldUninstaller
  ${EndIf}

  ; 제거 프로그램이 없는 자리는 자리가 아니다.
  ${If} $OldUninstaller != ""
  ${AndIfNot} ${FileExists} "$OldUninstaller"
    StrCpy $OldUninstaller ""
  ${EndIf}

  ; 자리가 적혀 있지 않으면 제거 프로그램이 놓인 폴더가 그 자리이다.
  ${If} $OldDir == ""
  ${AndIf} $OldUninstaller != ""
    ${GetParent} "$OldUninstaller" $OldDir
  ${EndIf}

  ; 실행 파일도 제거 프로그램도 없으면 깔려 있지 않은 것이다.
  ${If} $OldDir != ""
  ${AndIf} $OldUninstaller == ""
  ${AndIfNot} ${FileExists} "$OldDir\$ExeName"
    StrCpy $OldDir ""
  ${EndIf}

  Call FindOldData

  ; 지울지는 아무것도 손대기 전에 묻는다. 기본은 '아니오' 이다.
  ${IfNot} ${Silent}
  ${AndIf} $HasOldData == 1
    ${If} $LANGUAGE == 1042
      StrCpy $R0 "이전에 쓰던 MyCalc 의 설정이 남아 있습니다.$\n언어와 테마, 그래프에 적어 둔 식, 받아 둔 환율표입니다.$\n$\n이 설정도 함께 지울까요?$\n'아니오' 를 고르면 설정은 그대로 두고 프로그램만 다시 설치합니다."
    ${Else}
      StrCpy $R0 "Settings from an earlier MyCalc are still here.$\nThe language and theme, the formulas on the graph, and the saved exchange rates.$\n$\nErase them as well?$\nChoose No to keep them and only reinstall the program."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$R0" /SD IDNO IDNO keepData
      StrCpy $WipeData 1
    keepData:
  ${EndIf}

  ${If} $OldDir != ""
    Call RemoveOldApp
  ${EndIf}
!macroend

; 설정을 지우는 것은 맨 뒤로 미룬다. 여기까지 오면 돌고 있던 프로그램은 확실히
; 닫혀 있고(electron-builder 가 닫으라고 안내한 다음이다), 새 파일도 다 놓였다.
; 새로 깐 프로그램은 아직 뜨기 전이므로 지운 자리를 다시 만들어 놓지도 않는다.
!macro customInstall
  ${If} $WipeData == 1
    DetailPrint "이전 설정을 지웁니다"
    Call WipeOldData
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER
