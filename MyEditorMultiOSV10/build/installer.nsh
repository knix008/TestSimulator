; Custom NSIS script for My Editor
;
;  • a page letting the user choose Desktop / Start Menu shortcuts
;    (Korean when the installer runs in Korean, English otherwise)
;  • a page for file associations: the user picks which source-code /
;    text types My Editor should own as the default program (per type,
;    listed in build/fileicons/assoc-list.nsh). Those types are written
;    to HKCU Classes + Capabilities and Explorer's UserChoice is cleared
;    so Windows actually uses them. Unchecked types stay with whatever
;    program they had. An optional "Open with" box still lists My Editor
;    for every type.
;  • a clean reinstall: electron-builder runs the previous version's
;    uninstaller first, and this script sweeps whatever it left behind
;  • asks before deleting the data (session, settings) an earlier
;    installation left behind — silent installs keep it
;
; Included in the script header (before MUI2) — do not use MUI_* macros here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef LBS_MULTIPLESEL
  !define LBS_MULTIPLESEL 0x00000008
!endif
!ifndef LBS_NOINTEGRALHEIGHT
  !define LBS_NOINTEGRALHEIGHT 0x00000100
!endif
!ifndef LB_ADDSTRING
  !define LB_ADDSTRING 0x0180
!endif
!ifndef LB_SETSEL
  !define LB_SETSEL 0x0185
!endif
!ifndef LB_GETSEL
  !define LB_GETSEL 0x0187
!endif
!ifndef LB_GETCOUNT
  !define LB_GETCOUNT 0x018B
!endif

!ifndef BUILD_UNINSTALLER
Var DesktopShortcutCheckbox
Var StartMenuShortcutCheckbox
Var DoCreateDesktopShortcut
Var DoCreateStartMenuShortcut
Var PrevInstallDir
Var AssocCheckbox
Var TypeList
Var AssocAllBtn
Var AssocNoneBtn
Var DoAssoc
Var DoDefaultKeys
Var AppExeName

!macro customInit
  StrCpy $DoCreateDesktopShortcut "1"
  StrCpy $DoCreateStartMenuShortcut "1"
  StrCpy $DoAssoc "1"
  StrCpy $DoDefaultKeys "*"
  StrCpy $AppExeName "${APP_EXECUTABLE_FILENAME}"

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

!include "${BUILD_RESOURCES_DIR}\fileicons\assoc-list.nsh"

; ── File associations page ────────────────────────────────
Function AssocPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${If} $LANGUAGE == 1042
    ${NSD_CreateLabel} 0 0u 100% 20u "소스 코드·텍스트 형식마다 My Editor 를 기본 프로그램으로 등록할지 고르세요. 선택한 형식만 시스템에 연결됩니다 (현재 사용자, 제거 시 해제)."
    Pop $0
    ${NSD_CreateCheckbox} 0 20u 100% 12u "'연결 프로그램' 목록에 My Editor 추가 (모든 형식, 언어별 아이콘)"
    Pop $AssocCheckbox
    ${NSD_CreateLabel} 0 34u 52% 12u "기본 프로그램으로 등록할 형식:"
    Pop $0
    ${NSD_CreateButton} 54% 32u 22% 14u "모두 선택"
    Pop $AssocAllBtn
    ${NSD_CreateButton} 78% 32u 22% 14u "선택 해제"
    Pop $AssocNoneBtn
    ${NSD_CreateLabel} 0 118u 100% 22u "목록에서 고른 형식은 더블클릭 시 My Editor 로 열리고 탐색기 아이콘이 바뀝니다. 고르지 않은 형식은 기존 프로그램이 그대로입니다."
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0u 100% 20u "Choose which source and text types should open with My Editor by default. Only the types you select are registered for this user (cleared on uninstall)."
    Pop $0
    ${NSD_CreateCheckbox} 0 20u 100% 12u "Also add My Editor to 'Open with' for every type (language icons)"
    Pop $AssocCheckbox
    ${NSD_CreateLabel} 0 34u 52% 12u "Register as the default program:"
    Pop $0
    ${NSD_CreateButton} 54% 32u 22% 14u "Select all"
    Pop $AssocAllBtn
    ${NSD_CreateButton} 78% 32u 22% 14u "Select none"
    Pop $AssocNoneBtn
    ${NSD_CreateLabel} 0 118u 100% 22u "Selected types open with a double-click and show My Editor's icon. Unselected types keep their current program."
    Pop $0
  ${EndIf}
  ${If} $DoAssoc == "1"
    ${NSD_Check} $AssocCheckbox
  ${EndIf}
  ${NSD_OnClick} $AssocAllBtn AssocSelectAll
  ${NSD_OnClick} $AssocNoneBtn AssocSelectNone
  nsDialogs::CreateControl ${__NSD_ListBox_CLASS} ${__NSD_ListBox_STYLE}|${LBS_MULTIPLESEL}|${LBS_NOINTEGRALHEIGHT} ${__NSD_ListBox_EXSTYLE} 0 48u 100% 68u
  Pop $TypeList
  Call MedAssocFill
  Call AssocRestoreSel
  nsDialogs::Show
FunctionEnd

Function AssocSelectAll
  SendMessage $TypeList ${LB_SETSEL} 1 -1
