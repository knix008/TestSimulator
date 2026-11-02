# Block Diagram Simulation

The block diagram editor lets you draw a dynamic system as blocks connected by lines that carry signals, and simulates it over time with a numerical solver. Models are saved as `.smdl` files (JSON text).

![Model editor: Library on the left, canvas in the middle, toolbar at the top](images/en/model-editor.png)

## Opening and Creating Models

- Ribbon **Home › New Model**, **Simulation › New Model**, or **New Model** on the Start Page.
- **Simulation › Open model**, or double-click an `.smdl` in Current Folder. `.slx` · `.mdl` files are imported with their common blocks.
- With commands: `new_system('mymodel')`, `open_system('mymodel')`.

A model tab consists of the **toolbar** at the top, the **Block library** on the left, the **canvas** in the middle and the **Diagnostics** list at the bottom. When you go inside a subsystem, a path (breadcrumb) appears above the canvas; click it to go back up.

## Block Library

![Block library and search](images/en/model-library.png)

| Group | Representative blocks |
| --- | --- |
| Sources | Constant, Step, Ramp, Sine Wave, Pulse Generator, Clock, Signal Generator, Chirp Signal, Random Number, Band-Limited White Noise, From Workspace, Repeating Sequence, Signal Builder, Counter, Ground |
| Sinks | Scope, Floating Scope, XY Graph, Display, To Workspace, Terminator, Stop Simulation |
| Continuous | Integrator, Derivative, Transfer Fcn, State-Space, Zero-Pole, Transport Delay, Variable Transport Delay, PID Controller |
| Discrete | Unit Delay, Delay, Zero-Order Hold, Discrete-Time Integrator, Discrete Transfer Fcn, Discrete Filter, Discrete State-Space, Discrete PID Controller, Memory, Difference, Tapped Delay, and more |
| Math Operations | Sum, Product, Gain, Slider Gain, Abs, Sign, Math Function, Trigonometric Function, Sqrt, MinMax, Rounding Function, Bias, Dot Product, Polynomial, Reshape, and more |
| Discontinuities | Saturation, Dead Zone, Rate Limiter, Relay, Quantizer, Backlash, Coulomb & Viscous Friction, Hit Crossing, Wrap To Zero, and more |
| Logic and Bit Operations | Relational Operator, Logical Operator, Compare To Constant, Compare To Zero, Bitwise Operator, Interval Test, Combinatorial Logic, and more |
| Lookup Tables | 1-D / 2-D / n-D Lookup Table, Prelookup, Direct Lookup Table, Lookup Table Dynamic, Sine and Cosine |
| Signal Routing | Mux, Demux, Bus Creator, Bus Selector, Switch, Multiport Switch, Manual Switch, Selector, Goto, From, Merge, Data Store Memory/Read/Write |
| Signal Attributes | Data Type Conversion, Signal Specification, Width, Probe, Rate Transition, IC |
| Ports & Subsystems | Subsystem, In, Out, Enable, Trigger, Action Port, For Iterator, While Iterator, If, Switch Case |
| User-Defined Functions | Fcn, M Function, Interpreted M Function |

- Type a name in the search field at the top to search all groups.
- **Drag** a block onto the canvas, or **double-click** it to add it at the center of the canvas.
- Hover over a block to see its description.

## Working with Blocks and Lines

