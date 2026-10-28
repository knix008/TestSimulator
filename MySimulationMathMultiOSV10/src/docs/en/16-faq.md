# FAQ and Troubleshooting

## Running and the Engine

**I typed a command but nothing happens.**
Check the engine status in the status bar. If it says "Running", a previous command is still running and the new command is waiting its turn. Stop it with {{Ctrl+C}} or the ■ button in the Command Window.

**The engine seems to be stuck.**
Click **Apps › Restart Engine** on the ribbon. The workspace variables are lost, so save them first with `save` if needed.

**I get a "function not found" error.**
Check that the function file is in the current folder or in a folder added with `addpath`, and that the file name matches the function name. You can check with `which name`.

**I changed my script but it behaves as before.**
Check that you saved it in the editor (the ● mark on the tab). {{F5}} saves and then runs.

## Figures

**I can't see my figure.**
Click the **Figures** tab among the document tabs. While you are typing in the editor, the Figures tab does not come to the front.

**I want to view a 3D plot from above.**
Use the **2D view / 3D view** button on the toolbar or `view(2)`. To go back to 3D, use the same button or `view(3)`.

**How do I return a zoomed figure to its original view?**
Click **Fit** on the toolbar.

**My 3D surface is too dark or too bright.**
Try `shading interp`, `lighting gouraud`, `material dull` and so on.

## Simulation

**I get an "algebraic loop" warning.**
There is a feedback loop made only of direct feedthrough blocks. Put a block with state, such as Unit Delay, Memory or Integrator, inside the loop. You can change how it is handled in Model settings › Diagnostics.

**The simulation is too slow.**
If the problem is stiff, use a stiff solver such as `ode15s`, and check that the maximum step is not set too small. If Simulation pacing is on, turn it off.

**The scope is empty.**
Check that you ran the model and that a line is connected to the Scope's input. Also check the Diagnostics list at the bottom for warnings.

## Interface and Settings

**The window layout is a mess.**
Click **Home › Layout › Default layout** on the ribbon.

**The text is too small or too large.**
Change the font size in Settings › Command Window / Editor. In the user manual, use the [−] [+] in its window.

**The tutorial prompt appears every time / I want to see it again.**
Turn off **Show this window next time** in the prompt window, or turn it on and off with **Ask whether to run the tutorial on launch** in Settings › Start Page.

**I can't see my computer's files in the web edition.**
The web edition only uses the server's working folder. Start the server with `--root folder` or the environment variable `MSM_ROOT` to set the working folder.

**The user manual window does not open (web).**
If the browser blocks pop-ups, the manual opens as a floating window inside the page. Allow pop-ups in the address bar to have it open in a separate window.
