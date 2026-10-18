; Stands in for an old MyUMLMaker uninstall.exe: records how it was called.
Unicode true
!include "FileFunc.nsh"
OutFile "${OUT}"
RequestExecutionLevel user
SilentInstall silent
Name "FakeUninstall"
Section
  ${GetParent} "$EXEPATH" $1
  FileOpen $0 "$1\..\uninstall-calls.log" a
  FileSeek $0 0 END
  FileWrite $0 "$CMDLINE$\r$\n"
  FileClose $0
SectionEnd
