; MyStableFast3D installer additions (read by the Tauri NSIS template).
;
; Uninstalling asks whether to remove what the program keeps outside its own
; folder, separately, because the two differ so much in size:
;   • the settings: %APPDATA%\MyStableFast3D and the webview data in
;     %LOCALAPPDATA%\com.shkwon.mystablefast3d
;   • the engine: %LOCALAPPDATA%\MyStableFast3D\engine — Python, PyTorch and
;     the downloaded models, several GB (it is installed again on next use)
; Model weights in the shared Hugging Face cache (%USERPROFILE%\.cache\
; huggingface) are never touched: other programs use them too.
; A silent uninstall (/S, also used by updates) keeps both.

!define MP_DATA_DIR "MyStableFast3D"
!define MP_IDENTIFIER "com.shkwon.mystablefast3d"

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\${MP_DATA_DIR}\engine\*.*"
    MessageBox MB_YESNO|MB_ICONQUESTION "MyStableFast3D 엔진(Python, PyTorch, 모델 파일 — 수 GB)도 지울까요?$\r$\n지우지 않으면 다시 설치할 때 그대로 씁니다.$\r$\n$\r$\nAlso remove the MyStableFast3D engine (Python, PyTorch, model files — several GB)?$\r$\nIf kept, a new installation uses it as is." /SD IDNO IDNO mp_keep_engine
      RMDir /r "$LOCALAPPDATA\${MP_DATA_DIR}\engine"
      RMDir "$LOCALAPPDATA\${MP_DATA_DIR}"
    mp_keep_engine:
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\${MP_DATA_DIR}\*.*"
    MessageBox MB_YESNO|MB_ICONQUESTION "MyStableFast3D 설정(테마, 최근 파일, 광원 배치 등)도 지울까요?$\r$\n$\r$\nAlso remove the MyStableFast3D settings (theme, recent files, lights …)?" /SD IDNO IDNO mp_keep_settings
      RMDir /r "$APPDATA\${MP_DATA_DIR}"
      RMDir /r "$LOCALAPPDATA\${MP_IDENTIFIER}"
    mp_keep_settings:
  ${EndIf}
!macroend
