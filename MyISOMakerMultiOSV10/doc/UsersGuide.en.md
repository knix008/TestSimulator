# MyISOMaker User's Guide

Version 1.0.2 · Windows / macOS / Linux

## 1. Overview

MyISOMaker is a desktop program for disc images. It opens ISO, IMG, AppImage and Docker save (tar) images, shows their contents as a tree, lets you change them, and saves them in the same format or another one. It also builds new ISOs from folders, makes BIOS/UEFI bootable ISOs, and mounts images as operating-system drives.

- Opening, tree editing and saving use the program's own ISO9660 reader/writer and need no extra engine.
- Create ISO, Bootable ISO and full extraction use the xorriso engine. If it is missing, the program installs it automatically on first start.
- Opening and saving AppImages use squashfs-tools (unsquashfs / mksquashfs).
- Mounting uses the operating system (Mount-DiskImage on Windows, hdiutil on macOS, mount or fuseiso on Linux).

The program is a Tauri 2 window with a React interface; a bundled Node host does the image work. The minimum window size is 1480 × 700. The interface language is Korean or English; Korean is the default.

## 2. Installation and first start

### 2.1 Windows installer

1. Run the `MyISOMaker` setup file (NSIS).
2. Any earlier installation of MyISOMaker, or of its old name "ISO Maker", is removed completely first.
3. The installer asks whether to delete the saved user data (settings, recent list and so on). If you keep it, the new version carries on with it.
4. The installation is per user and needs no administrator rights.
5. Start MyISOMaker when setup finishes.

### 2.2 Automatic package installation

If xorriso is not found at startup, the program installs it automatically. A small popup window shows the progress (download / unpack, percent) and can be cancelled. If you cancel or it fails, opening, editing and saving still work; you can install later in Settings › Packages.

| Operating system | How it is installed |
|---|---|
| Windows | Downloads the MSYS2 packages (xorriso and the few runtime libraries it needs) from repo.msys2.org and unpacks them into `%LOCALAPPDATA%\MyISOMaker\tools`. No MSYS2 installation and no administrator rights are needed. |
| macOS | Runs `brew install xorriso squashfs` with Homebrew. |
| Linux | Runs the system package manager (apt / dnf / pacman / zypper) through pkexec, which asks for your password. |

> If the program has not installed its own copy, it uses an existing system copy of xorriso (for example in `C:\msys64`).

### 2.3 Running from source (developers)

```
npm install
npm start
```

Building installers:

| Command | Result |
|---|---|
| `npm run build:win` | Windows NSIS installer |
| `npm run build:mac` | macOS installer (run on macOS) |
| `npm run build:linux` | Linux installer |
| `npm run build:all` | All platforms that can be built |
| `npm run build:debug` | Debug build |

The finished installer is copied to the project root.

### 2.4 Web version

```
npm run start:web
```

It opens in the browser on port 5174. You can open an image, browse and edit the tree, and download the result. Mounting and the xorriso features (Create ISO, Bootable ISO, full extraction) are not available in the web version.

## 3. Screen layout

The window has no system title bar. The top two rows are the title bar and the toolbar.

| Area | Description |
|---|---|
| Title row (first row) | Program icon, name and version on the left; at the right end the Explorer / Log / Info panel buttons, then minimize, maximize and close. Drag an empty spot to move the window; double-click the name to maximize |
| Tool row (second row) | **Start** at the far left, open / close / save the image, editing tools, work tabs, Run, Stop, Open folder, Check the engine; at the right end the theme button (▾), the flag (language), Settings, Help and About. Always one row |
| Explorer (left) | The computer's folders and files. Double-click an image to open it; drag files onto the tree in the middle to add them |
| Work area (middle) | The image tree (Contents tab) or the fields of each tab. With no image open it shows the program icon, a description and buttons to start |
| Info (right) | The open image (file, format, volume, entries, size, state), the entries picked in the tree, the engine status |
| Log (bottom) | Open, add, delete, drag, save and package records |
| Status bar | At the bottom. Engine status, image path, volume label, entry count, modified mark, progress message |

The Explorer, Info and Log panels fold and unfold with the button at the right end of their header (the same button as the panel buttons on the toolbar). A folded panel stays as a thin bar; click it to unfold. Drag a panel edge to resize it; state and size are kept for the next start.

### 3.1 Toolbar

Tool buttons show only their icon; hover for the name. Only the theme button also shows the theme name.

