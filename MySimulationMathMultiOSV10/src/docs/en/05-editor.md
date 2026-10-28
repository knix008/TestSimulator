# Editor

The editor is a tab for writing `.m` scripts, functions, classes and text files. It supports M syntax highlighting, line numbers, bracket matching, autocomplete, find/replace, section execution and breakpoint debugging.

![Editor: %% sections, line numbers, syntax highlighting, run output](images/en/editor.png)

## Working with Files

| Action | How |
| --- | --- |
| New Script | Ribbon **Home/Editor › New Script**, {{Ctrl+N}} |
| Open | **Open**, {{Ctrl+O}}, double-click in Current Folder, recent files |
| Save | **Save**, {{Ctrl+S}} (asks for a name for untitled files) |
| Save As | Ribbon **Editor › Save As** |
| Close | The ✕ on the tab, middle-button click |

Unsaved tabs are marked with ●. You are asked whether to save when you close a tab or quit the program. If you turn on **Auto save** in Settings › Editor, files that have been saved before are saved automatically after the set time.

## Running

| Action | Key | Description |
| --- | --- | --- |
| Run | {{F5}} | Saves the file and runs the whole script |
| Run Section | {{Ctrl+Enter}} | Runs only the `%%` section containing the cursor (no need to save) |
| Run selection | {{F9}} | Runs the selected code in the Command Window |

```m
%% Create the data
x = linspace(0, 1, 50);
y = x.^2 + 0.05*randn(size(x));

%% Fit a quadratic polynomial
p = polyfit(x, y, 2);
plot(x, y, 'o', x, polyval(p, x), '-')
legend('data', 'fitted curve')
```

A line starting with `%%` marks a section boundary and is shown in the editor as a bold line. Writing a section name after the `%%` makes the code easier to read.

> Note: A script in the current folder runs by its name alone; a script in another folder runs with `run('path/file.m')`. The run command is recorded in the Command Window and the Command History.

## Debugging

![Editor stopped at a breakpoint and the K>> prompt](images/en/debug.png)

1. Click to the left of a line number or press {{F12}} to set a **Breakpoint** (red dot). Click again to remove it.
2. When you run with {{F5}}, execution stops at the breakpoint and that line is highlighted in green. The Command Window prompt changes to `K>>`, where you can inspect or change the variables at that moment.
3. Continue with the debug buttons on the ribbon's **Editor** tab or with the keys.

| Action | Key |
| --- | --- |
| Continue | {{F5}} |
| Step (does not enter functions) | {{F10}} |
| Step In (enters functions) | {{F11}} |
| Step Out (to the end of the current function) | {{Shift+F11}} |
| Stop | Ribbon **Stop**, the ■ in the Command Window |

You can also use commands: `dbstop in file at line`, `dbclear all`, `dbcont`, `dbstep`, `dbquit`, `keyboard` (stop right there). **Clear all breakpoints** on the ribbon removes the breakpoints in every file. Breakpoints are kept for the next run.

## Editing Features

| Action | Key |
| --- | --- |
| Find / Replace | {{Ctrl+F}} (the replace field in the find bar) |
| Go to line | {{Ctrl+G}} |
| Comment / Uncomment | {{Ctrl+R}} / {{Ctrl+T}} |
| Indent / Outdent | {{Ctrl+]}} / {{Ctrl+[}} |
| Autocomplete | A list appears as you type; choose with {{Enter}}/{{Tab}} |
| Undo / Redo | {{Ctrl+Z}} / {{Ctrl+Y}} |
| Multiple selections | {{Alt}}+click, {{Ctrl+D}} (add the next occurrence of the same word) |

Change the font, size, tab size, line numbers and line wrapping in Settings › Editor.

## Function Files

A function file starts with `function`, and the file name must match the function name. Save it in the current folder (or a folder added with `addpath`) and you can call it by name from the Command Window and from other scripts.

```m
function [m, s] = stats(x)
%STATS Mean and standard deviation
%   [m, s] = stats(x)
m = mean(x);
s = std(x);
end
```

The first comment lines become the help shown by `help stats`. You can also put local functions at the end of a script file.

## Live Script and Class Templates

On the Start Page, **New › Live script** opens a template divided into `%%` sections in a new tab, and **Function** and **Class** open `function` and `classdef` templates.
