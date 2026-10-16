; MyDeskBox 설치·제거 프로그램에 덧붙이는 일 (Tauri NSIS 훅).
;
; 설치할 때
;   - 앞서 깐 MyDeskBox(Electron 판이든 Tauri 판이든)가 있으면 모두 지우고 새로 깐다.
;   - 사용자 데이터(%APPDATA%\MyDeskBox: 박스 배치와 박스에 담아 둔 파일)가 있으면 지울지 묻는다.
;       예     : 박스에 담아 둔 파일을 먼저 바탕화면으로 돌려놓고 데이터를 지운다.
;       아니오 : 그대로 둔다. 새 프로그램이 이어서 쓴다 (형식이 같다).
;       취소   : 설치를 그만둔다.
;   - 앞 판을 지울 때는 늘 '데이터를 두는' 길(Electron --updated, Tauri /UPDATE)로 조용히 지운다.
;     데이터를 지우는 것은 새 프로그램을 깐 뒤에 새 실행 파일의 --restore-desktop 으로 한다.
;
; 지울 때
;   - 돌고 있는 앱을 닫고(Restart Manager: 앱은 WM_ENDSESSION 을 받아 스스로 되돌린다),
;     --restore-desktop 으로 바탕화면을 켜기 전 모습으로 돌려놓는다. 안 되면 손으로 옮긴다.
;   - 시작프로그램 값과 이 프로그램을 가리키는 바로 가기를 치운다.
;   - '앱 데이터 삭제' 를 골랐으면 %APPDATA%\MyDeskBox 도 지운다.
;
; Tauri 의 훅은 페이지를 더할 수 없다. 그래서 묻는 일은 첫 페이지가 뜨기 전(MUI 의 GUI 초기화)에 한다.
; 이 파일은 설치 스크립트 맨 위에서 읽힌다. 템플릿의 변수($PassiveMode 따위)는 아직 없으므로
; 함수 안에서는 쓰지 않는다. 훅 매크로는 Section 안에 펼쳐지므로 그 안에서는 써도 된다.

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"

!define MDB_NAME "MyDeskBox"
!define MDB_EXE "MyDeskBox.exe"
; 사용자 데이터. Electron 판과 같은 자리다 (src-tauri/src/paths.rs).
!define MDB_DATA "$APPDATA\MyDeskBox"
; WebView2 가 쓰는 자리 (Tauri 가 identifier 로 짓는다).
!define MDB_WEBVIEW "$LOCALAPPDATA\com.suhokwon.mydeskbox"
; Electron 판(electron-builder)의 등록 자리. appId com.suhokwon.mydeskbox 에서 나온 GUID 다.
!define MDB_EL_GUID "a8d70341-b4f1-5dbf-be0f-be8f75940d6e"
!define MDB_EL_KEY "Software\${MDB_EL_GUID}"
!define MDB_EL_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MDB_EL_GUID}"
!define MDB_EL_UNINSTALLER "Uninstall MyDeskBox.exe"
; Tauri 판의 등록 자리 (템플릿의 UNINSTKEY 와 같다).
!define MDB_TA_UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyDeskBox"
!define MDB_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define MDB_HIDE_NEW "Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel"
!define MDB_HIDE_OLD "Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\ClassicStartMenu"

; 1 이면 사용자 데이터를 지운다. 지우는 것은 되돌릴 수 없으므로 기본은 0 이다.
Var MdbWipe
; 앞 판을 이미 지웠으면 1.
Var MdbOldDone
; 앞 판이 하나라도 있으면 1. 둘 다 깔려 있을 수 있다.
Var MdbOldKind
; Tauri 판의 제거 프로그램, Electron 판의 폴더. 없으면 빈 문자열.
Var MdbTaUn
Var MdbElDir
; Electron 판의 등록만 남고 폴더는 없어졌으면 1. '앱' 목록에 깨진 줄로 남으므로 치운다.
Var MdbElStale

