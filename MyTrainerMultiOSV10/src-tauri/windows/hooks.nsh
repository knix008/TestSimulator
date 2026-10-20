; MyTrainer installer hooks (bundle.windows.nsis.installerHooks).
; After the files are installed, Python and PyTorch are installed when this computer has none:
; `MyTrainer.exe --setup-python` finds every Python, keeps one that already has PyTorch, and
; otherwise installs Python (winget, or a portable one) and PyTorch (CUDA when there is an NVIDIA GPU).
; Its progress appears in the installer's details list; a failure does not fail the installation —
; the app offers the same setup again on its Python / PyTorch screen.

!macro NSIS_HOOK_POSTINSTALL
  SetDetailsView show
  StrCmp $LANGUAGE 1042 mt_ko mt_en
  mt_ko:
    DetailPrint "Python / PyTorch 확인 및 설치 (없을 때만, 몇 분 걸릴 수 있습니다)…"
    nsExec::ExecToLog '"$INSTDIR\MyTrainer.exe" --setup-python --lang ko'
    Pop $0
    StrCmp $0 "0" mt_done
    DetailPrint "Python / PyTorch 를 설치하지 못했습니다 ($0). 프로그램의 [Python / PyTorch 환경] 에서 다시 설치할 수 있습니다."
    Goto mt_done
  mt_en:
    DetailPrint "Checking and installing Python / PyTorch (only when missing; this can take a few minutes)…"
    nsExec::ExecToLog '"$INSTDIR\MyTrainer.exe" --setup-python --lang en'
    Pop $0
    StrCmp $0 "0" mt_done
    DetailPrint "Python / PyTorch could not be installed ($0). Install it again from the app's Python / PyTorch environment."
  mt_done:
!macroend
