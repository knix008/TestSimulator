; Custom NSIS script for My Editor
;
;  • a page letting the user choose Desktop / Start Menu shortcuts
;    (Korean when the installer runs in Korean, English otherwise)
;  • a page for the file associations: "Open with" entries with a file-type
;    icon per language (build/fileicons, generated) and — if the user wants —
;    My Editor as the default editor of those files (per user, HKCU)
;  • a clean reinstall: electron-builder runs the previous version's
;    uninstaller first, and this script sweeps whatever it left behind
;  • asks before deleting the data (session, settings) an earlier
;    installation left behind — silent installs keep it
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var PrevInstallDir
Var AssocCheckbox
Var DefaultCheckbox
Var DoAssoc
Var DoDefault

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"
  StrCpy $DoAssoc "1"
  StrCpy $DoDefault "0"

  StrCpy $PrevInstallDir ""
  ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $PrevInstallDir $0
  ${Else}
    ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $0 != ""
      StrCpy $PrevInstallDir $0
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom ShortcutsPageCreate ShortcutsPageLeave
  Page custom AssocPageCreate AssocPageLeave
!macroend

; ── File associations page ────────────────────────────────
Function AssocPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${If} $LANGUAGE == 1042
    ${NSD_CreateLabel} 0 0u 100% 36u "파일 형식 등록을 선택하세요.$\r$\n소스 코드·텍스트 파일(JavaScript · Python · C/C++ · Markdown · JSON · SQL 등 35가지 형식, 90여 개 확장자)을 My Editor 와 연결합니다. 현재 사용자 계정에만 등록되며 제거 시 함께 지워집니다."
    Pop $0
    ${NSD_CreateCheckbox} 0 44u 100% 12u "'연결 프로그램' 목록에 My Editor 추가 (언어별 파일 아이콘 포함)"
    Pop $AssocCheckbox
    ${NSD_CreateCheckbox} 0 62u 100% 12u "My Editor 를 이 파일들의 기본 편집기로 등록 (더블클릭으로 열림, 탐색기에 언어별 아이콘 표시)"
    Pop $DefaultCheckbox
    ${NSD_CreateLabel} 0 84u 100% 40u "기본 편집기로 등록하지 않으면 각 파일의 아이콘은 기존 프로그램의 것이 유지되고, 오른쪽 클릭 › 연결 프로그램에서 My Editor 를 고를 수 있습니다. 나중에 Windows 설정 › 앱 › 기본 앱에서 언제든 바꿀 수 있습니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 36u "Choose how My Editor registers file types.$\r$\nSource and text files (JavaScript, Python, C/C++, Markdown, JSON, SQL … 35 types, 90+ extensions) are associated for the current user only and removed on uninstall."
    Pop $0
    ${NSD_CreateCheckbox} 0 44u 100% 12u "Add My Editor to the 'Open with' list (with an icon per language)"
    Pop $AssocCheckbox
    ${NSD_CreateCheckbox} 0 62u 100% 12u "Make My Editor the default editor of these files (double-click opens them, Explorer shows the language icons)"
    Pop $DefaultCheckbox
    ${NSD_CreateLabel} 0 84u 100% 40u "Without the default registration the files keep their current program and icon; My Editor appears under right-click › Open with. You can change this any time in Windows Settings › Apps › Default apps."
    Pop $0
  ${EndIf}
  ${NSD_Check} $AssocCheckbox
  nsDialogs::Show
FunctionEnd

Function AssocPageLeave
  ${NSD_GetState} $AssocCheckbox $0
  ${If} $0 == 1
    StrCpy $DoAssoc "1"
  ${Else}
    StrCpy $DoAssoc "0"
  ${EndIf}
  ${NSD_GetState} $DefaultCheckbox $0
  ${If} $0 == 1
    StrCpy $DoAssoc "1"
    StrCpy $DoDefault "1"
  ${Else}
    StrCpy $DoDefault "0"
  ${EndIf}
FunctionEnd

; One file type (build/fileicons/file-types.nsh): a ProgID with the icon and
; the open command; every extension gets the ProgID in its "Open with" list
; and, if chosen, as its default.
!macro MED_FILE_TYPE key name exts
  ${If} $DoAssoc == "1"
    WriteRegStr HKCU "Software\Classes\MyEditor.${key}" "" "${name} — ${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Classes\MyEditor.${key}\DefaultIcon" "" "$INSTDIR\resources\fileicons\${key}.ico,0"
    WriteRegStr HKCU "Software\Classes\MyEditor.${key}\shell\open" "" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Classes\MyEditor.${key}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
    StrCpy $R9 "${key}"
    Push "${exts}"
    Call MedForEachExt
  ${EndIf}
!macroend

; Splits the space-separated extensions on the stack ($R9 = key) and registers each.
Var MedExtKey
Var MedExtList
Var MedExtOne
Function MedForEachExt
  Pop $MedExtList
  StrCpy $MedExtKey $R9
  MedExtLoop:
    StrCpy $MedExtOne ""
    StrCpy $2 0
    MedExtScan:
      StrCpy $3 $MedExtList 1 $2
      ${If} $3 == ""
        StrCpy $MedExtOne $MedExtList
        StrCpy $MedExtList ""
        Goto MedExtGot
      ${EndIf}
      ${If} $3 == " "
        StrCpy $MedExtOne $MedExtList $2
        IntOp $2 $2 + 1
        StrCpy $MedExtList $MedExtList "" $2
        Goto MedExtGot
      ${EndIf}
      IntOp $2 $2 + 1
      Goto MedExtScan
    MedExtGot:
    ${If} $MedExtOne != ""
      WriteRegStr HKCU "Software\Classes\.$MedExtOne\OpenWithProgids" "MyEditor.$MedExtKey" ""
      ${If} $DoDefault == "1"
        WriteRegStr HKCU "Software\Classes\.$MedExtOne" "" "MyEditor.$MedExtKey"
      ${EndIf}
    ${EndIf}
    ${If} $MedExtList != ""
      Goto MedExtLoop
    ${EndIf}