!define MUI_CUSTOMFUNCTION_GUIINIT MdbGuiInit

; ---------------------------------------------------------------------------
; 설치·제거 프로그램이 함께 쓰는 함수. NSIS 는 제거 프로그램 함수에 un. 을 붙여야 하므로 두 번 만든다.
!macro MDB_COMMON p

; 돌고 있는 앱을 닫는다. 실행 파일 경로를 넣는다.
; Restart Manager 는 창에 WM_QUERYENDSESSION·WM_ENDSESSION 을 보내고, 버티면 끝낸다.
; 앱은 WM_ENDSESSION 에서 바탕화면을 되돌린다 (src-tauri/src/session.rs).
Function ${p}MdbCloseApp
  Exch $0
  Push $1
  Push $2
  Push $3
  ${If} ${FileExists} "$0"
    System::Call 'RSTRTMGR::RmStartSession(*i -1 .r1, i 0, w .r3) i .r2'
    ${If} $2 = 0
      System::Call 'RSTRTMGR::RmRegisterResources(i r1, i 1, *ws, i 0, p 0, i 0, p 0) i .r2' "$0"
      ${If} $2 = 0
        System::Call 'RSTRTMGR::RmShutdown(i r1, i 1, p 0) i .r2'
      ${EndIf}
      System::Call 'RSTRTMGR::RmEndSession(i r1)'
    ${EndIf}
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; 바로 가기(.lnk)가 가리키는 파일 경로. 경로를 넣으면 대상을 돌려준다. 읽지 못하면 빈 문자열.
Function ${p}MdbShortcutTarget
  Exch $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  StrCpy $R4 ""
  ; CLSID_ShellLink, IID_IShellLinkW
  System::Call "ole32::CoCreateInstance(g '{00021401-0000-0000-C000-000000000046}', p 0, i 1, g '{000214F9-0000-0000-C000-000000000046}', *p .R1) i .R2"
  ${If} $R2 = 0
    ; IID_IPersistFile
    System::Call "$R1->0(g '{0000010B-0000-0000-C000-000000000046}', *p .R3) i .R2"
    ${If} $R2 = 0
      System::Call "$R3->5(w R0, i 0) i .R2"
      ${If} $R2 = 0
        System::Call "$R1->3(w .R4, i ${NSIS_MAX_STRLEN}, p 0, i 0) i .R2"
        ${If} $R2 != 0
          StrCpy $R4 ""
        ${EndIf}
      ${EndIf}
      System::Call "$R3->2()"
    ${EndIf}
    System::Call "$R1->2()"
  ${EndIf}
  StrCpy $R0 $R4
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; 이 실행 파일을 가리키는 바로 가기를 바탕화면과 시작 메뉴에서 모두 지운다.
; 박스에서 돌아온 바로 가기는 'MyDeskBox (2).lnk' 처럼 이름이 바뀌어 있을 수 있어 대상을 읽어 본다.
; 다른 프로그램의 바로 가기는 건드리지 않는다. StrCmp 는 대소문자를 가리지 않는다.
Function ${p}MdbDropShortcutsTo
  Exch $3
  Push $0
  Push $1
  Push $2
  FindFirst $0 $1 "$DESKTOP\*.lnk"
  ${DoWhile} $1 != ""
    Push "$DESKTOP\$1"
    Call ${p}MdbShortcutTarget
    Pop $2
    ${If} $2 == $3
      Delete "$DESKTOP\$1"
    ${EndIf}
    FindNext $0 $1
  ${Loop}
  FindClose $0
  ${If} ${FileExists} "$SMPROGRAMS\${MDB_NAME}.lnk"
    Push "$SMPROGRAMS\${MDB_NAME}.lnk"
    Call ${p}MdbShortcutTarget
    Pop $2
    ${If} $2 == $3
      Delete "$SMPROGRAMS\${MDB_NAME}.lnk"
    ${EndIf}
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
  Pop $3
