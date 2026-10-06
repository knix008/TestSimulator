; NSIS customisation for My Diff & Merge.
;
; Three things the default installer does not do:
;
;   1. A previous installation is uninstalled in full — silently, and with whatever is
;      left of the program folder removed afterwards — before the new one is laid down.
;      electron-builder's own upgrade path writes over the old files; a half-removed
;      older version has caused enough support questions to be worth the extra step.
;   2. On uninstall, settings and session data are only deleted if the user says so.
;   3. Both prompts speak the language chosen on the first page of the installer.

!macro preInit
  ; Nothing to do before the UI starts; the language is not known yet.
!macroend

; Only the data directory gets a named variable. The previous installation's
; uninstaller path lives in $R7 instead: a `Var` declared here is compiled into the
; uninstaller as well, where nothing uses it, and NSIS turns that warning into an
; error.
Var /GLOBAL MDM_DataDir

; ---------------------------------------------------------------- strings

!macro MDM_Strings
  ${If} $LANGUAGE == 1042 ; Korean
    StrCpy $R8 "이전 버전이 설치되어 있습니다.$\n완전히 제거한 뒤 새로 설치합니다."
    StrCpy $R9 "저장된 설정과 세션 데이터가 있습니다.$\n함께 삭제하시겠습니까?$\n$\n[예] 모두 삭제   [아니오] 데이터 유지"
  ${Else}
    StrCpy $R8 "A previous version is installed.$\nIt will be removed completely before installing."
    StrCpy $R9 "Saved settings and session data were found.$\nDelete them as well?$\n$\n[Yes] delete everything   [No] keep my data"
  ${EndIf}
!macroend

; ------------------------------------------------------- before installing

!macro customInit
  !insertmacro MDM_Strings

  ; Where the app keeps settings.json (see core/settings.ts).
  StrCpy $MDM_DataDir "$APPDATA\MyDiffMerge"

  ; Per-user and per-machine installs record their uninstaller in different hives;
  ; check both so an upgrade from either one is cleaned up.
  ReadRegStr $R7 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${If} $R7 == ""
    ReadRegStr $R7 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${EndIf}

  ${If} $R7 != ""
    MessageBox MB_OK|MB_ICONINFORMATION "$R8" /SD IDOK
    ; `_?=` keeps the uninstaller in place so ExecWait really waits for it, and no
    ; stale copy is left behind in $TEMP.
    ClearErrors
    ExecWait '"$R7" /S --delete-app-data=false _?=$INSTDIR'
    ; Anything the old uninstaller could not take with it (a log, a lock file).
    RMDir /r "$INSTDIR"
  ${EndIf}
!macroend

; ------------------------------------------------------- after installing

!macro customInstall
  ; Make the .dmrg association visible to Explorer straight away rather than at the
  ; next sign-in. electron-builder writes the keys; this only refreshes the shell.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; ----------------------------------------------------------- uninstalling

!macro customUnInstall
  !insertmacro MDM_Strings
  StrCpy $MDM_DataDir "$APPDATA\MyDiffMerge"

  ; A silent uninstall (the one `customInit` runs during an upgrade) must never ask,
  ; and must never take the user's settings with it.
  ${IfNot} ${Silent}
    ${If} ${FileExists} "$MDM_DataDir\*.*"
      MessageBox MB_YESNO|MB_ICONQUESTION "$R9" /SD IDNO IDNO mdm_keep_data
        RMDir /r "$MDM_DataDir"
      mdm_keep_data:
    ${EndIf}
  ${EndIf}

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