| Button | Description |
|---|---|
| Start | Opens the start screen; pressed again on the start screen it returns to the work view |
| Open image | Opens an ISO/IMG, AppImage or Docker save (.tar) as a tree (Ctrl+O) |
| Close image | Closes the open image; asks first when there are unsaved changes |
| Save | Saves the changes as ISO/IMG/AppImage/tar |
| Add files · New folder · Rename · Delete | Work on the place or entries picked in the tree |
| Extract selected · Copy path | Extract the picked files to disk, or copy the path inside the image |
| Contents · Create · Bootable ISO · Mount | Switch the work tab |
| Run · Stop · Open folder | Run the current tab's job (Ctrl+Enter), stop it, open the related folder |
| Check the engine again | Looks for xorriso again |
| Explorer · Log · Info panel | Fold or unfold each panel |
| Theme (▾) | Switches to the next theme of the same family; ▾ lists every theme |
| Flag | Switches the language between 한국어 and English (shows the current language) |
| Settings · Help · About | The settings window, this manual, version and copyright |

### 3.2 Right-click menus

| Where | Menu |
|---|---|
| Tree entry | Save outside, Add files, New folder, Rename, Delete, Show in the info panel, Copy path |
| Empty part of the tree | Add files, New folder, Close image |
| Image in the explorer | Open image, Open on the Mount tab, Add to the open image, Open with the default program, Copy path |
| Folder in the explorer | Expand/Collapse, Create an ISO from this folder, Extract the selected image entries here, Add to the open image, Open folder, Copy path, Refresh |
| Empty part of the explorer | Refresh, Collapse all, Show/Hide files |
| Info panel | Copy value, Copy all |
| Log | Copy this line, Copy the whole log, Clear the log, Collapse panel |
| Recent image on the start screen | Open image, Open on the Mount tab, Open folder, Copy path, Remove from the list |

## 4. Start screen

**Start** on the toolbar opens the start screen over the whole window (the Explorer, Info and Log panels are hidden). Press **Start** again and the work view is drawn again. A tip banner sits at the top; **More** shows the longer text. Below it is the card board.

| Card | Contents |
|---|---|
| Program name card | Icon, name, version, description, About and Open image (fixed: cannot be moved or resized) |
| Start | Six tiles: Open image, View · edit contents, Create ISO, Bootable ISO, Mount, About |
| Recent images | Images opened lately; click to open. Remove one or clear the list |
| What you can do | Edit images, Drag in · drag out, Save in another format, ISO from a folder, Bootable ISO, Mount · unmount |
| Engine (xorriso) | Availability, version, path and **Check again** |
| Background | A card that takes a whole row: 24 moving backgrounds with speed, strength and automatic change |

### 4.1 Moving and resizing cards

- The program-name card at the top is fixed: it cannot be moved or resized.
- Move the other cards by dragging their pink four-way-arrow handle.
- Resize a card by dragging the dotted corner at its lower right.
- Double-click the dotted corner to fit the card to its content.
- **Arrange cards** puts all cards back in the default layout.
- Clear **Show this screen at startup** to go straight to the work screen next time.

### 4.2 Background

The Background card offers 24 moving backgrounds. Disc-themed ones come first (discs, burn, sectors, tracks, folder tree, beams), followed by generic ones such as aurora, waves, starfield and snow.

- Speed slider: how fast the background moves
- Strength slider: how strongly the background shows
- Automatic change: switches the background at intervals

The same settings are in Settings › Start screen.

## 5. Opening images

1. Click **Open image** on the toolbar or press Ctrl+O. You can also pick one from Recent images on the start screen.
2. The tree appears on the **Contents** tab.
3. The status bar shows the volume name and entry count.
4. Type in the search box above the tree (Search in tree…) to filter by name.

### 5.1 Supported formats

| Format | Extensions | Open | Save | Tools needed |
|---|---|---|---|---|
| ISO image | `.iso` | Yes | Yes (ISO9660 + Joliet) | None |
| Disk image | `.img` | Yes (finds the ISO9660 area inside partitions) | Yes (ISO9660) | None |
| AppImage | `.AppImage` | Yes (unpacks the embedded squashfs) | Yes (original runtime + new squashfs) | unsquashfs / mksquashfs |
| Docker save | `.tar`, `.tgz`, `.tar.gz`, `.docker` | Yes (output of `docker save`) | Yes (tar or gzip tar) | OS tar |

> Large ISOs over 4 GB can be opened. Reading the tree and saving big files takes time; watch the status bar and the change log.