FunctionEnd

; 폴더 하나에 든 것을 모두 바탕화면으로 옮긴다. 폴더 경로를 넣는다.
; 같은 이름이 이미 있으면 앞에 번호를 붙여 둘 다 남긴다. 덮어쓰지 않는다.
Function ${p}MdbEmptyToDesktop
  Exch $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  FindFirst $R4 $R5 "$R3\*.*"
  ${DoWhile} $R5 != ""
    ${If} $R5 != "."
    ${AndIf} $R5 != ".."
      StrCpy $R7 0
      StrCpy $R6 "$DESKTOP\$R5"
      ${DoWhile} ${FileExists} "$R6"
        IntOp $R7 $R7 + 1
        StrCpy $R6 "$DESKTOP\($R7) $R5"
      ${Loop}
      ClearErrors
      Rename "$R3\$R5" "$R6"
      ${IfNot} ${Errors}
        SetFileAttributes "$R6" NORMAL
      ${EndIf}
    ${EndIf}
    FindNext $R4 $R5
  ${Loop}
  FindClose $R4
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
FunctionEnd

; 프로그램이 되돌리지 못했을 때 쓰는 손 복구. 보관함(boxes)의 박스 폴더마다 든 것을 바탕화면으로 옮긴다.
; 어디서 왔는지는 보지 않는다. 눈에 보이는 자리에 두는 것이 보관함에 남기는 것보다 낫다.
; held 는 아주 예전 판이 파일을 옮겨 두던 자리다.
Function ${p}MdbRestoreBoxFiles
  Push $R0
  Push $R1
  Push $R2
  StrCpy $R0 "${MDB_DATA}\boxes"
  ${If} ${FileExists} "$R0\*.*"
    FindFirst $R1 $R2 "$R0\*.*"
    ${DoWhile} $R2 != ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
      ${AndIf} ${FileExists} "$R0\$R2\*.*"
        Push "$R0\$R2"
        Call ${p}MdbEmptyToDesktop
        RMDir "$R0\$R2"
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
  ${EndIf}
  ${If} ${FileExists} "${MDB_DATA}\held\*.*"
    Push "${MDB_DATA}\held"
    Call ${p}MdbEmptyToDesktop
  ${EndIf}
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

; 바탕화면 보기에 '새로 고침' 만 보낸다. SHCNE_ASSOCCHANGED 는 바탕화면 그림을 모두 지우므로 쓰지 않는다.
Function ${p}MdbRefreshDesktop
  Push $0
  Push $1
  Push $2
  FindWindow $0 "Progman" ""
  System::Call 'user32::FindWindowExW(p r0, p 0, w "SHELLDLL_DefView", p 0) p .r1'
  StrCpy $0 0
  ${DoWhile} $1 = 0
    System::Call 'user32::FindWindowExW(p 0, p r0, w "WorkerW", p 0) p .r0'
    ${IfThen} $0 = 0 ${|} ${Break} ${|}
    System::Call 'user32::FindWindowExW(p r0, p 0, w "SHELLDLL_DefView", p 0) p .r1'
  ${Loop}
  ${If} $1 <> 0
    System::Call 'user32::SendMessageTimeoutW(p r1, i ${WM_COMMAND}, p 0x7103, p 0, i 2, i 500, *p .r2)'
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; 감춰 둔 셸 아이콘(휴지통, 내 PC 따위)을 다시 보이게 한다. 값을 지우면 기본값(보이기)이 된다.
; 목록은 src-tauri/src/desktop/windows.rs 의 SHELL_CLSID 와 같아야 한다.
Function ${p}MdbShowShellIcons
  !insertmacro MDB_SHOW_ICON "{645FF040-5081-101B-9F08-00AA002F954E}"
  !insertmacro MDB_SHOW_ICON "{20D04FE0-3AEA-1069-A2D8-08002B30309D}"
  !insertmacro MDB_SHOW_ICON "{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}"
  !insertmacro MDB_SHOW_ICON "{59031A47-3F72-44A7-89C5-5595FE6B30EE}"
  !insertmacro MDB_SHOW_ICON "{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}"
  Call ${p}MdbRefreshDesktop
