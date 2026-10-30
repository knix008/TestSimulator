# Getting Started

MySimulationMath is a program for numerical computing in the **M language** (`.mym` scripts and functions), drawing 2D and 3D figures, and simulating **block diagram models**. It runs with the same interface as a desktop app (Tauri 2) on Windows, macOS and Linux, and in a web browser. The computation engine runs separately from the interface inside a Web Worker, so the window never freezes, even during long computations.

![MySimulationMath desktop: Current Folder on the left, document tabs and Command Window in the middle, Workspace and Command History on the right](images/en/desktop.png)

## What You Can Do

| Area | Contents |
| --- | --- |
| Computation | Matrix and vector operations, linear algebra, polynomials, interpolation, numerical integration, ordinary differential equations (ODE), optimization, statistics, signal processing, control systems |
| Programming | Scripts, functions, anonymous functions, cells, structs, tables, strings, classes (`classdef`), error handling, debugger |
| Figures | 2D and 3D figures such as `plot`, `surf`, `mesh`, `contour`, `bar`, `histogram`; zoom, pan, rotate, data tips; export to PNG, JPEG, SVG and PDF |
| Simulation | Draw models with more than 120 blocks, run them with variable-step and fixed-step solvers, and view the results in scopes |
| Data | Read and write MAT, CSV, Excel (xlsx), JSON, XML, image and sound files |

## Running the Program

Install the desktop app with its installer, then launch it from the Start menu (or the Applications folder). To run from source, use the following commands.

| Command | Contents |
| --- | --- |
| `npm start` | Desktop app (always the latest code) |
| `npm run dev` | Web interface only (development server; picks a free port automatically) |
| `npm run web` | Build, then start the web server |
| `npm run msm` | Terminal prompt (`>>`); quit with `exit` |
| `npm run msm -- -r "disp(1)"` | Run one line of code in the terminal |

> Note: The web edition only works with files inside the **working folder** (by default `~/MySimulationMath`), and the `system()` command does not work. The desktop edition can use any folder on the computer.

## The First Five Minutes

1. When you open the program, the **Start Page** appears together with a "Run the tutorial?" window. Click **Run** to start a tutorial that drives the real interface and shows the features one by one.
2. Click **New Script** on the Start Page, or use **Home › New Script** ({{Ctrl+N}}) on the ribbon, to open the editor.
3. Type the code below and press {{F5}}; the script runs and a figure tab opens.

```m
t = linspace(0, 4*pi, 400);
y = sin(t) .* exp(-t/8);
plot(t, y)
grid on
title('Damped sine wave')
```

4. Type a short expression such as `max(y)` right after the `>>` in the Command Window to check the result.
5. Double-click `t` or `y` in the **Workspace** on the right to view the values as a table in the Variable Editor.

> Tip: Press {{F1}} anywhere to open this user manual, and type `help functionName` in the Command Window to show the help for that function.

## File Formats

| Extension | Contents | Double-click to |
| --- | --- | --- |
| `.mym`, `.m` | M scripts, functions, classes (saved as `.mym`) | Open in the editor |
| `.smdl` | Block diagram model (JSON) | Open in the model editor |
| `.slx`, `.mdl` | Models from other programs (common blocks are imported read-only) | Open in the model editor |
| `.mat` | Workspace data | Load with `load` |
| `.csv`, `.txt`, `.xlsx`, `.json` | Tabular data | Import as variables |
| `.png`, `.jpg`, `.bmp`, `.gif`, `.tif` | Images | Import with `imread` |
| `.wav` | Sound | Import with `audioread` |

## Window Position and What Is Remembered

The window position and size, the window (panel) layout, the ribbon tab, open files, recent files, theme and language all come back the next time you launch. Settings are stored in the user settings folder in the desktop edition, and in the server's settings folder in the web edition.
