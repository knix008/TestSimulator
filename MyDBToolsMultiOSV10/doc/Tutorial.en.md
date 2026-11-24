# DBTools Tutorial

This tutorial walks a first-time user through the main features **in about 30 minutes**: open an
example, add a table and relationships, fix what the normalization analysis finds, export SQL,
use the print window, and finally make a theme of your own.

Menu and button names are written exactly as they appear on screen. If you get stuck, open the
matching chapter of the [User guide](UsersGuide.en.md).

---

## Before you start

- Desktop: start **DBTools**. From source, run `npm start` in the project folder.
- Web: run `npm run web` and open <http://127.0.0.1:5174>.

The **start screen** appears. If it does not, press **Home** at the front of the menu bar.

---

## Step 1 — The start screen

1. The title card shows the name and version, **DBTools v1.0.1**.
2. **Get started** holds New · Open project · Open database · Open workspace.
3. Press **User guide** on the **Help** card. The guide opens in a **window of its own**; its
   **Tutorial** button switches to this document. Leave the guide window beside the app.
4. Watch the **Examples (20)** card draw a picture of each example diagram.
5. In the **Moving background** card at the bottom, press **Snow**, set **Speed** to 200 % and
   **Card opacity** to 60 %. The background speeds up and shows more through the cards. With **Auto
   change** at **Every 15 s** the background changes by itself while the start screen is open.
6. Drag the **⠿** handle of the **Examples** card onto **Get started**, and drag a card's bottom-right
   corner to resize it. **Arrange cards** on the title card puts them back; the title card never moves.

> Result: you know the start screen's cards and can open the guide in its own window.

---

## Step 2 — Open an example

1. Press the **Library** (SQLite) example.
2. The start screen closes and a new tab **Library** shows 7 tables fitted to the window.
3. Click `books` in the **Structure** tab on the right: the table is selected on the canvas and
   its properties appear in **Properties** below.
4. Zoom with the mouse wheel and pan by dragging empty canvas. **Ctrl+0** fits everything again.

> Note: the table header colour is the target database's (SQLite is violet). The key marks the
> primary key, `FK` marks foreign keys.

---

## Step 3 — Add a table and relationships

Let us add **reviews** to the library.

1. **Edit → Add table** (Ctrl+T). A new table appears on the right.
2. **Double-click** it to open the table window (a separate window):
   - Name: `reviews`
   - **Add** three columns: `book_id` (INTEGER, nullable off), `member_id` (INTEGER, nullable
     off), `rating` (INTEGER)
   - Press **OK**.
3. Choose **1:N** in the tool panel and **drag from** `books` **to** `reviews`. The relationship
   `books.id` → `reviews.book_id` appears.
4. Do the same from `members` to `reviews`.
5. Press **Auto-arrange** on the toolbar to tidy the layout.

> Result: a `●` next to the tab name and in the title bar says there are unsaved changes.

---

## Step 4 — Fix the normalization findings

1. Open the **Normalization** tab on the right (or press F5).
2. Turn on **1NF – 3NF** with the chips at the top.
3. Click a finding: its table is selected and the affected columns are highlighted.
4. Follow a suggestion — for example, if `reviews` has no primary key, check in Properties that
   its `id` column (created with the table) is the primary key.
5. Open the **Index advisor** tab and look for suggestions on `reviews.book_id` and
   `reviews.member_id`, with their `CREATE INDEX` statements.

> Result: the count of findings goes down; the analysis is recalculated on every edit.

---

## Step 5 — Save and export SQL

1. **File → Save as** (Ctrl+Shift+S) → `MyLibrary.mdprj`. A completion window shows the path and
   the `●` disappears.
2. Switch the toolbar database drop-down to **PostgreSQL**; the table headers change colour.
3. **File → Export → SQL → PostgreSQL script** writes a `.sql` file.
4. **Image → PNG** in the same menu saves a picture of the diagram.

> Check: the `.sql` file contains `CREATE TABLE` and `ALTER TABLE … FOREIGN KEY` statements.

---

## Step 6 — The print window

1. **File → Print…** (Ctrl+P). A **separate print window** opens; the main window stays usable.
2. Switch between **Diagram / Schema report / Analysis report** and watch the preview follow.
3. Back on **Diagram**, try **Portrait / Landscape** and set the colour to **Current theme colours**.
4. Press **Save as PDF** (a good way to check the result without using paper).
5. Close the print window with the red **✕** at the top right.

> Note: on Windows the desktop edition sends **Print** straight to the chosen printer.

---

## Step 7 — Themes and the canvas backdrop

1. Open the **theme drop-down** on the menu bar and pick **Tokyo Night** in the **Dark** column —
   **the canvas background changes with it**. **Next theme** in the drop-down steps through them.
2. Press **Theme settings…** at the top of the drop-down.
3. Under **Canvas backdrop** choose **Blueprint**. The main window's canvas changes at once; pan
   it and the pattern moves with the diagram.
4. Make a **custom theme**:
   - Press **Start from the current theme**.
   - Name: `My Library`, kind: **Dark**
   - Window background `#101828`, panels `#1d2939`, canvas `#0c111d`, accent `#f79009`,
     text `#f2f4f7`
   - Check the preview, then press **Save as theme**.
5. Open the theme drop-down: `My Library` is in the **Custom themes** group at the bottom.
6. Switch back to the theme you like and close the window.

> Result: custom themes are saved with the settings and are still there next time.

---

## Step 8 — Panels

1. Use the two buttons at the right end of the toolbar to fold and unfold the bottom and right
   panels.
2. A folded panel becomes a slim bar with just its icon and title; click it to open it again.
3. Drag the splitter between the right panel and the canvas to change its width.
4. In the **Output** panel under the canvas, click an entry on **Problems** to jump to its table,
   read what you did on **Log**, and see the schema summary on **Info**.

## Step 9 — Wrapping up

1. Press **Home**. **Recent files** lists `MyLibrary.mdprj` (desktop edition).
2. Set **Show the start screen when the app starts** at the bottom as you prefer.
3. To reopen all your tabs later, use **File → Save workspace** to write a `.mdwsp` file.

Well done. Try another example (Hospital, Bank, Vector Search …) the same way, or use **File →
Open database** to turn a real SQLite file or SQL script into a diagram. All shortcuts are listed
in the [User guide](UsersGuide.en.md#12-keyboard-shortcuts).