FunctionEnd

; 바탕화면을 켜기 전 모습으로 돌려놓는다. 실행 파일 경로를 넣는다.
; 아이콘 자리와 감춘 셸 아이콘은 프로그램만 정확히 되돌린다(--restore-desktop). 없거나 실패하면 손으로 한다.
Function ${p}MdbRestoreDesktop
  Exch $0
  Push $1
  StrCpy $1 1
  ${If} ${FileExists} "$0"
    DetailPrint "$(^Name): --restore-desktop"
    ClearErrors
    ExecWait '"$0" --restore-desktop' $1
    ${IfThen} ${Errors} ${|} StrCpy $1 1 ${|}
  ${EndIf}
  ${If} $1 != 0
    Call ${p}MdbRestoreBoxFiles
    Call ${p}MdbShowShellIcons
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

!macroend

!macro MDB_SHOW_ICON clsid
  DeleteRegValue HKCU "${MDB_HIDE_NEW}" "${clsid}"
  DeleteRegValue HKCU "${MDB_HIDE_OLD}" "${clsid}"
!macroend

!insertmacro MDB_COMMON ""
!insertmacro MDB_COMMON "un."

; ---------------------------------------------------------------------------
; 설치 프로그램에만 있는 함수.

; 따옴표를 걷어 낸다. 레지스트리에는 "C:\...\uninstall.exe" 처럼 적혀 있다.
Function MdbUnquote
  Exch $0
  Push $1
  StrCpy $1 $0 1
  ${If} $1 == '"'
    StrCpy $0 $0 "" 1
  ${EndIf}
  StrCpy $1 $0 1 -1
  ${If} $1 == '"'
    StrCpy $0 $0 -1
  ${EndIf}
  Pop $1
  Exch $0
FunctionEnd

; 앞서 깐 판을 찾는다. Tauri 판과 Electron 판이 함께 있을 수 있어 둘 다 본다.
; 하나라도 있으면 $MdbOldKind 가 1 이다.
Function MdbFindOld
  StrCpy $MdbOldKind ""
  StrCpy $MdbTaUn ""
  StrCpy $MdbElDir ""
  StrCpy $MdbElStale 0

  ; Tauri 판
  ReadRegStr $0 HKCU "${MDB_TA_UNKEY}" "UninstallString"
  ${If} $0 != ""
    Push $0
    Call MdbUnquote
    Pop $0
    ${If} ${FileExists} "$0"
      StrCpy $MdbTaUn $0
      StrCpy $MdbOldKind 1
    ${EndIf}
  ${EndIf}

  ; Electron 판. 사용자용으로 깔렸고, 컴퓨터용도 한 번 더 본다.
  ReadRegStr $0 HKCU "${MDB_EL_KEY}" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "${MDB_EL_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${MDB_EL_UNINSTALLER}"
    StrCpy $MdbElDir $0
    StrCpy $MdbOldKind 1
  ${Else}
    ReadRegStr $1 HKCU "${MDB_EL_UNKEY}" "UninstallString"
    ${If} "$0$1" != ""
      StrCpy $MdbElStale 1
    ${EndIf}
  ${EndIf}
FunctionEnd

; 폴더 하나에 깔린 앞 판을 치운다. 폴더를 넣는다.
; 제자리에서 돈 제거 프로그램은 자기 자신을 지우지 못하므로 남은 것까지 지운다.
; 폴더째 지우는 것은 우리 폴더임이 확실할 때만 한다 (이름이 MyDeskBox 로 끝난다).
; 앞 판이 남긴 바로 가기는 없어진 실행 파일을 가리키므로 함께 지운다.
Function MdbSweepDir
  Exch $0
  Push $1
  Push "$0\${MDB_EXE}"
  Call MdbDropShortcutsTo
  StrCpy $1 $0 "" -9
  ${If} $1 == "${MDB_NAME}"
    RMDir /r "$0"
  ${Else}
    Delete "$0\${MDB_EXE}"
    Delete "$0\uninstall.exe"
    Delete "$0\${MDB_EL_UNINSTALLER}"
    RMDir "$0"
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