| Action | How |
| --- | --- |
| Select | Click; {{Shift}}/{{Ctrl}}+click to add; drag on an empty area for box selection |
| Move | Drag (aligns to the grid when grid snap is on), arrow keys |
| Resize | Drag a corner handle of the selected block |
| Connect | Drag from an output port (▸ on the right) to an input port (on the left) |
| Branch | Drag from an existing line to another input port |
| Bend a line | Drag the line to move its bend points |
| Line shape | Right-click the line › **Straight line** / **Elbow line** / **Curve**, or select lines and use **Colour › Line shape** in the **Block Properties** pane |
| Signal name | Double-click the line ({{Enter}} to confirm, {{Esc}} to cancel) |
| Parameters | Double-click the block |
| Copy / Paste / Duplicate | {{Ctrl+C}} / {{Ctrl+V}} / {{Ctrl+D}} |
| Rotate / Flip | {{Ctrl+R}} / {{Ctrl+I}} |
| Create subsystem | Select several blocks, then {{Ctrl+G}} |
| Mask | {{Ctrl+M}} (Mask editor) |
| Delete | {{Del}} |
| Undo / Redo | {{Ctrl+Z}} / {{Ctrl+Y}} |
| Zoom / Pan | Wheel / {{Space}}+drag or middle-button drag |
| Fit to view | {{Ctrl+0}} |

Right-clicking a block or line shows a menu with the same actions plus **Show name**, **Log signal** and **Add to floating scope**. The block menu also has **Graph of inputs and outputs** (see Scopes below), and the menu of an empty spot on the canvas has **Convert model to script**.

Hovering over a block on the canvas shows its name, type and description. Hovering over a line shows the signal name and, after a simulation, its value and width.

## Block Parameters

![Block parameters dialog](images/en/model-params.png)

Double-clicking a block opens its parameters dialog. Values are written as **M expressions**, such as `2*pi`, `[1 2 1]` or a workspace variable `K`. Expressions are evaluated in the model workspace and the base workspace when the simulation starts. **Apply** applies the changes while keeping the dialog open, and blocks such as Constant, Slider Gain and Manual Switch can change their values even during a simulation.

## Model Settings and Solvers

**Settings** ({{Ctrl+E}}) on the toolbar opens the Model settings window.

![Model settings: Solver tab](images/en/model-settings.png)

| Tab | Items |
| --- | --- |
| Solver | Start and stop time, type (variable-step / fixed-step), solver, maximum, minimum and initial step, relative and absolute tolerance, Zero-crossing detection |
| Data import/export | Save time (`tout`), output (`yout`) and states (`xout`), signal logging (`logsout`), Single simulation output (`out`), data point limit, decimation |
| Diagnostics | Algebraic loop handling (none · warning · error) |
| Model workspace | Variables used only by this model (names and values) |

| Solver | Type | Use |
| --- | --- | --- |
| `auto` | Automatic | `ode45` if there are continuous states (`ode3` for fixed-step), otherwise `discrete` |
| `ode45`, `ode23`, `ode113`, `ode8` | Variable-step | Nonstiff problems |
| `ode15s`, `ode23s`, `ode23t`, `ode23tb` | Variable-step | Stiff problems |
| `ode1` … `ode5`, `ode14x` | Fixed-step | When a constant interval is needed, as in real time |
| `discrete` | Fixed or variable | Models without continuous states |

When you turn on **Simulation pacing**, only the set amount of simulation time passes per real second, so you can watch the results slowly. The default solver and stop time for simulations are set in Settings › Simulation.

## Running

| Button | Key | Action |
| --- | --- | --- |
| Run | {{Ctrl+T}} | Compile, then simulate up to the stop time |
| Pause / Continue | | Pause and resume |
| Step | | Advance one time step |
| Stop | | Finish and write the results to the workspace |
| Update | {{Ctrl+Shift+D}} | Compile without running: check port widths and sample times |

The run buttons change with the state, and the model toolbar and the ribbon's **Simulation** tab follow the same rule.

| State | Buttons you can press |
| --- | --- |
| Stopped · finished | Run, Step |
| Running | Pause, Stop |
| Paused | Continue (the Run button), Pause (pressed; press again to continue), Step, Stop |
| Compiling | Stop |

The toolbar shows the current simulation time and a progress bar. Errors and warnings appear in the **Diagnostics** list at the bottom; clicking an entry selects the corresponding block. Turn on **Rate colors** to color blocks and lines by sample time.

