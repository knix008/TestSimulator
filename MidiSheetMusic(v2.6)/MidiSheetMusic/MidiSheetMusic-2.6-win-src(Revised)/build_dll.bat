REM Script to build MidiSheetMusic.exe from the command prompt.
REM Modify the PATH to the directory containing the csc (C# compiler)

PATH=%PATH%;C:\WINDOWS\Microsoft.NET\Framework\v2.0.50727;

MSbuild.exe SheetMusicDLL.csproj

