# CompareMasterWinV10

Windows WinForms diff tool for directory and file comparison.

## Main Features

- Left/Right split panels with independent select buttons
- Popup selection for both directories and files
- Automatic compare when both sides are selected
- Manual re-compare using `Compare` button after option changes
- Directory tree rendering with file/folder icons and status colors
- File line diff with same/different color highlighting
- Inline changed segment highlight in modified lines
- Options: ignore whitespace, ignore case, exclude patterns

## Build

```powershell
dotnet build CompareMasterWinV10.slnx
```

## Run

```powershell
dotnet run --project CompareMasterWinV10.App
```

## Project Files

- `CompareMasterWinV10.App/Form1.cs`: main UI and compare logic
- `.gitignore`: git ignore rules
- `.ignore`: additional ignore rules for tools/workflows
