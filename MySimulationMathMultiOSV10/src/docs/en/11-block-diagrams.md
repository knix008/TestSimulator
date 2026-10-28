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

Right-clicking a block or line shows a menu with the same actions plus **Show name**, **Log signal** and **Add to floating scope**.

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

## Subsystems and Masks

- Select several blocks and use **Create subsystem** ({{Ctrl+G}}) to group them into a single Subsystem block with In/Out ports. Double-click it to go inside.
- Placing Enable, Trigger or Action Port inside a subsystem makes it a conditionally executed subsystem (together with If and Switch Case).
- Use the **Mask editor** ({{Ctrl+M}}) to give a subsystem its own parameters dialog, description, icon text and initialization code.