## Scopes

![Scope window](images/en/model-scope.png)

Double-click a Scope block to open the scope window. Signals are drawn in real time during the simulation.

- **Autoscale**, **Fit data**: fit the axis ranges to the data
- **Follow**: the time axis follows the latest values
- **Cursors**: read times, values and the difference (Δ) with two vertical cursors
- **Legend**, **Overlay**: draw several inputs overlaid on one axis
- Zoom in/out with the wheel, drag to pan

XY Graph shows two signals on the x–y plane, and Display shows the current value as a number inside the block.

Pressing **Run** opens the windows of every Scope · Floating Scope · XY Graph in the model, including the ones inside subsystems and the ones you closed before, up to 8 at a time. Windows of deleted scopes disappear.

### Graph of Inputs and Outputs

Right-click a block › **Graph of inputs and outputs** adds a Floating Scope next to the block, named after it with IO added (for example `Gain IO`). It shows the signals coming into the block (in input port order) and the block's outputs; its window opens and the simulation runs right away.

- Choosing it again on the same block reuses that scope instead of making a new one.
- It is a normal block: it is saved with the model, {{Ctrl+Z}} undoes it, and you delete it when you are done.
- The menu item is greyed out for a block with no incoming lines and no outputs.

## Results in the Workspace

When the simulation finishes (or is stopped), the results are written to the base workspace. If **Single simulation output** is on, they are collected in a single `out`; if it is off, `tout`, `yout`, `logsout` and the variables of To Workspace blocks are created separately.

`yout` holds the signals of the top-level Out blocks (time × port), and `tout` is the time vector. The example below builds a model in code, runs it and plots the results.

## Building Models in Code

```m
new_system('demo');
add_block('Sources/Sine Wave', 'demo/Sine');
add_block('Math Operations/Gain', 'demo/Gain', 'Gain', '2.5');
add_block('Sinks/Scope', 'demo/Scope');
add_block('Sinks/Out', 'demo/Out1');
add_line('demo', 'Sine/1', 'Gain/1');
add_line('demo', 'Gain/1', 'Scope/1');
add_line('demo', 'Gain/1', 'Out1/1');
set_param('demo', 'StopTime', '10', 'Solver', 'ode45');
save_system('demo');
open_system('demo');          % view it in an editor tab
out = sim('demo', 'StopTime', '20');
plot(out.tout, out.yout)      % signals of the Out blocks
```

You can also use `get_param`, `set_param`, `find_system`, `delete_block`, `delete_line`, `replace_block`, `gcs`, `gcb`, `bdroot`, `close_system`, and `SimulationInput` · `parsim` for running several conditions at once. For details, check with commands such as `help add_block`.

## Code View and Converting to a Script

Turn on **Code** on the model toolbar to show the **code view** to the right of the canvas: the current diagram written as M code. Drag the boundary between the canvas and the code view to change its width; the width is remembered. After editing the code, press **Apply** ({{Ctrl+Enter}} / {{F5}}) and the open model's diagram is rebuilt from it ({{Ctrl+Z}} on the diagram undoes it). **Revert** throws the edits away, and **Open as script** opens the code in a script tab. Code cannot be applied during a simulation.

**To script** on the toolbar (or right-click an empty spot on the canvas › **Convert model to script**) writes the model as a stand-alone M script in a new tab. Running that script:

- creates the model, or empties and rebuilds it when it is already loaded;
- sets the model workspace values as variables, so the blocks can read them;
- opens the model at the end.

The code view edits the open model; the converted script is a separate file that builds the model again.

## Models from Equations

**Equations** on the model editor's toolbar opens a window that turns equations into a block diagram. The script editor's **To Model** opens the same window filled with the script (then only **New model** is offered). Type the equations on the left: the diagram they become and its states, inputs and parameters show on the right as you type, and a mistake is reported with its line number. **New model** opens the result in a new tab; **Add to this diagram** puts the blocks below the current diagram (Ctrl+Z undoes it). With the kind on **Auto** the kind is told from the text.

