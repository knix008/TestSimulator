; MyDiff Windows installer customization (picked up automatically by electron-builder
; as nsis.include).
;
; Two rules this file implements, carried over from the retired WiX installer:
;
;   1. Installing over an existing MyDiff removes the old installation completely —
;      the old uninstaller runs first, then the leftover program folder is deleted —
;      so an upgrade never leaves stale files behind.
;   2. User data (settings.json and the Electron profile) is never removed silently.
;      The installer asks before wiping it, and so does the uninstaller.
;
; Messages are bilingual in a single dialog: the installer language is chosen before
; these run, but the app itself ships both Korean and English UI.

!include LogicLib.nsh

; Registers are used instead of named variables on purpose: this file is compiled into
; both the installer and the uninstaller, and a Var that only one of them touches makes
; makensis fail with "variable not referenced" (warnings are errors here).
;   $R7 = previous uninstaller path   $R8 = previous install directory   $R9 = remove data?

!define MD_SETTINGS_DIR "$APPDATA\MyDiffJS"

; $0 = 1 when settings.json or the Electron profile folder exists.
!macro mdUserDataExists
  StrCpy $0 0
  ${If} ${FileExists} "${MD_SETTINGS_DIR}\settings.json"
    StrCpy $0 1
  ${ElseIf} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $0 1
  ${EndIf}
!macroend

!macro mdDeleteUserData
  RMDir /r "${MD_SETTINGS_DIR}"
  RMDir /r "$APPDATA\${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\MyDiffJS"
!macroend

; Looks for a previously installed MyDiff under the given registry root.
; Fills $R7 / $R8 when found.
!macro mdFindPrevious ROOT
  StrCpy $R0 0
  ${Do}
    EnumRegKey $R1 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
    ${If} $R1 == ""
      ${ExitDo}
    ${EndIf}
    IntOp $R0 $R0 + 1
    ReadRegStr $R2 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
    ${If} $R2 == "${PRODUCT_NAME}"
      ReadRegStr $R3 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "UninstallString"
      ReadRegStr $R4 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "InstallLocation"
      ${If} $R3 != ""
        ; UninstallString is quoted; NSIS needs the bare path to ExecWait it with arguments.
        StrCpy $R5 $R3 1
        ${If} $R5 == '"'
          StrCpy $R3 $R3 "" 1
          StrCpy $R5 $R3 -1
          ${If} $R5 == '"'
            StrCpy $R3 $R3 -1
          ${EndIf}
        ${EndIf}
        StrCpy $R7 "$R3"
        StrCpy $R8 "$R4"
        ${ExitDo}
      ${EndIf}
    ${EndIf}
  ${Loop}
!macroend

; ---------------------------------------------------------------- install ----

!macro customInit
  StrCpy $R7 ""
  StrCpy $R8 ""
  !insertmacro mdFindPrevious HKCU
  ${If} $R7 == ""
    !insertmacro mdFindPrevious HKLM
  ${EndIf}

  StrCpy $R9 0 ; remove user data?
  !insertmacro mdUserDataExists
  ${IfNot} ${Silent}
  ${AndIf} $0 == 1
    ${If} $R7 != ""
      MessageBox MB_YESNO|MB_ICONQUESTION \
        "기존 MyDiff 설치본을 완전히 제거한 뒤 새로 설치합니다.$\r$\n사용자 설정과 데이터도 함께 삭제할까요?$\r$\n$\r$\n$\"아니요$\"를 선택하면 설정이 그대로 유지됩니다.$\r$\n($\"${MD_SETTINGS_DIR}$\")$\r$\n$\r$\nThe existing MyDiff installation will be removed completely before reinstalling.$\r$\nAlso delete your settings and data? Choose No to keep them." \
        /SD IDNO IDNO mdKeepData
    ${Else}
      MessageBox MB_YESNO|MB_ICONQUESTION \
        "이전에 사용하던 MyDiff 설정이 남아 있습니다.$\r$\n설정과 데이터를 삭제하고 처음 상태로 설치할까요?$\r$\n($\"${MD_SETTINGS_DIR}$\")$\r$\n$\r$\nSettings from a previous MyDiff were found.$\r$\nDelete them and install fresh? Choose No to keep them." \
        /SD IDNO IDNO mdKeepData
    ${EndIf}
    StrCpy $R9 1
    mdKeepData:
  ${EndIf}

  ; Remove the previous installation completely, then clean up what it left behind.
  ${If} $R7 != ""
    ${If} ${FileExists} "$R7"
      DetailPrint "Removing the previous MyDiff installation..."
      ExecWait '"$R7" /S _?=$R8' $R6
      Sleep 800
    ${EndIf}
    ${If} $R8 != ""
      Delete "$R7"
      RMDir /r "$R8"
    ${EndIf}
  ${EndIf}

  ${If} $R9 == 1
    !insertmacro mdDeleteUserData
  ${EndIf}
!macroend

; -------------------------------------------------------------- uninstall ----

!macro customUnInstall
  ; A silent run is either an upgrade or our own cleanup above; it must not prompt,
  ; and it must never decide to delete the user's data on its own.
  ${IfNot} ${Silent}
    !insertmacro mdUserDataExists
    ${If} $0 == 1
      MessageBox MB_YESNO|MB_ICONQUESTION \
        "MyDiff 설정과 데이터도 함께 삭제할까요?$\r$\n($\"${MD_SETTINGS_DIR}$\")$\r$\n$\r$\nAlso delete MyDiff settings and data?" \
        /SD IDNO IDNO mdKeepDataUn
      !insertmacro mdDeleteUserData
      mdKeepDataUn:
    ${EndIf}
  ${EndIf}
!macroend
