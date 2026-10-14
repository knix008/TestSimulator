; TTS Multi OS — custom NSIS hooks (electron-builder "nsis.include").
; Must stay UTF-8 *with BOM*: without it NSIS reads the Korean text in the system code page.
;
; User data lives outside the install folder: %APPDATA%\TTSMultiOSV10
; (downloaded voice models, logs, settings). Electron's default folders are removed with it.

!define TTS_DATA_FOLDER "TTSMultiOSV10"
!define TTS_PACKAGE_DATA_FOLDER "tts-multios-v10"

; Message text in the language picked on the installer's language page.
!macro TTS_TEXT OUT KO EN
  ${If} $LANGUAGE == 1042
    StrCpy ${OUT} "${KO}"
  ${Else}
    StrCpy ${OUT} "${EN}"
  ${EndIf}
!macroend

!macro TTS_RESTORE_SHELL_CONTEXT
  ${If} $installMode == "all"
    SetShellVarContext all
  ${EndIf}
!macroend

; ── Installer: remove an existing installation completely before installing ──
!macro customInit
  Var /GLOBAL ttsOldRoot
  Var /GLOBAL ttsOldDir
  Var /GLOBAL ttsOldUninst
  Var /GLOBAL ttsOldVer
  Var /GLOBAL ttsDataDir
  Var /GLOBAL ttsDeleteData
  Var /GLOBAL ttsArgs
  Var /GLOBAL ttsExitCode
  Var /GLOBAL ttsText
  Var /GLOBAL ttsDataResult

  ; Silent installs (/S) keep electron-builder's default upgrade behaviour.
  ${IfNot} ${Silent}
    StrCpy $ttsOldRoot "HKCU"
    ReadRegStr $ttsOldDir HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ReadRegStr $ttsOldUninst HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $ttsOldVer HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${If} $ttsOldDir == ""
    ${AndIf} $ttsOldUninst == ""
      StrCpy $ttsOldRoot "HKLM"
      ReadRegStr $ttsOldDir HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
      ReadRegStr $ttsOldUninst HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      ReadRegStr $ttsOldVer HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ${EndIf}

    ${If} $ttsOldDir != ""
    ${OrIf} $ttsOldUninst != ""
      ${If} $ttsOldVer == ""
        StrCpy $ttsOldVer "?"
      ${EndIf}

      ; 1) Confirm full removal of the existing program.
      !insertmacro TTS_TEXT $ttsText \
        "이미 설치된 ${PRODUCT_NAME} (버전 $ttsOldVer)이 있습니다.$\r$\n$\r$\n설치 위치: $ttsOldDir$\r$\n$\r$\n설치를 계속하면 기존 프로그램을 완전히 삭제한 뒤 새로 설치합니다.$\r$\n계속하시겠습니까?" \
        "${PRODUCT_NAME} (version $ttsOldVer) is already installed.$\r$\n$\r$\nLocation: $ttsOldDir$\r$\n$\r$\nThe existing program will be completely removed before installing.$\r$\nDo you want to continue?"
      MessageBox MB_OKCANCEL|MB_ICONQUESTION|MB_TOPMOST "$ttsText" IDOK +2
      Quit

      ; 2) Ask whether user data should be deleted as well.
      SetShellVarContext current
      StrCpy $ttsDataDir "$APPDATA\${TTS_DATA_FOLDER}"
      StrCpy $ttsDeleteData "0"
      ${If} ${FileExists} "$ttsDataDir\*.*"
        !insertmacro TTS_TEXT $ttsText \
          "사용자 데이터도 삭제하시겠습니까?$\r$\n$\r$\n위치: $ttsDataDir$\r$\n내용: 다운로드한 음성 모델, 설정, 로그$\r$\n$\r$\n[예] 사용자 데이터를 삭제합니다. 음성 모델을 다시 다운로드해야 합니다.$\r$\n[아니요] 사용자 데이터를 그대로 유지합니다." \
          "Do you also want to delete the user data?$\r$\n$\r$\nLocation: $ttsDataDir$\r$\nContents: downloaded voice models, settings, logs$\r$\n$\r$\n[Yes] Delete user data. Voice models must be downloaded again.$\r$\n[No] Keep user data."
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2|MB_TOPMOST "$ttsText" IDNO +2
        StrCpy $ttsDeleteData "1"
      ${EndIf}
      !insertmacro TTS_RESTORE_SHELL_CONTEXT

      ${If} $ttsOldRoot == "HKLM"
        StrCpy $ttsArgs "/allusers"
      ${Else}
        StrCpy $ttsArgs "/currentuser"
      ${EndIf}
      ${If} $ttsDeleteData == "1"
        StrCpy $ttsArgs "$ttsArgs --delete-app-data"
      ${Else}
        StrCpy $ttsArgs "$ttsArgs --updated"
      ${EndIf}

      ; 3) Run the old uninstaller (copied out so it can delete its own folder).
      tts_uninstall_retry:
      StrCpy $ttsExitCode "-"
      ${If} $ttsOldDir != ""
      ${AndIf} ${FileExists} "$ttsOldDir\${UNINSTALL_FILENAME}"
        InitPluginsDir
        CopyFiles /SILENT "$ttsOldDir\${UNINSTALL_FILENAME}" "$PLUGINSDIR\tts-old-uninstaller.exe"
        ClearErrors
        ExecWait '"$PLUGINSDIR\tts-old-uninstaller.exe" /S $ttsArgs _?=$ttsOldDir' $ttsExitCode
      ${EndIf}

      ; Remove leftovers only from a folder that really holds this app.
      ${If} $ttsOldDir != ""
        ${If} ${FileExists} "$ttsOldDir\resources\app.asar"
        ${OrIf} ${FileExists} "$ttsOldDir\${APP_EXECUTABLE_FILENAME}"
          RMDir /r "$ttsOldDir"
        ${EndIf}
        RMDir "$ttsOldDir"
      ${EndIf}

      ${If} $ttsOldDir != ""
      ${AndIf} ${FileExists} "$ttsOldDir\${APP_EXECUTABLE_FILENAME}"
        !insertmacro TTS_TEXT $ttsText \
          "기존 프로그램을 완전히 삭제하지 못했습니다.$\r$\n$\r$\n위치: $ttsOldDir$\r$\n제거 프로그램 종료 코드: $ttsExitCode$\r$\n$\r$\n${PRODUCT_NAME}이 실행 중이면 종료한 뒤 [다시 시도]를 누르세요.$\r$\n[취소]를 누르면 설치를 중단합니다." \
          "The existing program could not be removed completely.$\r$\n$\r$\nLocation: $ttsOldDir$\r$\nUninstaller exit code: $ttsExitCode$\r$\n$\r$\nIf ${PRODUCT_NAME} is running, close it and press [Retry].$\r$\nPress [Cancel] to abort the installation."
        MessageBox MB_RETRYCANCEL|MB_ICONSTOP|MB_TOPMOST "$ttsText" IDRETRY tts_uninstall_retry
        Quit
      ${EndIf}

      ; Registry entries of an installation whose uninstaller was missing.
      ${If} $ttsOldRoot == "HKLM"
        DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
        DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
      ${Else}
        DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
        DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
      ${EndIf}

      ; 4) Delete or keep user data, then tell the user which happened.
      SetShellVarContext current
      ${If} $ttsDeleteData == "1"
        RMDir /r "$ttsDataDir"
        RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
        RMDir /r "$APPDATA\${TTS_PACKAGE_DATA_FOLDER}"
        ${If} ${FileExists} "$ttsDataDir\*.*"
          !insertmacro TTS_TEXT $ttsDataResult \
            "사용자 데이터 일부를 삭제하지 못했습니다. 직접 삭제해 주세요:$\r$\n$ttsDataDir" \
            "Some user data could not be deleted. Please delete it manually:$\r$\n$ttsDataDir"
        ${Else}
          !insertmacro TTS_TEXT $ttsDataResult \
            "사용자 데이터를 삭제했습니다:$\r$\n$ttsDataDir" \
            "User data was deleted:$\r$\n$ttsDataDir"
        ${EndIf}
      ${ElseIf} ${FileExists} "$ttsDataDir\*.*"
        !insertmacro TTS_TEXT $ttsDataResult \
          "사용자 데이터는 삭제하지 않고 유지했습니다 (음성 모델, 설정, 로그):$\r$\n$ttsDataDir" \
          "User data was kept (voice models, settings, logs):$\r$\n$ttsDataDir"
      ${Else}
        !insertmacro TTS_TEXT $ttsDataResult \
          "삭제할 사용자 데이터가 없습니다." \
          "There was no user data to delete."
      ${EndIf}
      !insertmacro TTS_RESTORE_SHELL_CONTEXT

      !insertmacro TTS_TEXT $ttsText \
        "기존 프로그램을 완전히 삭제했습니다.$\r$\n$\r$\n$ttsDataResult$\r$\n$\r$\n이제 새 버전을 설치합니다." \
        "The existing program was removed completely.$\r$\n$\r$\n$ttsDataResult$\r$\n$\r$\nThe new version will now be installed."
      MessageBox MB_OK|MB_ICONINFORMATION|MB_TOPMOST "$ttsText"
    ${EndIf}
  ${EndIf}
