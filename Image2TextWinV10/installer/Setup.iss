#define MyAppName      "Image to ASCII Art"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "Image2TextWin"
#define MyAppExeName   "Image2TextWin.exe"
#define MyAppId        "{{A3F8C2D1-4E57-4B9A-8C3F-1D2E5F6A7B8C}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://github.com/
AppSupportURL=https://github.com/
AppUpdatesURL=https://github.com/
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=Output
OutputBaseFilename=Image2TextWin_Setup_v{#MyAppVersion}
SetupIconFile=..\Image2TextWin\AppIcon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
MinVersion=10.0
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; \
  Description: "바탕화면에 바로 가기 아이콘 만들기(&D)"; \
  GroupDescription: "추가 작업:"; \
  Flags: unchecked
Name: "startmenuicon"; \
  Description: "시작 메뉴에 추가(&S)"; \
  GroupDescription: "추가 작업:"; \
  Flags: checkedonce

[Files]
Source: "..\Image2TextWin\bin\Release\net8.0-windows\*"; \
  DestDir: "{app}"; \
  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\Image2TextWin\AppIcon.ico"; \
  DestDir: "{app}"; \
  Flags: ignoreversion
Source: "..\README.md"; \
  DestDir: "{app}"; \
  Flags: ignoreversion
Source: "..\UserGuide.md"; \
  DestDir: "{app}"; \
  Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; \
  Filename: "{app}\{#MyAppExeName}"; \
  IconFilename: "{app}\AppIcon.ico"; \
  Tasks: startmenuicon
Name: "{group}\{#MyAppName} 제거"; \
  Filename: "{uninstallexe}"; \
  Tasks: startmenuicon
Name: "{autodesktop}\{#MyAppName}"; \
  Filename: "{app}\{#MyAppExeName}"; \
  IconFilename: "{app}\AppIcon.ico"; \
  Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; \
  Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; \
  Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\Image2TextWin"

[Code]
// .NET 8 런타임 설치 여부 확인
function IsDotNet8Installed(): Boolean;
var
  Installed: Boolean;
  SubKeys: TArrayOfString;
  I: Integer;
  Version: String;
begin
  Installed := False;
  if RegGetSubkeyNames(HKLM64,
      'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedhost',
      SubKeys) then
  begin
    for I := 0 to GetArrayLength(SubKeys) - 1 do
    begin
      Version := SubKeys[I];
      if Copy(Version, 1, 2) = '8.' then
      begin
        Installed := True;
        Break;
      end;
    end;
  end;
  Result := Installed;
end;

function InitializeSetup(): Boolean;
begin
  if not IsDotNet8Installed() then
  begin
    if MsgBox('.NET 8 런타임이 설치되어 있지 않습니다.' + #13#10 +
              '프로그램 실행에 .NET 8 Desktop Runtime이 필요합니다.' + #13#10 +
              #13#10 +
              '설치를 계속하시겠습니까? (나중에 .NET 8을 설치해야 합니다.)',
              mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end;
  Result := True;
end;
