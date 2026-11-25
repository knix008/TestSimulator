# MyCalc 2.0 User Guide

MyCalc is a calculator for arithmetic, number bases, function graphs, currency and unit conversion, and date calculation, all in one window. The version is the 2.0 in the title.

Start the desktop app with `npm start`. In a browser, open `index.html`. Each mode has its own window size, so the window grows or shrinks to fit when you switch tabs.

The buttons at the top are, from the left: Print, User guide, Notepad, Settings, About, Minimize and Close. Below them are the tabs Basic, Scientific, Programmer, Statistics, Graph, Currency, Units and Dates.

## Basic

The result updates as you type. `=` or Enter confirms the calculation, and its value becomes Ans for the next one. You can use the four operations, brackets, the decimal point, sign change, powers `^`, square roots and percent.

`50%` is 0.5. Percent divides the value by 100.

DEG and RAD are the angle units for trigonometric functions. NORM, SCI and ENG show the result in normal, scientific and engineering notation.

The last ten calculations stay in the line under the result, newest first. Press a chip to bring that expression back; its × removes that one line, and the bin at the front clears them all.

MC clears the memory, MR recalls it, and M+ and M− add to or subtract from it. An M shows while the memory holds a value.

## Scientific

Adds trigonometric, inverse trigonometric and hyperbolic functions, logarithms, exponentials, factorial, combinations, permutations, absolute value and rounding to the basic operations. `2nd` switches the keys to their second function.

`log` is the common logarithm and `ln` the natural one. You can put `pi` and `e` in an expression. As in `2^3!`, the factorial is worked out before the power.

## Programmer

Works with whole numbers only. Press HEX, DEC, OCT or BIN to show the same value in that base. Choose a bit width of 64, 32, 16 or 8. DEC shows a signed integer of the chosen width.

Bitwise OR `|`, XOR `^`, AND `&`, shifts and NOT are available. Digit keys that the current base cannot use are switched off.

The keypad has six columns. The four operations sit in the right-hand column; the bitwise operations and shifts are on the left and along the top.

## Graph

Pressing the Graph tab opens the graph window. The calculator window keeps the screen it had before. Everything for graphs is in the graph window. On the left of the toolbar are the 2D/3D buttons, the expression box and the Add button; the x, y and z axis colours and their On/Off buttons are in the right-hand panel. The X, Y and Z on the axis buttons are the axis names, and a button is coloured while its axis is on.

Left of minimize on the title row are the User guide, About, left panel and right panel buttons, in the same place in 2D and 3D.

Type an expression such as `sin(x)` in the box and press Add. In 2D it is a function of `x`; in 3D it is `z` as a function of `x` and `y`. Up to 8 expressions can be drawn.

In 2D, dragging moves the view and the wheel zooms in and out. In 3D, dragging turns the surface and the wheel brings the camera nearer or further. There are zoom in, zoom out and reset buttons as well.

Trigonometric functions in graphs always use radians, whatever DEG/RAD is set to on the calculator.

### Axis range

Set the minimum and maximum of each axis separately under **Axis range** in the right-hand panel: X and Y in 2D, and X, Y and Z in 3D. The minimum and the maximum each have a row with a decrease (−) button, the current value and an increase (+) button. You can also click the value and type a number.

- − and + move only that end, by about a tenth of the axis, to a round value (a multiple of …, 1, 2, 5, 10, …). From -10 to 10 they move by 2.
- The minimum is always smaller than the maximum.
- The range always includes 0: the minimum is 0 or less and the maximum is 0 or more. A button that would take an end past 0 cannot be pressed.
- A typed value that breaks these rules turns the box red, a note under the rows says why, and the range stays as it was. Leaving the box puts back the value being drawn.
- In 2D a range you set is shown exactly as set, without making a unit the same length on both axes. The reset button goes back to equal units.

Dragging or using the wheel on the 2D picture moves the visible range along with it.

### Grid and surfaces

The 3D surface and floor grid carry on past the edges of the picture without a break, while the three axes are drawn only as far as the range. So the end of the z axis is the height where the surface is cut off. The X, Y and Z letters sit at the end of each axis, clear of the tick numbers, all the same size.

In both 2D and 3D, a unit on x, y and z is the same length. The 3D floor grid passes through the origin and has five cells along each side for the range -10 to 10. When you zoom with the wheel the cells grow or shrink with the picture, and once a cell is more than about 2.2 times its first size, or less than its inverse, the grid is divided again in steps of five (…, 0.8, 4, 20, 100, …); the fine lines then become the cell lines. The ticks and numbers on the three axes are redrawn at the same spacing. The range box button on the 3D toolbar draws the range of the graph as a box. The ruler button on the 2D toolbar shows rulers along the top and left of the picture, with the mouse position marked by a red line and its value. The grid lies at z = 0.

