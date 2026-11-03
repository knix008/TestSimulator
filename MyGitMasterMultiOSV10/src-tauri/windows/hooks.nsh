; My Git Master — additions to Tauri's NSIS installer.
;
;   On uninstall, settings, saved credentials and the remote repository cache are only
;   deleted if the user says so, in the language chosen on the installer's first page.
;   A silent uninstall (an upgrade) never asks and never deletes them.
;
; Tauri includes this file before it defines its own variables, so the names are
; spelled out here. test/cases.ts checks MGM_DATA_FOLDER against core/settings.ts.

!define MGM_DATA_FOLDER "MyGitMaster"

!macro NSIS_HOOK_POSTUNINSTALL
  ${IfNot} ${Silent}
    ${If} ${FileExists} "$APPDATA\${MGM_DATA_FOLDER}\*.*"
      ${If} $LANGUAGE = 1042
        MessageBox MB_YESNO|MB_ICONQUESTION "사용자 데이터(설정, 로그인 정보, 원격 저장소 캐시)가 있습니다.$\r$\n함께 삭제하시겠습니까?$\r$\n$\r$\n[예] 모두 삭제   [아니요] 데이터 유지" /SD IDNO IDNO mgm_keep_data
      ${Else}
        MessageBox MB_YESNO|MB_ICONQUESTION "User data (settings, saved credentials, remote repository cache) was found.$\r$\nDelete it as well?$\r$\n$\r$\n[Yes] delete everything   [No] keep my data" /SD IDNO IDNO mgm_keep_data
      ${EndIf}
      RMDir /r "$APPDATA\${MGM_DATA_FOLDER}"
      RMDir /r "$LOCALAPPDATA\${MGM_DATA_FOLDER}"
      mgm_keep_data:
    ${EndIf}
  ${EndIf}
!macroend
