#ifndef MyAppVersion
#define MyAppVersion "1.0.1"
#endif
#ifndef SourceDir
#define SourceDir "."
#endif
#ifndef OutputDir
#define OutputDir "..\..\dist"
#endif

[Setup]
AppId={{8B6E0A2E-5C1D-4F4A-9E3A-1D6E8F0A7B21}
AppName=MyDeskSearch
AppVersion={#MyAppVersion}
AppPublisher=MyDeskSearch
DefaultDirName={localappdata}\Programs\MyDeskSearch
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=MyDeskSearch-{#MyAppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Uninstallable=no
CreateAppDir=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\mydesksearch.exe"; DestDir: "{tmp}\mydesksearch-setup"; Flags: deleteafterinstall
Source: "{#SourceDir}\install.ps1"; DestDir: "{tmp}\mydesksearch-setup"; Flags: deleteafterinstall
Source: "{#SourceDir}\uninstall.ps1"; DestDir: "{tmp}\mydesksearch-setup"; Flags: deleteafterinstall
Source: "{#SourceDir}\install.cmd"; DestDir: "{tmp}\mydesksearch-setup"; Flags: deleteafterinstall
Source: "{#SourceDir}\version.txt"; DestDir: "{tmp}\mydesksearch-setup"; Flags: deleteafterinstall

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\mydesksearch-setup\install.ps1"""; Flags: waituntilterminated
