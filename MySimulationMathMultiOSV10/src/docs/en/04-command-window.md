# Command Window

The Command Window is where you run M code one line at a time. Type an expression after the `>>` prompt and press {{Enter}}; the result appears below.

![Command Window: creating variables, matrix output, error display](images/en/command.png)

## Basic Usage

```m
x = 1:5
s = sum(x);
disp(s)
A = magic(3)
```

- A statement that ends with a semicolon (`;`) does not print its result.
- If you write only an expression without a variable name, the result goes into `ans`.
- To put several statements on one line, separate them with `,` or `;`.
- End a long line with `...` and continue on the next line.
- When you open a block such as `for`, `if` or `function`, {{Enter}} inserts a line break, and the whole block runs at once when it is closed.

## Keys

| Key | Action |
| --- | --- |
| {{Enter}} | Run (line break if a block is open) |
| {{Shift+Enter}} | Line break |
| {{↑}} / {{↓}} | Command history (only entries starting with the typed text) |
| {{Tab}} | Autocomplete (variables, functions, file names) |
| {{Ctrl+C}} | Copy if text is selected, otherwise interrupt execution |
| {{Esc}} | Clear the input |
| {{Ctrl+0}} | Move focus to the Command Window |

> Tip: You can turn off {{Tab}} autocomplete and the {{Ctrl+C}} copy behavior in Settings › Keyboard.

## Output Format

Change how numbers are displayed with the `format` command. **Numeric format** in Settings › Command Window does the same.

```m
format long
pi
format short
pi
format compact
```

| Command | Effect |
| --- | --- |
| `format short` | 4 digits after the decimal point (default) |
| `format long` | 15 digits |
| `format shortE`, `format longE` | Exponential notation |
| `format shortG`, `format longG` | Whichever of fixed or exponential is shorter |
| `format rat` | Rational approximation |
| `format compact` / `format loose` | Remove / add blank lines |

## Errors and Links

Errors are shown in red and warnings in orange. Clicking the `file.m:line` or `(line 12)` part of a message opens that line in the editor. You can see the last error again with `lasterr` and `MException`.

## Code That Asks for Input

When code that asks for a value, such as `input('Value: ')`, runs, the prompt changes to the question text. Type a value and press {{Enter}} to continue execution. Commands typed while the engine is busy wait their turn and then run.

## Frequently Used Commands

| Command | Contents |
| --- | --- |
| `clc` | Clear the Command Window |
| `clear` / `clear x` | Clear all variables / x from the workspace |
| `who`, `whos` | List of variables (with size and class) |
| `help name`, `doc name` | Help |
| `lookfor word` | Find functions whose description contains the word |
| `which name`, `exist name` | Location and kind of a function or file |
| `pwd`, `cd folder`, `dir`, `ls` | Show, change and list the current folder |
| `tic`, `toc` | Measure elapsed time |

## Running in a Terminal

You can use the same engine in a terminal without the GUI.

| Command | Contents |
| --- | --- |
| `npm run msm` | Interactive prompt (quit with `exit`) |
| `npm run msm -- -r "x = magic(3)"` | Run the code, then quit |
| `npm run msm -- --cd work run_me.m` | Change the folder and run a script |
