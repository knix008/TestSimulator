# MySimulator Tutorial

The in-app tutorial (Help › Tutorial, or the 🎓 button on the start page) moves the real screen through every step below. This document shows the same steps with a picture of each.

## Start page

### 1. Welcome

MySimulator brings signal processing, dynamics and control, statistics and machine learning, Monte Carlo and optimisation together in one node pipeline. This tutorial moves the real screen to show the features one by one. Press [Next] on the card at the bottom right, ▶ to play it by itself, or jump to a chapter from the list.

![Welcome](docs/images/tutorial/en/01-welcome.jpg)

### 2. Starting something new

Start from an empty pipeline or from an example of each area (signal cleanup, vibration, PID, regression, clustering, Monte Carlo, optimisation, Python …). You can also open a file or import CSV data.

![Starting something new](docs/images/tutorial/en/02-startNew.jpg)

### 3. Recent files and help

Recently opened pipelines, the user's guide, the tutorial document, the shortcuts and the batch run help are here.

![Recent files and help](docs/images/tutorial/en/03-startRecent.jpg)

### 4. Moving background

Pick one of 20 start page backgrounds — oscilloscope, spectrum, Lorenz attractor, neural network, Monte Carlo π … — and set its speed and transparency.

![Moving background](docs/images/tutorial/en/04-startBackground.jpg)

### 5. Sample gallery

Every sample card shows a preview of the pipeline and its area tags. Click one to open it in a new tab.

![Sample gallery](docs/images/tutorial/en/05-startSamples.jpg)

## Finding your way

### 6. The pipeline view

The middle is the node graph. Data made by the source on the left flows along the links through the filter and the FFT into charts and KPIs. The small chart inside each node previews its last result.

![The pipeline view](docs/images/tutorial/en/06-openSample.jpg)

### 7. The menu bar

File, Edit, View, Node, Analysis, Run, Tools and Help, and the workbench selector on the right.

![The menu bar](docs/images/tutorial/en/07-menubar.jpg)

### 8. Workbenches

Switching the workbench changes the node palette on the left to that area's nodes: signal processing, dynamics and control, statistics and ML, Monte Carlo and optimisation, integration and automation, or all nodes.

![Workbenches](docs/images/tutorial/en/08-workbench.jpg)

### 9. The toolbar

New, open, save, undo; the views (pipeline, dashboard, data, 3D); fit and auto arrange; run, run to selection, stop and auto run; the node library and the report. Language, theme, settings and about at the right end.

![The toolbar](docs/images/tutorial/en/09-toolbar.jpg)

### 10. The pipeline tree

The nodes in execution order with their state (✓ done, ⚠ warnings, ✕ error, ◔ changed). Click one to select it and bring it into view.

![The pipeline tree](docs/images/tutorial/en/10-tree.jpg)

### 11. The property panel

The selected node's name, help, presets, parameters and result values. Column names can be picked from what the upstream node produced.

![The property panel](docs/images/tutorial/en/11-properties.jpg)

### 12. The result panel

The bottom panel shows the selected node's chart, table, values and the run log. Hover over the chart to read values.

![The result panel](docs/images/tutorial/en/12-resultStrip.jpg)

## Building a pipeline

### 13. Adding nodes

Clicking a node in the palette adds it after the selected node, linked automatically. You can also drag it onto the canvas, or double-click empty space to open the node library.

![Adding nodes](docs/images/tutorial/en/13-addNode.jpg)

### 14. Linking

Drag from a node's output port (right) to another node's input port to link them. Drag a linked input port away to move or remove the link. Loops are refused.

![Linking](docs/images/tutorial/en/14-link.jpg)

### 15. Parameters and presets

Edit parameters in the property panel; number fields accept expressions (2*pi, 1e-3). ODE, transfer function, Monte Carlo and optimisation nodes have presets that fill in a typical model at once.

![Parameters and presets](docs/images/tutorial/en/15-params.jpg)

### 16. Node library

All 52 node types by area, searchable, with their help, inputs, parameters and defaults on the right.

![Node library](docs/images/tutorial/en/16-library.jpg)

### 17. Arranging

Drag nodes to move them; drag empty space (hand cursor) to pan, Shift or Ctrl+drag on empty space to select several. The middle and right buttons pan too. Auto arrange lines the nodes up in columns by their order.

![Arranging](docs/images/tutorial/en/17-arrange.jpg)

## Running and results