A surface is painted in its graph's one colour, and the light changes only its brightness. The colour bar button on the 3D toolbar shows a colour bar on the right and paints the surface by height, from blue (low) to red (high). The bar runs from the lowest to the highest height drawn. Graph colours are chosen so as not to clash with the x, y and z axis colours.

Where a surface leaves the height range it is cut off cleanly at that height, without a lid. For example, `x^2+y^2` rises from the floor and ends in a round rim at the z limit.

In 3D the mouse only turns (drag) and zooms (wheel). The wheel and the zoom buttons make the picture bigger or smaller without changing the axis ranges; only the tick spacing is divided again for the zoom. Change the axis ranges under Axis range in the right-hand panel; the surface is then worked out again for the new range. At first every axis runs from -10 to 10.

The 3D axes are drawn fainter than the surface, and the parts that pass behind or inside it are hidden by it. Axis parts lying on top of the surface stay unbroken.

Resize the graph window by dragging its edges. It does not get smaller than the size at which the toolbar would fold onto two lines. The left-hand panel holds the expressions drawn; the right-hand panel holds the axis colours, the axis ranges and, in 3D, the light. The two panel buttons on the toolbar open and close them. Press a colour square to change a line's colour, and drag the divider between a panel and the picture to change the panel's width. The colour squares in the legend change colours too.

3D has a light. Drag the sun marker to move it (dragging outwards takes it further away), or set it with the direction, height and distance sliders in the right-hand panel. The light button on the toolbar turns it on and off.

### Graph menu

Right-click the 2D or 3D picture to open the graph menu. After clicking the picture, Shift+F10 or the menu key opens it too. Choose with the arrow keys, run with Enter, and close with Esc.

- **Save as image…**: opens the save box, like the export button on the toolbar.
- **Copy image**: puts the picture on the clipboard as a PNG.
- **Print…**: sends the formulas and the graph to the print window.
- **Graph theme**: App theme, Paper, Chalkboard, Blueprint, Sepia, Monochrome, Neon, Ocean, Forest, Solar dark, Pastel or High contrast. A theme changes the paper, text, grid, the three axis colours and the graph colours together. App theme follows the calculator theme chosen in Settings.
- **Background colour**: Theme default, one of 12 swatches, or Custom…. A chosen background colour is used ahead of the theme's paper; Theme default goes back to the theme's paper.
- **Grid, Legend, Ruler (2D), Axis values, Range box and Colour bar (3D)**: switch these on and off, in step with the toolbar buttons.
- **Reset view** and **User guide**.

Like the graph's other settings, the graph theme and background colour are shared by the graph window and the calculator's graph screen.

### Save as image

Saves as PNG, JPG, GIF, WEBP, AVIF, SVG, TIFF or BMP. Choosing a format that can hold a see-through background (PNG, GIF, WEBP, AVIF, SVG or TIFF) shows the **Transparent background** box, so you can choose whether the background is see-through. JPG and BMP are always saved on the graph's background colour.

SVG keeps the lines, shapes and text themselves rather than dots, so it stays sharp at any size. AVIF is written by the desktop app itself; a browser that cannot write AVIF says so.

## Currency

Type an amount and choose the currency to send and the one to receive. Results and rates are shown to three decimal places. The ⇅ button swaps the two currencies.

Rates come from the internet. When the connection drops, the last rates received are used and you are told you are offline. When the connection comes back, or you press refresh, the rates are fetched again.

The copy button at the bottom right of the keypad puts the converted amount on the clipboard.

## Units

Converts twelve kinds: length, area, volume, weight, temperature, speed, time, data, pressure, energy, power and angle. Choose a kind at the top and the two boxes below switch to its units.

The result appears as you type or press keys. The ⇅ button swaps the two units. ± makes the value negative, for temperatures below zero.

The bottom line tells you what one unit is worth. Temperature scales have an offset, so one unit cannot be compared alone; that line shows the value you entered instead.

The copy button at the bottom right of the keypad puts the converted value on the clipboard.

The chosen kind, the two units and the value are kept in this browser or app. Unlike currency, units do not use the internet.

## Dates

The Dates tab works out two things. Difference gives the years, months and days between a start date and an end date, and the total days. Add adds years, months, weeks and days to a start date, or takes them away.

Click a date box to pick a date, or type it. ⇅ swaps start and end. Difference and Add at the top show which calculation is on screen.

In Add, click the years, months, weeks or days box and the keypad edits that box; the years, months, weeks and days keys beside it switch boxes too. ± switches between adding and subtracting. The Today key sets the start date to today. A day the month does not have, such as one month after 31 January, becomes the last day of that month.

The copy button at the bottom right of the keypad puts the current result on the clipboard. The chosen dates and periods are kept in this browser or app.

## Settings

Settings shows 20 dark themes and 20 light themes side by side. You can also pick the background, card, screen, text, number key, operator key and result key colours yourself. The chosen theme is kept in this browser or app. The settings window has no scroll bar; the Defaults and Apply buttons sit side by side at the bottom.

