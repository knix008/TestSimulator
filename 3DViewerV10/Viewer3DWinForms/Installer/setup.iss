; 3D Viewer — Inno Setup 6 설치 스크립트
; https://jrsoftware.org/isinfo.php 에서 무료 설치 가능

#define AppName        "3D Viewer"
#define AppVersion     "1.0.0"
#define AppPublisher   "Suho Kwon"
#define AppExeName     "Viewer3DWinForms.exe"
#define SrcDir         "..\..\publish\win-x64"
#define OutputDir      "..\..\publish"

[Setup]
AppId={{8B3A4C2D-5E6F-7A8B-9C0D-1E2F3A4B5C6D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://github.com/
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir={#OutputDir}
OutputBaseFilename=Viewer3DWinForms_Setup_{#AppVersion}
SetupIconFile=..\daemon_hammer.ico
UninstallDisplayIcon={app}\{#AppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041

[Languages]
Name: "korean";  MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
; 기본 해제: 사용자가 설치 마법사에서 선택해야 바로가기가 만들어짐. 아이콘은 daemon_hammer.ico
Name: "startmenuicon"; Description: "시작 메뉴에 바로가기 만들기 (daemon_hammer.ico)"; GroupDescription: "바로가기 옵션:"; Flags: unchecked
Name: "desktopicon"; Description: "바탕 화면에 바로가기 만들기 (daemon_hammer.ico)"; GroupDescription: "바로가기 옵션:"; Flags: unchecked

[Files]
Source: "{#SrcDir}\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "..\daemon_hammer.ico"; Tasks: startmenuicon
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"; IconFilename: "..\daemon_hammer.ico"; Tasks: startmenuicon
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "..\daemon_hammer.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