; 앞 판을 조용히 모두 지운다. 사용자 데이터는 여기서 건드리지 않는다.
; _?= 를 주면 제거 프로그램이 제자리에서 돌고 끝날 때까지 기다린다.
Function MdbRemoveOld
  StrCpy $MdbOldDone 1

  ${If} $MdbTaUn != ""
    ${GetParent} $MdbTaUn $2
    DetailPrint "$(^Name): $2"
    Push "$2\${MDB_EXE}"
    Call MdbCloseApp
    ExecWait '"$MdbTaUn" /S /UPDATE _?=$2'
    Push $2
    Call MdbSweepDir
  ${EndIf}

  ${If} $MdbElDir != ""
    DetailPrint "$(^Name): $MdbElDir"
    Push "$MdbElDir\${MDB_EXE}"
    Call MdbCloseApp
    ExecWait '"$MdbElDir\${MDB_EL_UNINSTALLER}" /S --updated /currentuser _?=$MdbElDir'
    Push $MdbElDir
    Call MdbSweepDir
  ${EndIf}

  ${If} $MdbElDir != ""
  ${OrIf} $MdbElStale == 1
    DeleteRegKey HKCU "${MDB_EL_UNKEY}"
    DeleteRegKey HKCU "${MDB_EL_KEY}"
  ${EndIf}
FunctionEnd

; 첫 페이지가 뜨기 전에 한 번 돈다. 조용한 설치(/S)에서는 돌지 않는다.
Function MdbGuiInit
  StrCpy $MdbWipe 0
  Call MdbFindOld

  StrCpy $1 0
  ${If} ${FileExists} "${MDB_DATA}\layout.json"
  ${OrIf} ${FileExists} "${MDB_DATA}\boxes\*.*"
    StrCpy $1 1
  ${EndIf}

  ; 수동 설치(/P)에서는 묻지 않는다. 데이터는 둔다.
  ${GetParameters} $2
  ClearErrors
  ${GetOptions} $2 "/P" $3
  ${IfNot} ${Errors}
    Call MdbRemoveOld
    Return
  ${EndIf}

  ${If} $LANGUAGE == 1042
    StrCpy $4 "이전에 설치한 ${MDB_NAME} 가 있습니다. 완전히 지운 뒤 새로 설치합니다."
    StrCpy $5 "사용자 데이터(박스 배치·설정·박스에 담아 둔 파일)가 남아 있습니다.$\n$\n지울까요?$\n$\n예: 박스에 담아 둔 파일을 바탕화면으로 돌려놓고 데이터를 지웁니다.$\n아니오: 데이터를 그대로 두고 새 프로그램이 이어서 씁니다.$\n취소: 설치를 그만둡니다."
    StrCpy $6 "사용자 데이터를 지웁니다. 박스 배치는 되돌릴 수 없습니다.$\n박스에 담겨 있던 파일은 바탕화면으로 돌려놓습니다.$\n$\n정말 지울까요?"
  ${Else}
    StrCpy $4 "An earlier ${MDB_NAME} is installed. It will be removed completely before installing."
    StrCpy $5 "User data (box layout, settings and the files kept in boxes) is still there.$\n$\nDelete it?$\n$\nYes: return the files kept in boxes to the desktop, then delete the data.$\nNo: keep the data; the new program carries on with it.$\nCancel: stop the installation."
    StrCpy $6 "Your user data will be deleted. The box layout cannot be brought back.$\nFiles kept in boxes are returned to the desktop.$\n$\nDelete it?"
  ${EndIf}

  ${If} $1 == 1
    ${If} $MdbOldKind != ""
      StrCpy $5 "$4$\n$\n$5"
    ${EndIf}
    ask:
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON2 "$5" IDYES askYes IDNO askNo
    Quit
    askYes:
      ; 되돌릴 수 없는 일이므로 한 번 더 묻는다. 아니라면 처음 물음으로 돌아간다.
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "$6" IDYES wipeOk
      Goto ask
      wipeOk:
      StrCpy $MdbWipe 1
    askNo:
  ${ElseIf} $MdbOldKind != ""
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$4" IDOK +2
    Quit
  ${EndIf}

  ; 앞 판을 지워 두면 Tauri 의 '이미 설치됨' 페이지는 스스로 건너뛴다.
  Call MdbRemoveOld
