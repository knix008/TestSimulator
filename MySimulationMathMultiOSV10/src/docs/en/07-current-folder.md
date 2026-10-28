# Current Folder

The current folder is the same folder as `pwd` in the Command Window. Scripts and functions in this folder run by name alone, and relative paths in file commands such as `load`, `save` and `readtable` are also resolved against this folder.

![Current Folder window](images/en/folder.png)

## Changing Folders

- Type a folder in the path field at the top and press {{Enter}}.
- **↑** button: parent folder.
- Folder button: folder selection dialog.
- Refresh button: reread the list.
- Double-click a folder in the list.
- `cd folder` in the Command Window.

Set the folder to open on launch with **Start folder** in Settings › General (leave it empty for the last folder or the default folder).

## Double-clicking a File

| File | Action |
| --- | --- |
| `.m`, text | Open in the editor |
| `.smdl`, `.slx`, `.mdl` | Open in the model editor |
| `.mat` | Load into the workspace with `load` |
| Image, sound, CSV, Excel, JSON | Import as variables (the command that was run is shown in the Command Window) |
| Other binary files | Not opened; a notice is shown |

## Right-click Menu

| Item | Key | Action |
| --- | --- | --- |
| Open | {{Enter}} | Same as the table above |
| Run | {{F9}} | Run the script |
| New Script / New Model / New folder | | Create in this folder |
| Rename | {{F2}} | Edit in place |
| Delete | {{Del}} | Delete after confirmation (files can be restored with Undo) |
| Copy path | | Copies the full path to the clipboard |
| Refresh | | Reread the list |

The list is a tree with folders first; click the ▸ to the left of a folder to expand it. Information such as the size and modification date of the selected file appears at the bottom. Right-clicking a folder also offers **Go to this folder**.

> Note: In the web edition you cannot leave the server's working folder. Opening and saving files also use an in-app file picker.

## Path

Use `addpath folder` to make functions in another folder callable, and manage the path with `rmpath` and `path`. `which name` tells you which file a name comes from.

## Find Files

**Home › Find Files** on the ribbon searches for files under the current folder by file name or content. Double-click a result to open the editor at that line.
