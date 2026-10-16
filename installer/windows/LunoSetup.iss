; Per-user, unsigned Windows installer built from PyInstaller's onedir output.
#define AppVersion "5.0.0"

[Setup]
AppId={{583D0AB1-5367-4698-82A2-BF714D64C0E9}
AppName=Luno Desktop
AppVersion={#AppVersion}
AppPublisher=LunoAI
DefaultDirName={localappdata}\Programs\Luno
DefaultGroupName=Luno Desktop
PrivilegesRequired=lowest
OutputDir=..\..\dist\installer
OutputBaseFilename=Luno-Setup-5.0.0
SetupIconFile=..\..\assets\luno.ico
UninstallDisplayIcon={app}\Luno.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\..\dist\Luno\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
Name: "autostart"; Description: "Start Luno Desktop at login"; Flags: unchecked

[Icons]
Name: "{group}\Luno Desktop"; Filename: "{app}\Luno.exe"
Name: "{autodesktop}\Luno Desktop"; Filename: "{app}\Luno.exe"; Tasks: desktopicon
Name: "{userstartup}\Luno Desktop"; Filename: "{app}\Luno.exe"; Tasks: autostart

[Run]
; An installer checkbox is explicit consent; persist it in settings.json.
Filename: "{app}\Luno.exe"; Parameters: "settings --enable-start-at-login"; Tasks: autostart; Flags: runhidden waituntilterminated
Filename: "{app}\Luno.exe"; Description: "Launch Luno Desktop"; Flags: nowait postinstall skipifsilent