### 18. Running

▶ Run (F5) computes the whole pipeline, ⏵ Run to selection only the selected nodes and their inputs. The desktop uses the native Rust engine, the web the WebAssembly build — with the same results.

![Running](docs/images/tutorial/en/18-run.jpg)

### 19. Changed nodes

Changing a parameter marks that node and everything after it with ◔. With auto run on, the pipeline runs again after every change.

![Changed nodes](docs/images/tutorial/en/19-stale.jpg)

### 20. Data view

The data view shows the selected node's results in full: the chart, the result values and the table (up to 1000 rows). Export them as CSV or JSON, or copy the table.

![Data view](docs/images/tutorial/en/20-dataView.jpg)

### 21. Errors

A failed node turns red with ✕ and the nodes after it are skipped. The run log tab lists every node's time, warnings and errors.

![Errors](docs/images/tutorial/en/21-errors.jpg)

## Dashboard and report

### 22. Dashboard

The chart and KPI nodes on one screen. A KPI turns to the alarm colour when it leaves its range. A chart node's "dashboard width" sets its size.

![Dashboard](docs/images/tutorial/en/22-dashboard.jpg)

### 23. Report and printing

The report gathers the pipeline, every node's values and charts, warnings and errors. Save it as HTML or print it.

![Report and printing](docs/images/tutorial/en/23-report.jpg)

### 24. 3D trajectory

The 3D view draws three columns as a curve or as points (the Lorenz attractor, phase space, clusters). Drag to orbit, wheel to zoom.

![3D trajectory](docs/images/tutorial/en/24-view3d.jpg)

## Analysis areas

### 25. Signal processing

Analyse measured signals with FFT, PSD, filters (Butterworth, FIR, moving average, median), spectrogram, peaks, correlation and envelope nodes.

![Signal processing](docs/images/tutorial/en/25-areaSignal.jpg)

### 26. Dynamics and control

Write ODEs as equations and design control systems with transfer function responses, Bode plots, PID loops and state-space models. The Bode node gives the margins and Ziegler–Nichols values.

![Dynamics and control](docs/images/tutorial/en/26-areaControl.jpg)

### 27. Statistics and machine learning

Descriptive statistics, histograms, regression, correlation matrices, k-means, PCA and neural network (MLP) nodes. The network reports train/test loss and a prediction map.

![Statistics and machine learning](docs/images/tutorial/en/27-areaMl.jpg)

### 28. Monte Carlo and optimisation

Propagate uncertainty through distributions (sensitivities, reject rates), generate stochastic processes, minimise objectives and fit model formulas to data.

![Monte Carlo and optimisation](docs/images/tutorial/en/28-areaMc.jpg)

### 29. Parameter sweep

A sweep node re-runs the pipeline with another node's parameter set to each value and collects a result. Two parameters give a map.

![Parameter sweep](docs/images/tutorial/en/29-sweep.jpg)

## Automation and integration

### 30. Python and external programs

In the desktop app, Python script nodes and external program nodes bring NumPy, SciPy, PyTorch or a commercial solver's batch mode into the pipeline. You are asked once before they run.

![Python and external programs](docs/images/tutorial/en/30-python.jpg)

### 31. Batch run (CLI)

MySimulator --batch pipeline.mysim --set node.param=value runs without a window and writes CSV, JSON and PNG results — for scripts and CI.

![Batch run (CLI)](docs/images/tutorial/en/31-batch.jpg)

### 32. Files

A pipeline is a .mysim (JSON) file. Dropping CSV, TSV or JSON data onto the window makes a data table node.

![Files](docs/images/tutorial/en/32-files.jpg)

## Customizing

### 33. Themes

The theme button steps to the next theme of the same kind; ▾ opens the list of 20 dark and 20 light themes. You can also make your own.

![Themes](docs/images/tutorial/en/33-theme.jpg)

### 34. Language

The flag button switches between Korean and English: menus, node names, help and samples all follow.

![Language](docs/images/tutorial/en/34-language.jpg)

### 35. Settings

Font, the editor (grid, snapping, previews), colour map, panels, the start page and recent files.

![Settings](docs/images/tutorial/en/35-settings.jpg)

### 36. Done

That's the tutorial! The settings go back and the tutorial tabs close. Run it again any time from the 🏠 start page or the Help menu; the user's guide goes into more detail.

![Done](docs/images/tutorial/en/36-finish.jpg)