!macroend

; ── Uninstaller: ask about user data and report the result ──────────────────
!macro customUnInstall
  Var /GLOBAL ttsUnDataDir
  Var /GLOBAL ttsUnText
  Var /GLOBAL ttsUnParams
  Var /GLOBAL ttsUnOption

  ; Upgrades (--updated) never touch user data.
  ${IfNot} ${isUpdated}
    SetShellVarContext current
    StrCpy $ttsUnDataDir "$APPDATA\${TTS_DATA_FOLDER}"
    ${If} ${FileExists} "$ttsUnDataDir\*.*"
      ${If} ${Silent}
        ${GetParameters} $ttsUnParams
        ClearErrors
        ${GetOptions} $ttsUnParams "--delete-app-data" $ttsUnOption
        ${IfNot} ${Errors}
          RMDir /r "$ttsUnDataDir"
        ${EndIf}
      ${Else}
        !insertmacro TTS_TEXT $ttsUnText \
          "사용자 데이터도 삭제하시겠습니까?$\r$\n$\r$\n위치: $ttsUnDataDir$\r$\n내용: 다운로드한 음성 모델, 설정, 로그$\r$\n$\r$\n[예] 사용자 데이터를 삭제합니다.$\r$\n[아니요] 다시 설치할 때 사용할 수 있도록 유지합니다." \
          "Do you also want to delete the user data?$\r$\n$\r$\nLocation: $ttsUnDataDir$\r$\nContents: downloaded voice models, settings, logs$\r$\n$\r$\n[Yes] Delete user data.$\r$\n[No] Keep it for a later reinstall."
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2|MB_TOPMOST "$ttsUnText" IDNO tts_un_keep_data
          RMDir /r "$ttsUnDataDir"
          RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
          RMDir /r "$APPDATA\${TTS_PACKAGE_DATA_FOLDER}"
          ${If} ${FileExists} "$ttsUnDataDir\*.*"
            !insertmacro TTS_TEXT $ttsUnText \
              "사용자 데이터 일부를 삭제하지 못했습니다. 직접 삭제해 주세요:$\r$\n$ttsUnDataDir" \
              "Some user data could not be deleted. Please delete it manually:$\r$\n$ttsUnDataDir"
          ${Else}
            !insertmacro TTS_TEXT $ttsUnText \
              "사용자 데이터를 삭제했습니다:$\r$\n$ttsUnDataDir" \
              "User data was deleted:$\r$\n$ttsUnDataDir"
          ${EndIf}
          Goto tts_un_report_data
        tts_un_keep_data:
          !insertmacro TTS_TEXT $ttsUnText \
            "사용자 데이터는 삭제하지 않고 유지했습니다:$\r$\n$ttsUnDataDir" \
            "User data was kept:$\r$\n$ttsUnDataDir"
        tts_un_report_data:
        MessageBox MB_OK|MB_ICONINFORMATION|MB_TOPMOST "$ttsUnText"
      ${EndIf}
    ${EndIf}
    !insertmacro TTS_RESTORE_SHELL_CONTEXT
  ${EndIf}
!macroend