| Kind | Written as | Blocks made |
| --- | --- | --- |
| Differential equations | `x'' = -c*x' - k*x + u`, `x(0) = 1` | Integrators per state; Gain, Constant or Fcn per term; Sum |
| Transfer function | `G = (s + 1)/(s^2 + 2*s + 1)` | Transfer Fcn (Discrete Transfer Fcn with z and `Ts = 0.1`) |
| State space | `A = [0 1; -2 -3]`, `B = [0; 1]`, `C = [1 0]`, `D = 0` | State-Space (discrete with `Ts`) |

- Derivatives: `x'`, `x''`, or `dx/dt`, `d2x/dt2`, `der(x)`. Initial values: `x(0) = …`, `x'(0) = …`.
- A constant definition such as `k = 4` is a **parameter** in the model workspace; one that reads signals, such as `y = 2*x`, is a **signal**. Definitions nothing else reads go to the Scope and Out blocks; without any, the states do.
- Names that are never defined are **inputs**, fed by the block you pick (Step, Sine Wave, Constant or In port); `t` is a Clock.
- Transfer functions can be combined (`C = 2 + 1/s`, `P = 1/(s + 1)`, `L = C*P`): only the last one becomes a block.

### Error Hints

When the equations have a mistake, **How to fix it** appears under the error. When the change is clear, the changed line and a **Fix** button come with it; the button rewrites the equations (**Undo fix** puts them back). Each fix is tried first, and only fixes that make things better are shown.

| Mistake | Hint · fixed equations |
| --- | --- |
| `x'' + c*x' + k*x = u` | The highest derivative alone on the left: `x'' = u - c*x' - k*x` |
| `x'(t) = -x(t)` | Leave out the time argument: `x' = -x` |
| `x' = sn(x)`, `x' = ln(x)` | A similar function: `sin(x)`, `log(x)` |
| `x' = k(x + 1)` | For a product: `k*(x + 1)` |
| `x' = -(x + 1`, `x' = 1,5*x`, `x' == -x`, `×`, `θ` | Close the parenthesis, `1.5`, `=`, `*`, `theta` |
| `x = 3` (x is a state) | An initial value: `x(0) = 3` |
| `xdot = -x`, `G = 1/(S + 1)` | `x' = -x`, a lowercase `s` |
| A z transfer function without `Ts`, `K` missing in `G = K/(s + 1)` | `Ts = 0.1`, `K = 1` added at the top (1 is a placeholder) |
| `B = [0 1]`, `C = [1; 0]`, `D` or `x0` of the wrong size | Turned into a column or row, filled to the right size |

When the equations build but an input looks like a defined name (`kk` next to `k`), **Check** says it may be a typo. Errors of the M functions (`eq2model` and the others) end with the same hint after `Hint:`.

The same in M code, which builds the model and opens it in a tab (`'Open', 'off'` does not open it):

```m
eq2model('spring', {"k = 4; c = 0.5", "x'' = -c*x' - k*x + u", "x(0) = 1"}, 'StopTime', 20);
ode2model('pend', "th'' = -9.81*sin(th)", 'th(0) = 0.5');
tf2model('plant', [1], [1 2 1]);          % or tf2model('plant', tf(1, [1 2 1]))
ss2model('ss1', [0 1; -2 -3], [0; 1], [1 0], 0);
out = sim('spring');
```

## Subsystems and Masks

- Select several blocks and use **Create subsystem** ({{Ctrl+G}}) to group them into a single Subsystem block with In/Out ports. Double-click it to go inside.
- Placing Enable, Trigger or Action Port inside a subsystem makes it a conditionally executed subsystem (together with If and Switch Case).
- Use the **Mask editor** ({{Ctrl+M}}) to give a subsystem its own parameters dialog, description, icon text and initialization code.
