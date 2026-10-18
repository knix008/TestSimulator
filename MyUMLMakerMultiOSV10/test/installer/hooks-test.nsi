; Runs the real hooks.nsh logic against a fake installation (all paths and keys from /D defines).
Unicode true
!include "MUI2.nsh"
!include "Win\RestartManager.nsh"
!include "${HOOKS}"

Name "MumHookTest"
OutFile "${OUT}"
InstallDir "${INST}"
RequestExecutionLevel user

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"

Section
  !if "${MODE}" == "gui"
    Call MumGuiInit
  !else
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif
  ${If} $MumWipe == 1
    Call MumWipeData
  ${EndIf}
  FileOpen $0 "${RESULT}" w
  FileWriteUTF16LE $0 "wipe=$MumWipe|user=$MumOldUser|machine=$MumOldMachine|done=$MumDone|lang=$LANGUAGE|ask=$(MumAskData)"
  FileClose $0
SectionEnd