FunctionEnd

Function AssocSelectNone
  SendMessage $TypeList ${LB_SETSEL} 0 -1
FunctionEnd

Function AssocRestoreSel
  SendMessage $TypeList ${LB_GETCOUNT} 0 0 $R0
  StrCpy $R1 0
  AssocRestLoop:
    IntCmp $R1 $R0 AssocRestDone
    StrCpy $0 $R1
    Call MedAssocKeyAt
    StrCpy $R8 $1
    Call MedKeyChosen
    ${If} $R7 == "1"
      SendMessage $TypeList ${LB_SETSEL} 1 $R1
    ${EndIf}
    IntOp $R1 $R1 + 1
    Goto AssocRestLoop
  AssocRestDone:
FunctionEnd

Function AssocPageLeave
  ${NSD_GetState} $AssocCheckbox $0
  ${If} $0 == 1
    StrCpy $DoAssoc "1"
  ${Else}
    StrCpy $DoAssoc "0"
  ${EndIf}
  SendMessage $TypeList ${LB_GETCOUNT} 0 0 $R0
  StrCpy $DoDefaultKeys "|"
  StrCpy $R1 0
  AssocLeaveLoop:
    IntCmp $R1 $R0 AssocLeaveDone
    SendMessage $TypeList ${LB_GETSEL} $R1 0 $R2
    ${If} $R2 != 0
      StrCpy $0 $R1
      Call MedAssocKeyAt
      ${If} $1 != ""
        StrCpy $DoDefaultKeys "$DoDefaultKeys$1|"
      ${EndIf}
    ${EndIf}
    IntOp $R1 $R1 + 1
    Goto AssocLeaveLoop
  AssocLeaveDone:
FunctionEnd

; $R8 = type key; $R7 = 1 if that type should become the default program.
Function MedKeyChosen
  ${If} $DoDefaultKeys == "*"
    StrCpy $R7 1
    Return
  ${EndIf}
  StrCpy $R6 "|$R8|"
  StrLen $R5 $R6
  StrCpy $R4 0
  MedKeyScan:
    StrCpy $R3 $DoDefaultKeys $R5 $R4
    ${If} $R3 == ""
      StrCpy $R7 0
      Return
    ${EndIf}
    ${If} $R3 == $R6
      StrCpy $R7 1
      Return
    ${EndIf}
    IntOp $R4 $R4 + 1
    Goto MedKeyScan
FunctionEnd

; One file type (build/fileicons/file-types.nsh): a ProgID with the icon and
; the open command. Open-with is written when the user asked for it or when
; the type is a chosen default; the Classes default + UserChoice reset run
; only for chosen defaults so Explorer actually opens them with this app.
!macro MED_FILE_TYPE key name exts
  StrCpy $R8 "${key}"
  Call MedKeyChosen
  ${If} $DoAssoc == "1"
  ${OrIf} $R7 == "1"
    WriteRegStr HKCU "Software\Classes\MyEditor.${key}" "" "${name} — ${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Classes\MyEditor.${key}" "FriendlyTypeName" "${name} — ${PRODUCT_NAME}"
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
      WriteRegStr HKCU "Software\Classes\Applications\$AppExeName\SupportedTypes" ".$MedExtOne" ""
      WriteRegStr HKCU "Software\MyEditor\Capabilities\FileAssociations" ".$MedExtOne" "MyEditor.$MedExtKey"
      StrCpy $R8 $MedExtKey
      Call MedKeyChosen
      ${If} $R7 == "1"
        WriteRegStr HKCU "Software\Classes\.$MedExtOne" "" "MyEditor.$MedExtKey"
        WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$MedExtOne\OpenWithProgids" "MyEditor.$MedExtKey" ""
        DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$MedExtOne\UserChoice"
        DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$MedExtOne\UserChoiceLatest"
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

  ; Prefer an .ico next to the exe (new filename so Windows does not keep a
  ; blank icon cache entry from an older install of the same MyEditor.exe).
  StrCpy $R0 "$INSTDIR\MyEditor.ico"
  ${If} ${FileExists} "$R0"
  ${ElseIf} ${FileExists} "$INSTDIR\resources\icon.ico"
    StrCpy $R0 "$INSTDIR\resources\icon.ico"
  ${Else}
    StrCpy $R0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}

  ${If} $DoCreateStartMenuShortcut == "1"
    CreateDirectory "$SMPROGRAMS"
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$R0" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    StrCpy $launchLink "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  ${EndIf}

  ${If} $DoCreateDesktopShortcut == "1"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$R0" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}

  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$R0,0"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\MyEditor\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\MyEditor\Capabilities" "ApplicationDescription" "${APP_DESCRIPTION}"
  WriteRegStr HKCU "Software\MyEditor\Capabilities" "ApplicationIcon" "$R0,0"
  WriteRegStr HKCU "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\MyEditor\Capabilities"
  nsExec::ExecToLog '"$SYSDIR\ie4uinit.exe" -show'

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
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$UnExtOne\OpenWithProgids" "MyEditor.$UnExtKey"
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
  DeleteRegValue HKCU "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\MyEditor"
  WinShell::UninstAppUserModelId "${APP_ID}"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
