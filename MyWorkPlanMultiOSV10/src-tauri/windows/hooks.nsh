; MyWorkPlan installer hooks (included by Tauri's NSIS template).
;
; Before installing:
;  1. Saved data from a previous installation (settings, recent files and
;     folders, window place, background image) — the user is asked whether to
;     delete it.
;     %APPDATA%\${BUNDLEID}       window state, background image, crash log
;     %LOCALAPPDATA%\${BUNDLEID}  WebView2 profile (settings, recent files)
;  2. A previous installation is always removed completely (its uninstaller
;     runs silently, then its folder is deleted) before the new files go in,
;     even when the "already installed" page was left at "reinstall".
; After installing:
;  3. .mwp plans and .mwpt templates get their own icons (plan.ico,
;     template.ico), not the app icon.
;
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!macro NSIS_HOOK_PREINSTALL
  ; 1. Saved data
  ${If} ${FileExists} "$APPDATA\${BUNDLEID}\*.*"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\${BUNDLEID}\*.*"
    ${If} $PassiveMode <> 1
    ${AndIfNot} ${Silent}
      StrCpy $R8 "Saved data from a previous MyWorkPlan installation was found (settings, recent files and folders, background image). Do you want to delete it?"
      ${If} $LANGUAGE == 1042
        StrCpy $R8 "이전에 설치한 MyWorkPlan 이 저장한 데이터(설정, 최근 파일·폴더, 배경 이미지)가 있습니다. 삭제하시겠습니까?"
      ${EndIf}
      MessageBox MB_YESNO|MB_ICONQUESTION $R8 IDNO myworkplan_keep_data
        RMDir /r "$APPDATA\${BUNDLEID}"
        RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
      myworkplan_keep_data:
    ${EndIf}
  ${EndIf}

  ; 2. Previous installation
  ReadRegStr $R6 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $R6 != ""
  ${AndIf} ${FileExists} "$R6\uninstall.exe"
    DetailPrint "Removing the previous installation: $R6"
    ExecWait '"$R6\uninstall.exe" /S _?=$R6' $R5
    Delete "$R6\uninstall.exe"
    ; Only a folder of our own is deleted as a whole.
    ${GetFileName} "$R6" $R4
    ${If} $R4 == "${PRODUCTNAME}"
      RMDir /r "$R6"
    ${EndIf}
  ${EndIf}
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 3. Document icons (Tauri registers the types with the app icon).
  WriteRegStr SHCTX "Software\Classes\MyWorkPlan.Plan\DefaultIcon" "" "$INSTDIR\plan.ico"
  WriteRegStr SHCTX "Software\Classes\MyWorkPlan.Template\DefaultIcon" "" "$INSTDIR\template.ico"
  ; Start menu shortcut to the user's guide installed with the program.
  ${If} ${FileExists} "$INSTDIR\docs\UsersGuide.html"
    CreateDirectory "$SMPROGRAMS\${PRODUCTNAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCTNAME}\MyWorkPlan User's Guide.lnk" "$INSTDIR\docs\UsersGuide.html"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\${PRODUCTNAME}\MyWorkPlan User's Guide.lnk"
!macroend
