; MyCapture installer hooks (included by Tauri's NSIS template).
;
; Tauri's own "already installed" page removes or overwrites the old program.
; Like the other My* installers, we additionally ask whether to delete the data
; a previous install left behind: the WebView2 profile under
; %LOCALAPPDATA%\${BUNDLEID} holds the saved settings.
; Keep this file UTF-8 with BOM, or NSIS reads the Korean text as ANSI.

!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\${BUNDLEID}\*.*"
  ${OrIf} ${FileExists} "$APPDATA\${BUNDLEID}\*.*"
    ${If} $PassiveMode <> 1
    ${AndIfNot} ${Silent}
      StrCpy $R8 "Saved data from a previous MyCapture installation was found (settings). Do you want to delete it?"
      ${If} $LANGUAGE == 1042
        StrCpy $R8 "이전에 설치한 MyCapture 가 저장한 데이터(설정)가 있습니다. 삭제하시겠습니까?"
      ${EndIf}
      MessageBox MB_YESNO|MB_ICONQUESTION $R8 IDNO mycapture_keep_data
        RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
        RMDir /r "$APPDATA\${BUNDLEID}"
      mycapture_keep_data:
    ${EndIf}
  ${EndIf}
!macroend