## 6. Editing the tree

Nothing in the original file changes until you save. When there are changes, the title and status bar show **Modified**.

### 6.1 Selecting

- Click: select one entry
- Ctrl (⌘ on macOS) + click: add to or remove from the selection
- Shift + click: select a range
- The number of selected entries is shown at the right of the toolbar.

### 6.2 Right-click menu

| Item | Description |
|---|---|
| Save outside… | Exports: one file is saved under a name you choose; several are saved together into a folder you choose |
| Add files… | Adds files to the chosen folder (or the parent folder of the chosen entry) |
| New folder… | Creates a folder at that location |
| Rename… | Renames the entry (only one selected) |
| Delete | Deletes the selected entries after a confirmation |
| Copy path | Copies the path inside the image to the clipboard |

Right-click an empty area of the tree to add files or create a folder at the root. **Add files** on the toolbar does the same; if a folder is selected in the tree, files go into that folder.

## 7. Drag in and drag out

### 7.1 From Explorer into the tree

- Drop files or folders from Explorer (Finder) on a folder in the tree to add them there.
- Dropped on a file, they go into that file's folder.
- Dropped on an empty area, they go to the root.

### 7.2 From the tree to Explorer

- Drag files out of the tree to Explorer to extract them right away.
- Temporary copies are prepared before the drag. Preparation starts when you hover a file and shows `…` while it runs; for big files, drag again when it is ready.
- Select several entries with Ctrl/Shift and drag one of them to take them all.
- To export whole folders, use right-click › Save outside….

## 8. Saving and formats

1. Click **Save** on the toolbar.
2. Choose a file name and format in the save dialog. The default name is the original name with `-edited` added.
3. When it finishes, the status bar shows **Saved** and the change log records it.

| Save as | What happens |
|---|---|
| `.iso` / `.img` | Writes a plain ISO9660 (+Joliet) data image |
| `.tar` / `.tgz` / `.docker` | Packs the current tree as tar (or gzip tar). Use it to re-save an edited Docker save |
| `.AppImage` | Original AppImage runtime + new squashfs. Only when an AppImage was opened; needs mksquashfs |

> Saving as ISO may not preserve boot information. If you need a bootable ISO, rebuild it on the Bootable tab.

### 8.1 Unsaved changes

If you open another image or close the window with unsaved changes, the Unsaved changes dialog appears.

- Save & open / Save & quit: save first, then continue.
- Don't save: discard the changes and continue.
- Cancel: go back without doing anything.

## 9. Creating an ISO (folder → ISO)

1. Open the **Create** tab on the toolbar.
2. Choose the folder in **Source directory** (Browse).
3. Enter a **Volume label**. The default is `ISOMAKER`.
4. Choose the file name in **Output ISO**.
5. Click **Create ISO**, or **Run create** on the toolbar (Ctrl+Enter).

The result is an ISO9660 + Joliet (long names) image. xorriso is required; **Stop** halts a running job.

## 10. Bootable ISO

The source folder must contain the bootloader images. The usual flow is to extract an existing bootable ISO to a folder, change it, and rebuild it here.

1. Open the **Bootable** tab.
2. Choose the folder containing boot files in **Source directory**.
3. Enter a **Volume label**.
4. Turn on **BIOS (El Torito)** and/or **UEFI**. At least one is required.
5. Set the path fields relative to the source folder.
6. Choose **Output ISO** and click **Create bootable ISO** (or Run bootable, Ctrl+Enter).

| Field | Default / example | Description |
|---|---|---|
| BIOS boot image (relative to source) | `boot/grub/i386-pc/eltorito.img` | El Torito no-emulation boot image. The boot catalog is written as `boot.catalog` |
| EFI boot image (relative to source) | `EFI/BOOT/efiboot.img` | FAT image for UEFI (El Torito alternate boot entry) |
| isohybrid MBR (optional, relative) | `boot/grub/i386-pc/boot_hybrid.img` | MBR for a hybrid ISO that also boots when written to a USB stick. If empty, UEFI uses the GPT layout |

> If a file you name is not in the source folder, the job fails. Check the case of the path and use / as the separator.

## 11. Mounting

1. Open the **Mount** tab.
2. Choose the ISO to mount. If left empty, the currently opened image is used.
3. Click **Mount** (or Run mount, Ctrl+Enter). The location appears after **Mounted at:**.
4. Use **Open folder** to open the mounted location.
5. Click **Unmount** when you are done.

