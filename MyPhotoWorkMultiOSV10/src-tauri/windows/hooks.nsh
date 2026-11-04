; My Photo Work - additions to Tauri's NSIS installer.
;
;   1. The installer asks for its language every time (the last choice is preselected).
;   2. On uninstall, the downloaded models and the window position are deleted only if
;      the user says so. A silent uninstall (an upgrade) never asks and never deletes.
;
; The folder name is the one src-tauri/src/lib.rs uses (DATA_FOLDER), and test/tauri.test.mjs
; checks that they agree.

!define MPW_DATA_FOLDER "My Photo Work V1.0"

!define MUI_LANGDLL_ALWAYSSHOW

!macro NSIS_HOOK_POSTUNINSTALL
  ${IfNot} ${Silent}
    ${If} ${FileExists} "$APPDATA\${MPW_DATA_FOLDER}\*.*"
      ${If} $LANGUAGE = 1042
        MessageBox MB_YESNO|MB_ICONQUESTION "내려받은 신경망 모델과 창 위치 정보가 있습니다.$\r$\n함께 삭제하시겠습니까?$\r$\n$\r$\n[예] 모두 삭제   [아니요] 데이터 유지" /SD IDNO IDNO mpw_keep_data
      ${Else}
        MessageBox MB_YESNO|MB_ICONQUESTION "Downloaded neural models and the saved window position were found.$\r$\nDelete them as well?$\r$\n$\r$\n[Yes] delete everything   [No] keep my data" /SD IDNO IDNO mpw_keep_data
      ${EndIf}
      RMDir /r "$APPDATA\${MPW_DATA_FOLDER}"
      mpw_keep_data:
    ${EndIf}
  ${EndIf}
!macroend