FunctionEnd


Function ShortcutsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Language 1042 = Korean
  ${If} $LANGUAGE == 1042
    ${NSD_CreateLabel} 0 0u 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "바탕화면에 바로가기 만들기"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "시작 메뉴에 바로가기 만들기"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 76u 100% 40u "My Editor 는 탭 방식의 텍스트 · 코드 편집기입니다. 150여 개 언어의 구문 강조, 찾기/바꾸기, 인코딩·줄 끝 변환, 폴더 트리, Markdown WYSIWYG 편집과 미리보기를 지원합니다.$\r$\n이미 설치된 My Editor 가 있으면 완전히 삭제한 뒤 다시 설치합니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 24u "Choose the shortcuts to create after installation."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop shortcut"
    Pop $DesktopShortcutCheckbox
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Create Start Menu shortcut"
    Pop $StartMenuShortcutCheckbox
    ${NSD_CreateLabel} 0 76u 100% 40u "My Editor is a tabbed text / code editor: syntax highlighting for 150+ languages, find & replace, encodings and line endings, a folder tree, Markdown WYSIWYG editing and preview.$\r$\nAn existing installation is removed completely before the new one is installed."
    Pop $0
  ${EndIf}

  ${NSD_Check} $DesktopShortcutCheckbox
  ${NSD_Check} $StartMenuShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function ShortcutsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == 1
    StrCpy $DoCreateDesktopShortcut "1"
  ${Else}
    StrCpy $DoCreateDesktopShortcut "0"
  ${EndIf}

  ${NSD_GetState} $StartMenuShortcutCheckbox $0
  ${If} $0 == 1
    StrCpy $DoCreateStartMenuShortcut "1"
  ${Else}
    StrCpy $DoCreateStartMenuShortcut "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; ── Leftovers of an earlier installation ─────────────────
  ${If} $PrevInstallDir != ""
  ${AndIf} $PrevInstallDir != $INSTDIR
    RMDir /r "$PrevInstallDir"
  ${EndIf}

  ; ── Data left behind by an earlier installation ─────────
  SetShellVarContext current
  StrCpy $0 "0"
  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 "1"
  ${EndIf}

  ${If} $0 == "1"
    ${If} $LANGUAGE == 1042
      StrCpy $1 "이전에 설치된 ${PRODUCT_NAME} 의 데이터가 남아 있습니다.$\r$\n(열려 있던 탭, 최근 파일, 테마·언어·글꼴 설정, 창 위치)$\r$\n$\r$\n이 데이터도 삭제하고 처음 상태로 시작할까요?$\r$\n[아니요] 를 누르면 기존 설정을 그대로 이어서 사용합니다."
    ${Else}
      StrCpy $1 "Data from a previous ${PRODUCT_NAME} installation is still on this PC.$\r$\n(open tabs, recent files, theme/language/font settings, window position)$\r$\n$\r$\nDelete it as well and start fresh?$\r$\nChoose No to carry your existing settings over."
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION "$1" /SD IDNO IDYES MedWipeData IDNO MedKeepData
    MedWipeData:
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    MedKeepData:
  ${EndIf}

  ${If} $DoCreateStartMenuShortcut == "1"
    CreateDirectory "$SMPROGRAMS"
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    StrCpy $launchLink "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${EndIf}

  ${If} $DoCreateDesktopShortcut == "1"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}

  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; ── File associations (build/fileicons/file-types.nsh, generated) ──
  !include "${BUILD_RESOURCES_DIR}\fileicons\file-types.nsh"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
!endif

!ifdef BUILD_UNINSTALLER
; Uninstall (build/fileicons/file-types-un.nsh): the ProgIDs go; extensions that pointed at them are released.
!macro MED_FILE_TYPE_UN key name exts
  DeleteRegKey HKCU "Software\Classes\MyEditor.${key}"
  StrCpy $R9 "${key}"
  Push "${exts}"
  Call un.MedForEachExt
!macroend
Var UnExtKey
Var UnExtList
Var UnExtOne
Function un.MedForEachExt
  Pop $UnExtList
  StrCpy $UnExtKey $R9
  UnExtLoop:
    StrCpy $UnExtOne ""
    StrCpy $2 0
    UnExtScan:
      StrCpy $3 $UnExtList 1 $2
      ${If} $3 == ""
        StrCpy $UnExtOne $UnExtList
        StrCpy $UnExtList ""
        Goto UnExtGot
      ${EndIf}
      ${If} $3 == " "
        StrCpy $UnExtOne $UnExtList $2
        IntOp $2 $2 + 1
        StrCpy $UnExtList $UnExtList "" $2
        Goto UnExtGot
      ${EndIf}
      IntOp $2 $2 + 1
      Goto UnExtScan
    UnExtGot:
    ${If} $UnExtOne != ""
      DeleteRegValue HKCU "Software\Classes\.$UnExtOne\OpenWithProgids" "MyEditor.$UnExtKey"
      ReadRegStr $4 HKCU "Software\Classes\.$UnExtOne" ""
      ${If} $4 == "MyEditor.$UnExtKey"
        DeleteRegValue HKCU "Software\Classes\.$UnExtOne" ""
      ${EndIf}
    ${EndIf}
    ${If} $UnExtList != ""
      Goto UnExtLoop
    ${EndIf}
FunctionEnd
!endif

!macro customUnInstall
  SetShellVarContext current
  !include "${BUILD_RESOURCES_DIR}\fileicons\file-types-un.nsh"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