| Operating system | Method | Location |
|---|---|---|
| Windows | Mount-DiskImage | Virtual CD/DVD drive letter (for example `E:\`) |
| macOS | hdiutil attach -readonly | `/Volumes/…` |
| Linux | mount -o loop,ro, falling back to fuseiso | A temporary folder |

Mounts are read-only. To change an image, edit it on the Contents tab and save.

## 12. Themes and the custom theme

There are 20 dark themes, 20 light themes and one custom theme.

- Clicking the theme button switches to the next theme of the same family: dark stays dark, light stays light.
- The ▾ dropdown to its right shows all themes as colour chips, grouped Dark / Light, followed by Custom and **Edit custom theme…**.
- The custom theme is made in Settings › Theme by picking four colours: background, panel, text and accent.

The chosen theme and language are kept for the next start.

## 13. Settings

Click **Settings** on the toolbar to open the Settings dialog.

| Tab | Contents |
|---|---|
| General | Interface language, show the start screen at startup |
| Theme | Theme grid, custom theme editor (background · panel · text · accent) |
| Packages | Status of xorriso and squashfs-tools; Install · Reinstall · Remove |
| Start screen | Background, speed, strength, automatic change |

## 14. Packages

| Package | Used for |
|---|---|
| xorriso | Create ISO, Bootable ISO, full extraction |
| squashfs-tools (unsquashfs / mksquashfs) | Opening AppImages and saving as AppImage |

Settings › Packages shows for each package:

- Status: installed by the app / found on the system / missing
- Path and version
- Buttons: **Install**, **Reinstall**, **Remove**

Installing shows the same progress popup as on first start and can be cancelled. On Windows the files go into `%LOCALAPPDATA%\MyISOMaker\tools`, and Remove deletes them from there. macOS uses Homebrew; Linux uses the system package manager (pkexec asks for the password).

## 15. Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+O (⌘+O on macOS) | Open image |
| Ctrl+Enter (⌘+Enter on macOS) | Run the current tab's job (create · bootable · mount) |
| Ctrl (⌘) + click | Toggle a tree entry in the selection |
| Shift + click | Select a range in the tree |
| ← / → (splitter focused) | Change the width of the change log panel |

## 16. Troubleshooting

| Symptom | What to check |
|---|---|
| xorriso not found / engine missing | Install xorriso in Settings › Packages. Use **Check again** on the Engine card of the start screen. Opening, editing and saving work without it |
| Automatic installation failed | Check the internet connection and access to repo.msys2.org, then click **Reinstall** in Settings › Packages |
| An AppImage will not open | squashfs-tools (unsquashfs) is required. Install it in Settings › Packages |
| Cannot save as AppImage | mksquashfs is required, and saving as AppImage is only possible when an AppImage was opened |
| A Docker save (.tar) will not open | The operating system's tar command is required |
| Symlink warnings during extraction (Windows) | Symbolic links in Linux images often cannot be created on Windows and are skipped. The other files are extracted normally |
| Mount fails | Some systems need administrator rights. On Linux, run with privileges or install fuseiso |
| Drag-out does nothing | Wait until the `…` marker disappears and drag again. For folders use right-click › Save outside… |
| The saved ISO does not boot | Plain saving does not guarantee boot information. Rebuild it on the Bootable tab |
| Bootable ISO fails | Check that the BIOS/EFI image paths are right relative to the source folder |
| The desktop bridge (Tauri) is not connected | Quit the program and start it again |

The **Copy** button in error dialogs copies the message, which helps when looking for the cause.

## 17. Data locations (Windows)

| Location | Contents |
|---|---|
| `%APPDATA%\MyISOMaker` | Values the program remembers, such as the last folder used |
| `%LOCALAPPDATA%\com.shkwon.myisomaker` | WebView storage (language, theme, start-screen layout, recent list and so on) |
| `%LOCALAPPDATA%\MyISOMaker\tools` | xorriso and its runtime libraries installed by the program |

## 18. Uninstalling

- Windows: remove MyISOMaker from Settings › Apps or Control Panel. The tools folder the program installed (`%LOCALAPPDATA%\MyISOMaker\tools`) is removed with it.
- To remove all user data, delete the folders listed under Data locations. The installer of a new version also asks whether to delete it.
- On macOS / Linux, xorriso and squashfs-tools installed with Homebrew or the package manager are system packages; remove them separately.

Copyright © SHKWON (knix008@naver.com). All rights reserved.