**Formula**, beside Language and Tooltips, is the text size of the graph window's expression box. − and + change it from 8px to 24px; it starts at 10px. A change shows at once in any open graph window, and Defaults puts it back to 10px.

Number layout sets the order of the number keys. `7 8 9` puts 7 8 9, 4 5 6, 1 2 3 from the top; `1 2 3` puts 1 2 3, 4 5 6, 7 8 9 from the top. Either way `0` is at the bottom centre of the number keys. The two pictures show the layout before you choose.

The layout applies to the Basic, Scientific, Programmer, Currency, Units and Dates keypads. The programmer's A–F keys, operators and bit keys keep their places. The Defaults button goes back to `7 8 9`.

Every window looks like the calculator window, with minimize, maximize and close buttons inside the window instead of a title bar. The picture beside each window's name suits that window: a gear for Settings, a line chart for Graph, a printer for Print.

## Notepad

The notepad is a separate window that collects expressions and graph inputs as items. Open it with the Notepad button at the top of the calculator or on the graph window's toolbar. It starts with built-in items: one example for every function the calculator knows, common formulas such as the area of a circle and the quadratic formula, statistics functions, and all the 2D and 3D presets of the graph window.

Items are sorted into Calculation, Statistics, Programmer, 2D graph, 3D graph and Note. The chips at the top show one kind only, and the search box finds expressions or titles.

- **Add**: type an expression or note in the box and press Add or Ctrl+Enter. With the kind left on Automatic, an expression with `x` becomes a 2D graph, one with both `x` and `y` a 3D graph, one that can be worked out a calculation, and anything else a note. The title is optional.
- **Add from other windows**: the Add to notepad buttons beside the calculator and programmer expressions add the current expression. In the graph window, Add to notepad adds the expression in the box, or every expression on the graph when the box is empty. Items already there are not added twice.
- **Use**: an item's first button puts the expression in the calculator's input box, or opens the graph window and draws it in 2D or 3D straight away.
- **Copy and paste**: an item's copy button copies its expression only. Ticked items are copied one per line with Copy selected or Ctrl+C; with nothing ticked, every item shown is copied. The paste button on a row, or Ctrl+V in the list, turns each line on the clipboard into an item. The paste button beside the input box puts the clipboard into the box. Ctrl+C, Ctrl+V and the right-click menu work in the input box as well.
- **Manage**: the pencil button, or double-clicking an expression, edits its kind, title and content. The arrows change the order and the bin deletes. Ticked items are deleted together with Delete selected or the Delete key. Restore built-ins brings back deleted built-in items.

Items are kept in this browser or app, and every open window sees the same list.

## Printing

The print window opens from three places.

- **The Print button at the top of the calculator** prints what is on screen. Basic and Scientific print the expression, result, angle unit, notation, memory and history; Programmer prints the bit width, expression and the HEX, DEC, OCT and BIN values; Statistics prints the count, the summary values and the data; Currency, Units and Dates print the values entered and the results as a table.
- **The Print button in the graph window, or Print… in the graph menu** prints the graph picture with the formulas drawn listed under it, each beside its curve's colour.
- **The Print button in the user guide** prints the whole guide in the language and text size shown.

The left of the print window holds the page setup and the right the preview. However far the settings scroll, the window name and the preview stay put.

- **Printer**: in the desktop app, the installed printers are listed with the default printer already chosen.
- **Page setup**: paper (A4, A3, A5, Letter, Legal, B5), orientation, top, bottom, left and right margins, the page heading with its alignment, font and size, the footer, a margin border and its style, scale, colour or black and white, background, page numbers, the date, and the number of copies.
- **Background**: None (white paper), Light grey, Cream, Light blue, Light green, Black or Custom. The area inside the margins, where a printer can put ink, takes the colour, and the text turns dark or light to read on it. A graph is printed on the see-through copy, with its lines and labels inked to suit.
- **Preview**: redrawn as soon as a setting changes. Content longer than a page carries on over further pages below; tables and lists continue on the next page row by row.
- **Print**: prints straight away on the chosen printer with these settings. The button cannot be pressed until the content to print has arrived. In a browser, the browser's own print box opens.

## User guide

Open this guide with the User guide button at the top of the calculator or from the graph menu. The window takes the colours of the theme chosen in Settings.

- Click an entry in the contents on the left to go to that section; the section you are reading is marked there.
- **한국어 / English**: switches the guide's language. It opens in the program's language.
- **Text size**: − and + change it from 11 to 22. Ctrl+- and Ctrl+= do the same, and Ctrl+0 goes back to 14. The size is kept.
- **Print**: sends the whole guide to the print window. Ctrl+P does the same.

## About

About shows the program's name and version. Close it with the OK button or the × at the top right.

Packages are built from a terminal: `npm run build:web` builds the web site, `npm run build:win` the Windows installer, `npm run build:linux` the Linux packages and `npm run build:macos` the macOS app. Build each desktop package on its own operating system. The list of commands is in README.md.