FunctionEnd

; ---------------------------------------------------------------------------
; 훅

!macro NSIS_HOOK_PREINSTALL
  ; 조용한 설치에서는 MdbGuiInit 이 돌지 않았다. 묻지 않고 데이터는 둔 채 앞 판을 지운다.
  ${If} $MdbOldDone != 1
    Call MdbFindOld
    Call MdbRemoveOld
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 지우기로 했으면 새 실행 파일로 바탕화면을 먼저 되돌린 뒤 데이터를 지운다.
  ${If} $MdbWipe == 1
    Push "$INSTDIR\${MDB_EXE}"
    Call MdbRestoreDesktop
    RMDir /r "${MDB_DATA}"
    RMDir /r "${MDB_WEBVIEW}"
  ${EndIf}
  ; 시작프로그램에 앞 판의 경로가 적혀 있으면 새 경로로 바꾼다. 이름은 src-tauri/src/autostart.rs 와 같다.
  ; 'com.suhokwon.mydeskbox' 는 이름을 적어 주기 전 판이 남긴 것이다.
  ReadRegStr $0 HKCU "${MDB_RUN_KEY}" "${MDB_NAME}"
  ReadRegStr $1 HKCU "${MDB_RUN_KEY}" "com.suhokwon.mydeskbox"
  ${If} $MdbWipe == 1
    DeleteRegValue HKCU "${MDB_RUN_KEY}" "${MDB_NAME}"
  ${ElseIf} "$0$1" != ""
    WriteRegStr HKCU "${MDB_RUN_KEY}" "${MDB_NAME}" '"$INSTDIR\${MDB_EXE}"'
  ${EndIf}
  DeleteRegValue HKCU "${MDB_RUN_KEY}" "com.suhokwon.mydeskbox"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 새 판을 깔기 위해 조용히 지우는 길(/UPDATE)에서는 바탕화면도 데이터도 건드리지 않는다.
  ${If} $UpdateMode <> 1
    Push "$INSTDIR\${MDB_EXE}"
    Call un.MdbCloseApp
    Push "$INSTDIR\${MDB_EXE}"
    Call un.MdbRestoreDesktop
    DeleteRegValue HKCU "${MDB_RUN_KEY}" "${MDB_NAME}"
    DeleteRegValue HKCU "${MDB_RUN_KEY}" "com.suhokwon.mydeskbox"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; 마지막 판단. 앱은 이미 멈췄으므로 다시 담을 수 없다. 앞에서 되돌렸으면 옮길 것이 없다.
    Call un.MdbRestoreBoxFiles
    ; 바로 가기는 되돌리기가 끝난 뒤에 지운다. 먼저 지우면 박스에 담겨 있던 바로 가기가 뒤에 돌아와 남는다.
    Push "$INSTDIR\${MDB_EXE}"
    Call un.MdbDropShortcutsTo
    ${If} $DeleteAppDataCheckboxState = 1
      RMDir /r "${MDB_DATA}"
      RMDir /r "${MDB_WEBVIEW}"
    ${EndIf}
  ${EndIf}
!macroend
