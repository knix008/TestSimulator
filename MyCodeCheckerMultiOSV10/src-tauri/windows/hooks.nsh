; MyCodeChecker installer hooks (Tauri NSIS).
; After installing, offer to install Git through winget when it is missing.
; The user chooses; silent installs (/S) never install anything extra.

!macro NSIS_HOOK_POSTINSTALL
  IfSilent mcc_tools_done
  nsExec::ExecToStack 'cmd /c git --version'
  Pop $0
  Pop $1
  StrCmp $0 "0" mcc_tools_done
  nsExec::ExecToStack 'cmd /c winget --version'
  Pop $0
  Pop $1
  StrCmp $0 "0" mcc_has_winget
  StrCmp $LANGUAGE 1042 0 +3
    MessageBox MB_OK|MB_ICONINFORMATION "Git이 설치되어 있지 않습니다.$\r$\n새 코드(SCM)·작성자 자동 할당·PR 분석에 Git이 필요합니다.$\r$\nhttps://git-scm.com/downloads 에서 설치하거나, 프로그램의 [도구 › 필요한 소프트웨어]에서 설치하세요."
    Goto mcc_tools_done
  MessageBox MB_OK|MB_ICONINFORMATION "Git is not installed.$\r$\nGit is used for SCM new code, author assignment and pull request analysis.$\r$\nInstall it from https://git-scm.com/downloads or later from Tools › Required software."
  Goto mcc_tools_done
mcc_has_winget:
  StrCmp $LANGUAGE 1042 0 mcc_ask_en
    MessageBox MB_YESNO|MB_ICONQUESTION "Git이 설치되어 있지 않습니다.$\r$\n새 코드(SCM)·작성자 자동 할당·PR 분석에 Git을 씁니다.$\r$\n$\r$\n지금 winget으로 Git을 설치할까요?" IDNO mcc_tools_done
    Goto mcc_install
mcc_ask_en:
  MessageBox MB_YESNO|MB_ICONQUESTION "Git is not installed.$\r$\nMyCodeChecker uses Git for SCM new code, author assignment and pull request analysis.$\r$\n$\r$\nInstall Git now with winget?" IDNO mcc_tools_done
mcc_install:
  DetailPrint "winget install --id Git.Git"
  nsExec::ExecToLog 'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent'
  Pop $0
  StrCmp $0 "0" mcc_tools_done
  StrCmp $LANGUAGE 1042 0 +3
    MessageBox MB_OK|MB_ICONEXCLAMATION "Git 설치가 끝나지 않았습니다 (코드 $0).$\r$\n프로그램의 [도구 › 필요한 소프트웨어]에서 다시 시도할 수 있습니다."
    Goto mcc_tools_done
  MessageBox MB_OK|MB_ICONEXCLAMATION "Git was not installed (code $0).$\r$\nYou can try again from Tools › Required software."
mcc_tools_done:
!macroend
