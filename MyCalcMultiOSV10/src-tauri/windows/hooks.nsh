; MyCalc 설치 프로그램에 덧붙이는 부분.
;
; 1. 이미 깔려 있으면 통째로 들어낸 다음에 새로 깐다. 예전 판의 파일이 한 조각도
;    남지 않아야 한다. 덮어쓰기가 아니라 지우고 다시 까는 것이다.
; 2. 설정과 기록(언어, 테마, 그래프에 적어 둔 식, 받아 둔 환율표)은 사용자의
;    것이므로 함부로 지우지 않는다. 남아 있으면 지울지 묻고 고른 대로 한다.
;    아무것도 손대기 전에 먼저 묻는다. 묻기 전에 지우면 고를 것이 없다.
;    조용히 설치할 때(/S)는 물을 사람이 없으므로 그대로 둔다.
;
; Tauri 가 붙여 주는 이름(${INSTALL_REGISTRY_KEY} 같은 것)은 이 파일을
; 읽어 들이는 시점에는 아직 정해져 있지 않을 수 있다. 매크로는 끼워 넣는 자리에서
; 펼쳐지므로 그 안에서는 쓸 수 있다. 그래서 이름을 읽는 일은 모두 customInit
; 안에서 하고, 함수들은 거기서 적어 둔 변수만 본다. 이름이 없으면 아래 기본값을 쓴다.
;
; 이 파일은 설치 프로그램을 만들 때와 제거 프로그램을 만들 때 두 번 읽힐 수 있다.
; 제거 프로그램에 쓰지 않는 코드는 BUILD_UNINSTALLER 로 걸러 낸다.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef APP_EXECUTABLE_FILENAME
  !define APP_EXECUTABLE_FILENAME "MyCalc.exe"
!endif
!ifndef APP_FILENAME
  !define APP_FILENAME "MyCalc"
!endif
!ifndef APP_PRODUCT_FILENAME
  !define APP_PRODUCT_FILENAME "mycalc"
!endif
!ifndef APP_PACKAGE_NAME
  !define APP_PACKAGE_NAME "local.mycalc.desktop"
!endif
!ifndef INSTALL_REGISTRY_KEY
  !define INSTALL_REGISTRY_KEY "Software\MyCalc"
!endif
!ifndef UNINSTALL_REGISTRY_KEY
  !define UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyCalc"
!endif

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
; 설정은 사용자별 자리에 둔다. 예전 Electron 판은 %APPDATA%\MyCalc 와
; %APPDATA%\mycalc 를 썼고, Tauri 판은 식별자 폴더(local.mycalc.desktop)를 쓴다.
; 셋 다 사용자의 것이므로 함께 본다.
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
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
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
    ${If} ${FileExists} "$LOCALAPPDATA\${APP_PACKAGE_NAME}\*.*"
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
; 둔다. 이어서 설치 마법사가 프로그램을 닫으라고 안내하고, 거기서 제거를 다시
; 한 번 시도한다.
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
  StrCpy $ExeName "${MAINBINARYNAME}.exe"

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

  ; 깔려 있는 판을 찾는다. Tauri 는 제어판 키의 InstallLocation 과 제품 키의
  ; 기본값에 자리를 둔다. InstallLocation 은 따옴표로 감싸여 있다.
  ; 예전 Electron 판은 식별자 키에 남아 있을 수 있어 그것도 본다.
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" InstallLocation
  ${If} $R0 != ""
    Push $R0
    Call UnquotePath
    Pop $OldDir
  ${EndIf}
  ${If} $OldDir == ""
    ReadRegStr $OldDir SHCTX "${MANUPRODUCTKEY}" ""
  ${EndIf}
  ${If} $OldDir == ""
    ReadRegStr $OldDir HKCU "Software\local.mycalc.desktop" InstallLocation
  ${EndIf}
  ${If} $OldDir == ""
    ReadRegStr $OldDir HKLM "Software\local.mycalc.desktop" InstallLocation
  ${EndIf}

  ReadRegStr $R0 SHCTX "${UNINSTKEY}" UninstallString
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\local.mycalc.desktop" UninstallString
  ${EndIf}
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\local.mycalc.desktop" UninstallString
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
; 닫혀 있고(설치 마법사가 닫으라고 안내한 다음이다), 새 파일도 다 놓였다.
; 새로 깐 프로그램은 아직 뜨기 전이므로 지운 자리를 다시 만들어 놓지도 않는다.
!macro customInstall
  ${If} $WipeData == 1
    DetailPrint "이전 설정을 지웁니다"
    Call WipeOldData
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro customInit
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro customInstall
!macroend

!else

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!endif ; BUILD_UNINSTALLER
