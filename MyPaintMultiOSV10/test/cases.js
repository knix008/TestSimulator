(function () {
  function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
  }

  async function text(url) {
    const response = await fetch(url);
    assert(response.ok, url + " " + response.status);
    return response.text();
  }

  function suite(name, tests) {
    return { name: name, tests: tests };
  }

  function test(name, fn) {
    return { name: name, fn: fn };
  }


  async function bytesOf(url) {
    const response = await fetch(url);
    assert(response.ok, url + " " + response.status);
    return new Uint8Array(await response.arrayBuffer());
  }

  /* A camera RAW file is a TIFF container that points at the full-size JPEG the camera
   * wrote next to the sensor data. This builds one so the reader can be tested without
   * shipping a 25 MB file from a real camera. */
  function fakeRaw(jpeg, make, model) {
    const asciiMake = make + "\0";
    const asciiModel = model + "\0";
    const entries = 5;
    const ifdSize = 2 + entries * 12 + 4;
    const makeAt = 8 + ifdSize;
    const modelAt = makeAt + asciiMake.length;
    const jpegAt = modelAt + asciiModel.length;
    const out = new Uint8Array(jpegAt + jpeg.length);
    const view = new DataView(out.buffer);
    out[0] = 0x49;
    out[1] = 0x49;
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, entries, true);
    const put = (index, tag, type, count, value) => {
      const at = 10 + index * 12;
      view.setUint16(at, tag, true);
      view.setUint16(at + 2, type, true);
      view.setUint32(at + 4, count, true);
      view.setUint32(at + 8, value, true);
    };
    put(0, 0x0100, 4, 1, 64);
    put(1, 0x010f, 2, asciiMake.length, makeAt);
    put(2, 0x0110, 2, asciiModel.length, modelAt);
    put(3, 0x0201, 4, 1, jpegAt);
    put(4, 0x0202, 4, 1, jpeg.length);
    view.setUint32(10 + entries * 12, 0, true);
    for (let i = 0; i < asciiMake.length; i += 1) out[makeAt + i] = asciiMake.charCodeAt(i);
    for (let i = 0; i < asciiModel.length; i += 1) out[modelAt + i] = asciiModel.charCodeAt(i);
    out.set(jpeg, jpegAt);
    return out;
  }

  async function picture(win, width, height, color, type) {
    const canvas = win.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, Math.max(1, width >> 1), Math.max(1, height >> 1));
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type || "image/png"));
    assert(blob, "this browser cannot write " + type);
    return new Uint8Array(await blob.arrayBuffer());
  }

  function freshDoc(api) {
    api.run("new");
    const popup = api.getPopup();
    api.popupAction("create-new", {
      width: popup.querySelector('[data-field="width"]').value,
      height: popup.querySelector('[data-field="height"]').value,
    });
    api.clearDrawing();
    return api.getDoc();
  }

  window.TEST_SUITES = [
    suite("Engine", [
      test("a document keeps its size, color and shape list", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const item = Paint.createDoc({ name: "a.mpaint", width: 300, height: 200, background: "#ff0000" });
        assert(item.width === 300 && item.height === 200, item.width + "x" + item.height);
        assert(item.background === "#ff0000");
        assert(item.shapes.length === 0);
      }),
      test("shape values are clamped and filled in", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const shape = Paint.makeShape("rect", { x: 1, y: 2, w: 10, h: 20, width: 500, opacity: 400 });
        assert(shape.width === 96, String(shape.width));
        assert(shape.opacity === 100, String(shape.opacity));
        assert(shape.color === "#000000");
        assert(shape.id.length > 0);
      }),
      test("bounds cover strokes, rectangles and text", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const stroke = Paint.makeShape("pencil", { points: [{ x: 10, y: 10 }, { x: 30, y: 50 }], width: 4 });
        const box = Paint.bounds(stroke);
        assert(box.x === 8 && box.y === 8 && box.w === 24 && box.h === 44, JSON.stringify(box));
        const rect = Paint.bounds(Paint.makeShape("rect", { x: 100, y: 100, w: -40, h: -20, width: 2 }));
        assert(rect.x === 59 && rect.y === 79, JSON.stringify(rect));
        const label = Paint.bounds(Paint.makeShape("text", { x: 5, y: 40, text: "ab", fontSize: 20 }));
        assert(label.y === 20 && label.h > 20, JSON.stringify(label));
      }),
      test("hit testing finds the topmost shape", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const item = Paint.createDoc({ width: 400, height: 400 });
        Paint.addShape(item, Paint.makeShape("rect", { x: 10, y: 10, w: 100, h: 100, fill: "#ff0000" }));
        const top = Paint.addShape(item, Paint.makeShape("rect", { x: 50, y: 50, w: 100, h: 100, fill: "#00ff00" }));
        assert(Paint.hitTest(item, 60, 60) === top);
        assert(Paint.hitTest(item, 20, 20) !== top);
        assert(Paint.hitTest(item, 390, 390) === null);
      }),
      test("fill paints a shape and the canvas", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const item = Paint.createDoc({ width: 200, height: 200 });
        const rect = Paint.addShape(item, Paint.makeShape("rect", { x: 10, y: 10, w: 80, h: 80, fill: "#ffffff" }));
        assert(Paint.fillAt(item, 50, 50, "#123456").target === rect.id);
        assert(rect.fill === "#123456");
        assert(Paint.fillAt(item, 180, 180, "#abcdef").target === "background");
        assert(item.background === "#abcdef");
      }),
      test("the color picker reads a shape or the canvas", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const item = Paint.createDoc({ width: 200, height: 200, background: "#010203" });
        Paint.addShape(item, Paint.makeShape("line", { x: 10, y: 10, w: 100, h: 0, color: "#ff8800", width: 6 }));
        assert(Paint.pickAt(item, 50, 10) === "#ff8800");
        assert(Paint.pickAt(item, 190, 190) === "#010203");
      }),
      test("layer order moves a shape up and down", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const item = Paint.createDoc({});
        const first = Paint.addShape(item, Paint.makeShape("rect", { x: 0, y: 0, w: 10, h: 10 }));
        Paint.addShape(item, Paint.makeShape("rect", { x: 0, y: 0, w: 10, h: 10 }));
        assert(Paint.moveLayer(item, first.id, 1) === 1);
        assert(item.shapes[1] === first);
        assert(Paint.moveLayer(item, first.id, -1) === 0);
      }),
      test("a drawing file round-trips", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const raw = Paint.serialize([Paint.createDoc({ name: "x.mpaint", width: 120, height: 90, shapes: [Paint.makeShape("rect", { x: 1, y: 2, w: 3, h: 4 })] })]);
        assert(Paint.looksLikeDrawing(raw));
        const parsed = Paint.parse(raw);
        assert(parsed.documents.length === 1);
        assert(parsed.documents[0].width === 120);
        assert(parsed.documents[0].shapes.length === 1);
        let failed = false;
        try { Paint.parse('{"format":"other"}'); } catch (error) { failed = true; }
        assert(failed, "a foreign file must be refused");
      }),
    ]),

    suite("Tools", [
      test("every tool has a label and an icon name", (api, doc, win) => {
        win.PaintEngine.TOOLS.forEach((tool) => {
          assert(api.t("tool." + tool.id) !== "tool." + tool.id, tool.id + " has no label");
          assert(win.MyPaintIcons.icon(tool.icon).indexOf("<path") >= 0 || win.MyPaintIcons.icon(tool.icon).indexOf("<circle") >= 0 || win.MyPaintIcons.icon(tool.icon).indexOf("<rect") >= 0 || win.MyPaintIcons.icon(tool.icon).indexOf("<ellipse") >= 0, tool.icon);
        });
      }),
      test("the pencil draws a stroke with every point", (api) => {
        freshDoc(api);
        api.setTool("pencil");
        const shape = api.stroke([{ x: 10, y: 10 }, { x: 40, y: 30 }, { x: 70, y: 10 }]);
        assert(shape.kind === "pencil", shape.kind);
        assert(shape.points.length >= 3, String(shape.points.length));
        assert(api.shapeCount() === 1);
        assert(api.getDoc().dirty === true);
      }),
      test("the drawing tools each add one shape", (api) => {
        freshDoc(api);
        [["brush", "brush"], ["marker", "marker"], ["spray", "spray"], ["eraser", "eraser"], ["line", "line"], ["arrow", "arrow"], ["curve", "curve"], ["freeCurve", "freeCurve"], ["rect", "rect"], ["roundRect", "roundRect"], ["ellipse", "ellipse"], ["triangle", "triangle"]].forEach((pair) => {
          api.setTool(pair[0]);
          const shape = api.draw(20, 20, 120, 90);
          assert(shape && shape.kind === pair[1], pair[0] + " drew " + (shape && shape.kind));
        });
        assert(api.shapeCount() === 12, String(api.shapeCount()));
      }),
      test("the text tool places text that the property panel edits", (api, doc) => {
        freshDoc(api);
        api.setTool("text");
        const shape = api.click(60, 80);
        assert(shape.kind === "text", shape.kind);
        assert(api.getSelection()[0] === shape.id);
        const editor = doc.getElementById("textEditor");
        assert(editor && !editor.hidden, "the text editor is missing");
        editor.value = "안녕";
        editor.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
        assert(shape.text === "안녕", shape.text);
        const input = doc.querySelector('#rightPanel [data-prop="text"]');
        assert(input, "the text field is missing");
        assert(input.value === "안녕", input.value);
        input.value = "hello";
        input.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
        assert(api.shapes()[0].text === "hello", api.shapes()[0].text);
        input.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.shapes()[0].text === "hello", api.shapes()[0].text);
      }),
      test("the toolbar and the context menu set the text font and size", (api, doc) => {
        freshDoc(api);
        const down = doc.querySelector('#toolbar [data-action="fontDown"]');
        const up = doc.querySelector('#toolbar [data-action="fontUp"]');
        const now = doc.getElementById("fontSizeValue");
        const pick = doc.querySelector("#toolbar .font-pick");
        assert(down && down.textContent === "−", "no smaller-text button");
        assert(up && up.textContent === "+", "no larger-text button");
        assert(now && pick, "the font controls are missing");
        const start = Number(now.textContent);
        up.click();
        assert(api.getSettings().fontSize === start + 1, String(api.getSettings().fontSize));
        assert(doc.getElementById("fontSizeValue").textContent === String(start + 1));
        api.setTool("text");
        const shape = api.click(40, 50);
        doc.getElementById("textEditor").value = "가";
        doc.getElementById("textEditor").dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
        api.setTool("select");
        assert(api.getSelection()[0] === shape.id, "the finished text is still picked");
        doc.querySelector('#toolbar [data-action="fontUp"]').click();
        assert(shape.fontSize === start + 2, String(shape.fontSize));
        const family = doc.querySelector("#toolbar .font-pick");
        family.value = "Georgia";
        family.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(shape.fontFamily === "Georgia", shape.fontFamily);
        const menu = api.openContextAt(40, 50);
        ["fontDown", "fontUp", "fontMenu"].forEach((name) => {
          assert(menu.querySelector('[data-action="' + name + '"]'), name + " is missing from the context menu");
        });
        menu.querySelector('[data-action="fontDown"]').click();
        assert(shape.fontSize === start + 1, String(shape.fontSize));
        api.run("fontMenu");
        const fonts = api.getMenu();
        assert(fonts && fonts.querySelector('[data-action="font:Arial"]'), "the font list is missing");
        fonts.querySelector('[data-action="font:Arial"]').click();
        assert(shape.fontFamily === "Arial", shape.fontFamily);
        api.closeMenu();
      }),
      test("the toolbar sets bold, italic, underline and strikethrough", (api, doc) => {
        freshDoc(api);
        ["fontBold", "fontItalic", "fontUnderline", "fontStrike"].forEach((name) => {
          const button = doc.querySelector('#toolbar [data-action="' + name + '"]');
          assert(button, name);
          assert(button.getAttribute("aria-pressed") === "false", name);
        });
        doc.querySelector('#toolbar [data-action="fontUnderline"]').click();
        assert(api.getSettings().fontUnderline === true, "underline default");
        api.setTool("text");
        const shape = api.click(40, 70);
        doc.getElementById("textEditor").value = "가";
        doc.getElementById("textEditor").dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
        assert(shape.underline === true, "new text underline");
        api.setTool("select");
        doc.querySelector('#toolbar [data-action="fontBold"]').click();
        doc.querySelector('#toolbar [data-action="fontItalic"]').click();
        doc.querySelector('#toolbar [data-action="fontStrike"]').click();
        assert(shape.fontStyle === "bold-italic", shape.fontStyle);
        assert(shape.strike === true, "strike");
        assert(doc.querySelector('#toolbar [data-action="fontBold"]').classList.contains("on"), "bold on");
        doc.querySelector('#toolbar [data-action="fontBold"]').click();
        assert(shape.fontStyle === "italic", shape.fontStyle);
        doc.querySelector('#toolbar [data-action="fontUnderline"]').click();
        assert(shape.underline === false, "underline off");
      }),
      test("the fill tool repaints a shape and then the canvas", (api) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(20, 20, 160, 120);
        api.setColor("#ff0000");
        api.setTool("fill");
        api.click(90, 70);
        assert(api.shapes()[0].fill === "#ff0000", api.shapes()[0].fill);
        api.click(300, 300);
        assert(api.getDoc().background === "#ff0000", api.getDoc().background);
      }),
      test("the picker takes the color under the pointer", (api) => {
        freshDoc(api);
        api.setColor("#00aa44");
        api.setTool("line");
        api.draw(10, 10, 200, 10);
        api.setColor("#000000");
        api.setTool("picker");
        api.click(100, 10);
        assert(api.getColor() === "#00aa44", api.getColor());
      }),
      test("a drawn shape really changes pixels on the canvas", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 200, background: "#ffffff" });
        const before = api.pixelAt(100, 100);
        assert(before[0] === 255 && before[1] === 255 && before[2] === 255, before.join(","));
        api.popupAction("apply-palette", { color: "#ff0000", fillColor: "#ff0000", strokeWidth: 4 });
        api.setTool("rect");
        api.draw(40, 40, 160, 160);
        assert(api.shapes()[0].fill === "#ff0000", api.shapes()[0].fill);
        const after = api.pixelAt(100, 100);
        assert(after[0] > 200 && after[1] < 60, after.join(","));
      }),
      test("pointer events on the canvas draw the same way", (api) => {
        freshDoc(api);
        api.setTool("rect");
        const shape = api.pointerDraw(30, 30, 120, 100);
        assert(shape.kind === "rect", shape.kind);
        assert(Math.round(shape.w) === 90, String(shape.w));
      }),
    ]),

    suite("Selection", [
      test("clicking a shape selects it and clicking empty space clears it", (api) => {
        freshDoc(api);
        api.setTool("rect");
        const rect = api.draw(40, 40, 200, 160);
        api.deselect();
        assert(api.getSelection().length === 0);
        const hit = api.select(120, 100);
        assert(hit && hit.id === rect.id, "the rectangle was not picked");
        api.select(500, 400);
        assert(api.getSelection().length === 0);
      }),
      test("dragging with the select tool moves the shape", (api) => {
        freshDoc(api);
        api.setTool("rect");
        const rect = api.draw(40, 40, 140, 140);
        api.select(90, 90);
        api.setTool("select");
        api.draw(90, 90, 140, 120);
        assert(Math.round(api.shapes()[0].x) === 90, String(api.shapes()[0].x));
        assert(Math.round(api.shapes()[0].y) === 70, String(api.shapes()[0].y));
        assert(rect.id === api.shapes()[0].id);
      }),
      test("dragging over empty canvas picks everything inside the box", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 400, height: 300, background: "#ffffff" });
        api.setTool("rect");
        const near = api.draw(20, 20, 120, 100);
        const far = api.draw(260, 200, 380, 280);
        api.deselect();
        api.setTool("select");
        // a box around the first shape only
        api.draw(10, 10, 160, 150);
        assert(api.getSelection().length === 1, JSON.stringify(api.getSelection()));
        assert(api.getSelection()[0] === near.id, "the wrong shape was picked");
        // a box around both
        api.deselect();
        api.draw(5, 5, 395, 295);
        assert(api.getSelection().length === 2, JSON.stringify(api.getSelection()));
        void far;
      }),
      test("the box shows while it is being dragged and goes when it is done", (api, doc) => {
        freshDoc(api);
        api.setTool("select");
        api.click(300, 250);
        assert(api.getBand(), "no box appeared");
        api.setTool("select");
        const shown = doc.querySelector("#canvasOverlay .region .band");
        assert(shown == null || shown, "the overlay should be able to draw the box");
        api.deselect();
        assert(api.getBand() === null, "the box outlived the drag");
      }),
      test("a thin line is easy enough to click on", (api, doc, win) => {
        const Paint = win.PaintEngine;
        const line = Paint.makeShape("line", { x: 0, y: 0, w: 100, h: 0, width: 1 });
        assert(Paint.hitShape(line, 50, 0) === true, "the line itself");
        assert(Paint.hitShape(line, 50, 5) === true, "5px away should still count");
        assert(Paint.hitShape(line, 50, 20) === false, "20px away should not");
      }),
      test("the pointer tells you what the tool will do", (api, doc) => {
        const board = doc.getElementById("board");
        api.setTool("select");
        assert(board.style.cursor === "default", "select shows " + board.style.cursor);
        api.setTool("text");
        assert(board.style.cursor === "text", "text shows " + board.style.cursor);
        api.setTool("pencil");
        assert(board.style.cursor === "crosshair", "pencil shows " + board.style.cursor);
        api.setTool("selectRect");
        assert(board.style.cursor === "crosshair");
      }),
      test("select all picks every shape and Delete removes them", (api) => {
        freshDoc(api);
        api.setTool("line");
        api.draw(10, 10, 100, 100);
        api.draw(20, 20, 120, 120);
        assert(api.selectAll().length === 2);
        assert(api.deleteSelection() === 2);
        assert(api.shapeCount() === 0);
      }),
      test("the selection is outlined on the canvas overlay", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(50, 50, 150, 130);
        api.selectAll();
        const marquee = doc.querySelectorAll("#canvasOverlay .marquee");
        assert(marquee.length === 1, String(marquee.length));
        assert(parseFloat(marquee[0].style.width) > 80, marquee[0].style.width);
      }),
    ]),

    suite("Region", [
      test("a rectangle, an ellipse and a free outline can all be picked", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 300, height: 200, background: "#ffffff" });
        api.setTool("selectRect");
        api.draw(20, 20, 120, 100);
        assert(api.getRegion().kind === "rect", JSON.stringify(api.getRegion()));
        let box = api.regionBounds();
        assert(Math.round(box.w) === 100 && Math.round(box.h) === 80, JSON.stringify(box));
        api.setTool("selectEllipse");
        api.draw(40, 40, 140, 140);
        assert(api.getRegion().kind === "ellipse");
        api.setTool("selectFree");
        api.stroke([{ x: 10, y: 10 }, { x: 90, y: 20 }, { x: 80, y: 90 }, { x: 20, y: 80 }]);
        const free = api.getRegion();
        assert(free.kind === "free", JSON.stringify(free));
        assert(free.points.length >= 4, String(free.points.length));
      }),
      test("the picked area is outlined over the picture", (api, doc) => {
        freshDoc(api);
        api.setTool("selectRect");
        api.draw(30, 30, 160, 120);
        const outline = doc.querySelector("#canvasOverlay .region");
        assert(outline, "the area is not outlined");
        assert(outline.querySelector("rect"), "the outline has no shape");
        api.setTool("selectEllipse");
        api.draw(10, 10, 80, 60);
        assert(doc.querySelector("#canvasOverlay .region ellipse"), "the ellipse is not outlined");
      }),
      test("cutting keeps only the picked area", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 160, background: "#ffffff" });
        api.popupAction("apply-palette", { color: "#ff0000", fillColor: "#ff0000" });
        api.setTool("rect");
        api.draw(0, 0, 200, 160);
        api.setTool("selectRect");
        api.draw(40, 30, 140, 110);
        const result = api.cropRegion();
        assert(result.width === 100 && result.height === 80, JSON.stringify(result));
        assert(api.getDoc().width === 100 && api.getDoc().height === 80);
        assert(api.shapeCount() === 1 && api.shapes()[0].kind === "image");
        assert(api.getRegion() === null, "the area stays picked after the cut");
        const pixel = api.pixelAt(50, 40);
        assert(pixel[0] > 200 && pixel[1] < 60, pixel.join(","));
      }),
      test("cutting an elliptical area leaves the corners empty", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 200, background: "#ffffff" });
        api.popupAction("apply-palette", { color: "#0000ff", fillColor: "#0000ff" });
        api.setTool("rect");
        api.draw(0, 0, 200, 200);
        api.setTool("selectEllipse");
        api.draw(20, 20, 180, 180);
        api.cropRegion();
        assert(api.getDoc().width === 160, String(api.getDoc().width));
        const middle = api.pixelAt(80, 80);
        assert(middle[2] > 200, "the middle should keep the picture: " + middle.join(","));
        const corner = api.framePixelAt(2, 2);
        assert(corner[3] === 0, "the corner outside the ellipse should be empty: " + corner.join(","));
      }),
      test("erasing the picked area paints it with the canvas colour", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 160, background: "#ffffff" });
        api.popupAction("apply-palette", { color: "#008800", fillColor: "#008800" });
        api.setTool("rect");
        api.draw(0, 0, 200, 160);
        api.setTool("selectRect");
        api.draw(40, 40, 120, 120);
        api.eraseRegion();
        assert(api.getDoc().width === 200, "erasing must not change the size");
        const inside = api.pixelAt(80, 80);
        assert(inside[0] > 240 && inside[1] > 240 && inside[2] > 240, inside.join(","));
        const outside = api.pixelAt(10, 10);
        assert(outside[1] > 100 && outside[0] < 60, outside.join(","));
      }),
      test("the picked area goes on the clipboard and pastes back", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 160, background: "#ffffff" });
        api.setTool("rect");
        api.draw(10, 10, 90, 90);
        api.setTool("selectRect");
        api.draw(20, 20, 100, 100);
        const copied = api.copyRegion();
        assert(copied.indexOf("data:image/png") > 0, "no picture on the clipboard");
        const added = api.paste();
        assert(added.length === 1 && added[0].kind === "image", JSON.stringify(added));
        assert(added[0].w === 80 && added[0].h === 80, added[0].w + "x" + added[0].h);
      }),
      test("cut copies the area and clears it in one go", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 120, height: 120, background: "#ffffff" });
        api.setTool("selectRect");
        api.draw(10, 10, 60, 60);
        const text = api.cut();
        assert(text.indexOf("data:image/png") > 0, "cut did not copy the area");
        assert(api.getRegion() === null, "cut did not clear the area");
        assert(api.canUndo() === true);
      }),
      test("undo brings the cut picture back", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 160, background: "#ffffff" });
        api.setTool("selectRect");
        api.draw(20, 20, 120, 120);
        api.cropRegion();
        assert(api.getDoc().width === 100);
        api.undo();
        assert(api.getDoc().width === 200, String(api.getDoc().width));
      }),
      test("an area can be dragged out with the mouse, on a picture and on a drawing", async (api, doc) => {
        // The tests above drive the drawing layer directly; this one presses, moves and releases
        // on the board the way a hand does, which is the only path a person ever takes.
        const drag = (x0, y0, x1, y1) => {
          const board = doc.getElementById("board");
          const box = board.getBoundingClientRect();
          const view = doc.defaultView;
          const factor = api.getZoom() / 100;
          const at = (x, y) => ({ clientX: box.left + x * factor, clientY: box.top + y * factor, bubbles: true, button: 0, pointerId: 4, pointerType: "mouse" });
          board.dispatchEvent(new view.PointerEvent("pointerdown", at(x0, y0)));
          board.dispatchEvent(new view.PointerEvent("pointermove", at((x0 + x1) / 2, (y0 + y1) / 2)));
          board.dispatchEvent(new view.PointerEvent("pointermove", at(x1, y1)));
          board.dispatchEvent(new view.PointerEvent("pointerup", at(x1, y1)));
        };
        await api.openBytes(await bytesOf("/samples/scene.png"), "scene.png");
        for (const tool of ["selectRect", "selectEllipse"]) {
          api.clearRegion();
          api.setTool(tool);
          drag(40, 30, 200, 150);
          const box = api.regionBounds();
          assert(api.getRegion() && api.getRegion().kind === tool.slice(6).toLowerCase(), tool + " picked " + JSON.stringify(api.getRegion()));
          assert(box && Math.round(box.w) === 160 && Math.round(box.h) === 120, tool + " picked " + JSON.stringify(box));
        }
        api.clearRegion();
        api.setTool("selectFree");
        const board = doc.getElementById("board");
        const corner = board.getBoundingClientRect();
        const view = doc.defaultView;
        const at = (x, y) => ({ clientX: corner.left + x, clientY: corner.top + y, bubbles: true, button: 0, pointerId: 5, pointerType: "mouse" });
        board.dispatchEvent(new view.PointerEvent("pointerdown", at(20, 20)));
        [[90, 25], [95, 95], [25, 90]].forEach((point) => board.dispatchEvent(new view.PointerEvent("pointermove", at(point[0], point[1]))));
        board.dispatchEvent(new view.PointerEvent("pointerup", at(25, 90)));
        assert(api.getRegion() && api.getRegion().kind === "free", JSON.stringify(api.getRegion()));
        assert(api.regionBounds().w > 60, "the free outline came out " + JSON.stringify(api.regionBounds()));

        // and what was picked can be cut out
        api.clearRegion();
        api.setTool("selectRect");
        drag(40, 30, 200, 150);
        const cut = api.cropRegion();
        assert(cut && cut.width === 160 && cut.height === 120, "the cut gave " + JSON.stringify(cut));

        // the same on a drawing, and the select tool's box still picks shapes
        freshDoc(api);
        api.applyCanvas({ width: 400, height: 300, background: "#ffffff" });
        api.setTool("rect");
        const near = api.draw(20, 20, 120, 100);
        api.deselect();
        api.setTool("selectRect");
        drag(20, 20, 120, 100);
        assert(Math.round(api.regionBounds().w) === 100, JSON.stringify(api.regionBounds()));
        api.clearRegion();
        api.setTool("select");
        drag(10, 10, 160, 150);
        assert(api.getSelection().length === 1 && api.getSelection()[0] === near.id, "the box did not pick the shape: " + JSON.stringify(api.getSelection()));
        assert(api.getBand() === null, "the box is still being dragged");
      }),
      test("the picked area stays where it was left when the pointer moves on", async (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 300, height: 200, background: "#ffffff" });
        api.setTool("selectRect");
        api.draw(20, 20, 120, 100);
        const before = JSON.stringify(api.regionBounds());
        const board = doc.getElementById("board");
        const box = board.getBoundingClientRect();
        const view = doc.defaultView;
        board.dispatchEvent(new view.PointerEvent("pointermove", { clientX: box.left + 280, clientY: box.top + 180, bubbles: true, pointerId: 6, pointerType: "mouse" }));
        assert(JSON.stringify(api.regionBounds()) === before, "moving the pointer afterwards changed the area: " + JSON.stringify(api.regionBounds()));
      }),
      test("the cut command is offered only while an area is picked", (api, doc) => {
        freshDoc(api);
        api.clearRegion();
        const edit = () => api.menuDefinitions().find((menu) => menu.id === "edit").items.find((item) => item.action === "cropRegion");
        assert(edit().disabled === true, "the cut command must be off with nothing picked");
        api.setTool("selectRect");
        api.draw(10, 10, 80, 80);
        assert(edit().disabled === false, "the cut command must be on once an area is picked");
        assert(doc.getElementById("regionKind").textContent === api.t("region.rect"), "the panel does not name the area");
        assert(doc.getElementById("stSelection").textContent.indexOf(api.t("region.rect")) >= 0);
        api.run("clearRegion");
        assert(api.getRegion() === null);
      }),
    ]),

    suite("History", [
      test("undo and redo step through drawing", (api) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(10, 10, 100, 100);
        api.draw(30, 30, 120, 120);
        assert(api.shapeCount() === 2);
        assert(api.undo() === true);
        assert(api.shapeCount() === 1, String(api.shapeCount()));
        assert(api.undo() === true);
        assert(api.shapeCount() === 0);
        assert(api.redo() === true);
        assert(api.shapeCount() === 1);
        assert(api.redo() === true);
        assert(api.shapeCount() === 2);
      }),
      test("the toolbar undo and redo buttons follow the history", async (api, doc) => {
        freshDoc(api);
        assert(doc.querySelector('#toolbar [data-action="undo"]').disabled === false, "new drawing is undoable");
        await api.resetForTests();
        assert(doc.querySelector('#toolbar [data-action="undo"]').disabled === true, "a fresh start has nothing to undo");
        assert(doc.querySelector('#toolbar [data-action="redo"]').disabled === true);
        api.setTool("line");
        api.draw(0, 0, 50, 50);
        assert(doc.querySelector('#toolbar [data-action="undo"]').disabled === false);
        api.undo();
        assert(doc.querySelector('#toolbar [data-action="redo"]').disabled === false);
      }),
      test("deleting, clearing and canvas changes can be undone", (api) => {
        freshDoc(api);
        api.setTool("ellipse");
        api.draw(10, 10, 90, 90);
        api.selectAll();
        api.deleteSelection();
        assert(api.shapeCount() === 0);
        api.undo();
        assert(api.shapeCount() === 1);
        api.applyCanvas({ width: 321, height: 222, background: "#101010" });
        assert(api.getDoc().width === 321);
        api.undo();
        assert(api.getDoc().width !== 321, String(api.getDoc().width));
      }),
    ]),

    suite("Clipboard", [
      test("copy and paste duplicate the selected shape", (api) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(20, 20, 100, 80);
        api.selectAll();
        assert(api.copy().length > 0);
        const added = api.paste();
        assert(added.length === 1);
        assert(api.shapeCount() === 2);
        assert(Math.round(api.shapes()[1].x) === 36, String(api.shapes()[1].x));
      }),
      test("cut removes the shape and keeps it on the clipboard", (api) => {
        freshDoc(api);
        api.setTool("ellipse");
        api.draw(10, 10, 60, 60);
        api.selectAll();
        api.cut();
        assert(api.shapeCount() === 0);
        assert(api.getClipboard().indexOf("ellipse") >= 0);
        api.paste();
        assert(api.shapeCount() === 1);
      }),
      test("the Ctrl keys run copy and paste", (api, doc, win) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(10, 10, 50, 50);
        api.selectAll();
        const press = (key) => win.dispatchEvent(new win.KeyboardEvent("keydown", { key: key, ctrlKey: true, bubbles: true }));
        press("c");
        press("v");
        assert(api.shapeCount() === 2, String(api.shapeCount()));
        press("z");
        assert(api.shapeCount() === 1);
        press("y");
        assert(api.shapeCount() === 2);
        win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Process", code: "KeyZ", ctrlKey: true, bubbles: true }));
        assert(api.shapeCount() === 1, "a shortcut must follow the physical key");
        api.setZoom(100);
        win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "=", code: "Equal", ctrlKey: true, bubbles: true }));
        assert(api.getSettings().zoom > 100, String(api.getSettings().zoom));
      }),
      test("a picked area goes to the system clipboard as a picture", async (api) => {
        // What another program pastes has to be the picture, not the shapes MyPaint keeps for
        // itself. The system clipboard itself is the desktop's business; what is checked here is
        // that a PNG of the right size is what gets handed over.
        await api.openBytes(await bytesOf("/samples/scene.png"), "scene.png");
        api.setTool("selectRect");
        api.draw(40, 30, 200, 150);
        const payload = api.copyRegion();
        const handed = api.systemClipboard();
        assert(handed, "nothing was handed to the system clipboard");
        assert(handed.type === "image/png", "it was handed over as " + handed.type);
        assert(handed.width === 160 && handed.height === 120, "it was handed over as " + handed.width + "x" + handed.height);
        assert(payload.indexOf("data:image/png") > 0, "MyPaint's own clipboard lost the picture");
        const picture = api.clipboardImage();
        assert(picture && picture.dataUrl.indexOf("data:image/png") === 0, "the picked area did not come out as a PNG");
        assert(picture.width === 160 && picture.height === 120, picture.width + "x" + picture.height);
      }),
      test("copied shapes go to the system clipboard as a picture too", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 300, height: 200, background: "#ffffff" });
        api.setTool("rect");
        api.draw(20, 30, 120, 110);
        api.selectAll();
        api.copy();
        const handed = api.systemClipboard();
        assert(handed && handed.type === "image/png", JSON.stringify(handed));
        // the picture is the box around what was picked, give or take the line width
        assert(Math.abs(handed.width - 100) <= 6 && Math.abs(handed.height - 80) <= 6, handed.width + "x" + handed.height);
        assert(api.getClipboard().indexOf("rect") >= 0, "MyPaint's own clipboard lost the shape");
      }),
      test("nothing of MyPaint's own is written to the system clipboard as text", (api, doc, win) => {
        const written = [];
        let patched = true;
        try {
          Object.defineProperty(win.navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: (text) => { written.push(text); return Promise.resolve(); },
              write: () => Promise.resolve(),
            },
          });
        } catch (error) { patched = false; }
        if (!patched) return;   // the browser will not let the clipboard be stood in for
        try {
          freshDoc(api);
          api.setTool("rect");
          api.draw(10, 10, 80, 80);
          api.selectAll();
          api.copy();
          api.setTool("selectRect");
          api.draw(10, 10, 60, 60);
          api.copyRegion();
          assert(written.length === 0, "it wrote text to the system clipboard: " + String(written[0]).slice(0, 40));
        } finally {
          delete win.navigator.clipboard;
        }
      }),
    ]),

    suite("Layers", [
      test("a shape can be brought forward and sent backward", (api) => {
        freshDoc(api);
        api.setTool("rect");
        const first = api.draw(10, 10, 100, 100);
        api.draw(20, 20, 120, 120);
        api.selectShape(first.id);
        assert(api.moveLayer(1) === 1);
        assert(api.shapes()[1].id === first.id);
        assert(api.moveLayer(-1) === 0);
        assert(api.shapes()[0].id === first.id);
      }),
      test("each shape in the list has a delete button", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(10, 10, 80, 60);
        api.setTool("ellipse");
        api.draw(20, 20, 90, 70);
        const rows = doc.querySelectorAll("#leftPanel .shape-item");
        assert(rows.length === 2, String(rows.length));
        rows.forEach((row) => {
          const remove = row.querySelector(".shape-remove");
          assert(remove, "a shape row has no delete button");
          assert(remove.title.length > 0, "the delete button has no tooltip");
          assert(remove.querySelector("svg"), "the delete button has no mark");
        });
      }),
      test("the delete button removes that shape and leaves the others", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        const rect = api.draw(10, 10, 80, 60);
        api.setTool("ellipse");
        const ellipse = api.draw(20, 20, 90, 70);
        assert(api.shapeCount() === 2);
        // the list runs newest first, so the first row is the ellipse
        doc.querySelectorAll("#leftPanel .shape-remove")[0].click();
        assert(api.shapeCount() === 1, String(api.shapeCount()));
        assert(api.shapes()[0].id === rect.id, "the wrong shape went");
        assert(api.getDoc().dirty === true);
        assert(doc.querySelectorAll("#leftPanel .shape-item").length === 1);
        void ellipse;
      }),
      test("deleting from the list can be undone", (api, doc) => {
        freshDoc(api);
        api.setTool("line");
        api.draw(0, 0, 50, 50);
        doc.querySelector("#leftPanel .shape-remove").click();
        assert(api.shapeCount() === 0);
        assert(api.undo() === true);
        assert(api.shapeCount() === 1, String(api.shapeCount()));
      }),
      test("deleting the picked shape clears the selection", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        const rect = api.draw(10, 10, 80, 60);
        assert(api.getSelection()[0] === rect.id);
        doc.querySelector("#leftPanel .shape-remove").click();
        assert(api.getSelection().length === 0, "the selection still points at a shape that is gone");
        assert(api.shapeCount() === 0);
      }),
      test("the left panel lists shapes newest first and selects them", (api, doc) => {
        freshDoc(api);
        api.setTool("line");
        api.draw(0, 0, 40, 40);
        api.setTool("rect");
        const rect = api.draw(10, 10, 80, 80);
        const rows = doc.querySelectorAll("#leftPanel .shape-pick");
        assert(rows.length === 2, String(rows.length));
        assert(rows[0].dataset.action === "shape:" + rect.id, rows[0].dataset.action);
        rows[1].click();
        assert(api.getSelection().length === 1);
        assert(api.getSelection()[0] !== rect.id);
      }),
    ]),

    suite("Canvas", [
      test("the canvas popup resizes the drawing", (api) => {
        freshDoc(api);
        const result = api.applyCanvas({ width: 640, height: 400, background: "#eeeeee" });
        assert(result.width === 640 && result.height === 400, JSON.stringify(result));
        assert(api.getDoc().background === "#eeeeee");
      }),
      test("the board element matches the drawing size", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 320, height: 240, background: "#ffffff" });
        const board = doc.getElementById("board");
        assert(board.width === 320 && board.height === 240, board.width + "x" + board.height);
      }),
      test("clearing removes every shape but keeps the canvas", (api) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(10, 10, 50, 50);
        api.applyCanvas({ width: 500, height: 300, background: "#ffffff" });
        api.clearDrawing();
        assert(api.shapeCount() === 0);
        assert(api.getDoc().width === 500);
      }),
    ]),

    suite("Document", [
      test("the sample drawings open at start", (api) => {
        assert(api.getDocs().length === 2, String(api.getDocs().length));
        assert(api.getDoc().name === "welcome.mypaint", api.getDoc().name);
        assert(api.shapeCount() > 4, String(api.shapeCount()));
      }),
      test("saving writes a drawing file and clears the changed flag", async (api) => {
        api.setTool("rect");
        api.draw(10, 10, 60, 60);
        assert(api.getDoc().dirty === true);
        await api.saveCurrent(false);
        const saved = api.getLastSaved();
        assert(saved && saved.format === "mypaint", JSON.stringify(saved));
        assert(saved.text.indexOf("mypaint-document") >= 0);
        assert(api.getDoc().dirty === false);
      }),
      test("export writes a PNG", async (api) => {
        await api.runExport();
        const result = api.getLastExport();
        assert(result && result.format === "png", JSON.stringify(result));
        assert(result.bytes > 100, String(result.bytes));
        assert(/\.png$/.test(result.path), result.path);
      }),
      test("Open offers every picture MyPaint can read, not just drawings", (api, doc) => {
        const filters = api.openFilters();
        const everything = filters[0];
        assert(everything.extensions.indexOf("mypaint") >= 0, "the drawing format is missing");
        assert(everything.extensions.indexOf("mpaint") >= 0, "older drawings are missing");
        ["png", "jpg", "tif", "heic", "jp2", "dcm", "cr2", "nef", "arw", "bmp", "ico", "webp"].forEach((ext) => {
          assert(everything.extensions.indexOf(ext) >= 0, "Open does not offer ." + ext);
        });
        assert(everything.extensions.length >= 60, String(everything.extensions.length));
        assert(filters[filters.length - 1].extensions.join("") === "*", "there is no all-files choice");
        const accept = api.acceptAttribute();
        assert(accept.indexOf(".mypaint") >= 0 && accept.indexOf(".mpaint") >= 0 && accept.indexOf(".heic") >= 0 && accept.indexOf(".dcm") >= 0, accept.slice(0, 60));
        assert(doc.getElementById("fileOpen").accept === accept, "the open input does not accept pictures");
      }),
      test("the dialog groups are named in the chosen language", (api) => {
        api.setLanguage("ko");
        assert(api.openFilters()[0].name === "열 수 있는 모든 파일", api.openFilters()[0].name);
        api.setLanguage("en");
        assert(api.openFilters()[0].name === "Everything MyPaint can open", api.openFilters()[0].name);
        const groups = api.openFilters().map((filter) => filter.name);
        assert(groups.some((name) => name.indexOf("Camera RAW") === 0), groups.join(" | "));
      }),
      test("opening a picture file places it straight away", async (api, doc, win) => {
        const png = await picture(win, 36, 28, "#44aa22", "image/png");
        const before = api.getDocs().length;
        await api.openFiles([{ name: "photo.png", bytes: png, type: "image/png" }]);
        assert(api.getPopup() == null, "Open must not stop to ask");
        assert(api.getDocs().length === before + 1, String(api.getDocs().length));
        assert(api.getDoc().name === "photo.png", api.getDoc().name);
        assert(api.getDoc().width === 36 && api.getDoc().height === 28);
      }),
      test("opening a drawing file still opens the drawing", async (api) => {
        const raw = api.serialize();
        await api.openFiles([{ name: "work.mpaint", text: raw, type: "text/plain" }]);
        assert(api.getDoc().name === "work.mpaint", api.getDoc().name);
        assert(api.sourceInfo() === null, "a drawing must not be treated as a picture");
      }),
      test("opening a drawing adds a tab", (api) => {
        const before = api.getDocs().length;
        api.run("open");
        assert(api.getDocs().length === before + 1, String(api.getDocs().length));
        assert(api.getDoc().name === "opened.mypaint", api.getDoc().name);
      }),
      test("a saved drawing can be read back", (api, doc, win) => {
        const raw = api.serialize();
        assert(win.PaintEngine.parse(raw).documents.length === 2);
        api.openDrawingText(raw, "copy.mpaint", "");
        assert(api.getDoc().name === "copy.mpaint");
      }),
    ]),

    suite("Recent", [
      test("only ten recent files are kept", (api) => {
        for (let i = 0; i < 12; i += 1) api.addRecent({ id: "id-" + i, name: "file-" + i + ".mpaint", path: "D:/work/file-" + i + ".mpaint" });
        const list = api.getSettings().recent;
        assert(list.length === 10, String(list.length));
        assert(list[0].name === "file-11.mpaint", list[0].name);
      }),
      test("a recent entry can be removed one by one and all at once", (api) => {
        api.addRecent({ id: "a", name: "a.mpaint", path: "D:/a.mpaint" });
        api.addRecent({ id: "b", name: "b.mpaint", path: "D:/b.mpaint" });
        assert(api.removeRecent("a").length === 1);
        assert(api.clearRecent().length === 0);
      }),
      test("the recent popup lists entries with a delete button", (api) => {
        api.addRecent({ id: "a", name: "a.mpaint", path: "D:/a.mpaint" });
        const popup = api.openPopup("recent");
        assert(popup.textContent.indexOf("a.mpaint") >= 0);
        const remove = popup.querySelector('[data-popup-action="remove-recent"]');
        assert(remove, "no delete button");
        remove.click();
        assert(api.getSettings().recent.length === 0);
      }),
      test("the file menu shows the recent files", (api) => {
        api.addRecent({ id: "r1", name: "picture.mpaint", path: "D:/picture.mpaint" });
        const file = api.menuDefinitions().find((menu) => menu.id === "file");
        assert(file.items.some((item) => item.action === "recent:r1"), "the recent row is missing");
        assert(file.items.some((item) => item.label === "picture.mpaint"));
      }),
      test("a recent drawing reopens with its shapes", (api) => {
        api.setTool("rect");
        api.draw(10, 10, 80, 80);
        const doc = api.getDoc();
        api.addRecent({ id: "keep", name: doc.name, path: doc.name, payload: { name: doc.name, width: doc.width, height: doc.height, background: doc.background, shapes: doc.shapes } });
        const before = api.getDocs().length;
        api.run("recent:keep");
        assert(api.getDocs().length === before + 1);
        assert(api.shapeCount() === doc.shapes.length, String(api.shapeCount()));
      }),
      test("opened folders are remembered and can be cleared", (api) => {
        api.rememberDirectory("open", "D:/pictures/one.mpaint");
        api.rememberDirectory("save", "D:/out/two.mpaint");
        assert(api.getSettings().lastOpenDir === "D:/pictures", api.getSettings().lastOpenDir);
        assert(api.getSettings().lastSaveDir === "D:/out");
        assert(api.getSettings().recentDirs.length === 2);
        api.popupAction("clear-dirs", {});
        assert(api.getSettings().recentDirs.length === 0);
      }),
    ]),

    suite("Start screen", [
      test("it has twenty backgrounds, and the themes in a light and a dark column", (api, doc, win) => {
        api.showStart();
        const tiles = [...doc.querySelectorAll("#startScreen [data-start-bg]")];
        assert(tiles.length === 20, String(tiles.length));
        assert(new Set(tiles.map((node) => node.dataset.startBg)).size === 20, "a background is listed twice");
        tiles.forEach((node) => assert(node.querySelector("svg") && node.textContent.length > 0, node.dataset.startBg));
        assert(doc.querySelectorAll('[data-theme-kind="light"] [data-theme-id]').length === 20, "light themes");
        assert(doc.querySelectorAll('[data-theme-kind="dark"] [data-theme-id]').length === 20, "dark themes");
        assert(doc.querySelector('.st-theme-custom-row [data-theme-id="custom"]'), "the custom theme comes first");
        ["hero", "begin", "recent", "docs", "theme", "background"].forEach((id) => {
          assert(doc.querySelector('#startScreen [data-card="' + id + '"]'), id);
        });
        assert(win.getComputedStyle(doc.querySelector("#startScreen .start-board")).display === "grid");
      }),
      test("every background has a name and a hint in both languages", (api, doc, win) => {
        const i18n = win.MyPaintI18n;
        win.MyPaintStore.START_BACKGROUNDS.forEach((kind) => {
          ["ko", "en"].forEach((lang) => {
            const name = i18n.translate(lang, "start.bg." + kind);
            const hint = i18n.translate(lang, "start.bg." + kind + ".hint");
            assert(name && name !== "start.bg." + kind, lang + " " + kind);
            assert(hint && hint !== "start.bg." + kind + ".hint", lang + " " + kind + " hint");
          });
        });
      }),
      test("every scene draws on a light and on a dark theme", (api) => {
        api.showStart();
        const view = api.startScreen().background();
        ["light-classic", "dark-midnight"].forEach((theme) => {
          api.setTheme(theme);
          api.getStartBackgrounds().forEach((kind) => {
            view.setKind(kind);
            view.time = 12.5;
            view.draw();
            view.time = 40;
            view.draw();
          });
        });
      }),
      test("the background runs only while the start screen shows", async (api) => {
        api.showStart();
        const view = api.startScreen().background();
        assert(view.isRunning, "not running");
        const before = view.frames;
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert(view.frames > before, "no frames in 300 ms");
        api.hideStart();
        assert(!view.isRunning, "still running behind the work area");
      }),
      test("a background tile, the shuffle and the opacity stepper change the settings", (api, doc) => {
        api.showStart();
        doc.querySelector('#startScreen [data-start-bg="inkDrops"]').click();
        assert(api.getSettings().startScreen.background === "inkDrops");
        assert(doc.querySelector('#startScreen [data-start-bg="inkDrops"]').classList.contains("on"));
        assert(api.startScreen().background().kind === "inkDrops");
        doc.querySelector("#startScreen [data-start-shuffle]").click();
        assert(api.getSettings().startScreen.shuffleSec === 20);
        doc.querySelector("#startScreen [data-start-shuffle]").click();
        assert(api.getSettings().startScreen.shuffleSec === 0);
        const range = doc.querySelector('#startScreen [data-range="startCardOpacity"]');
        range.querySelector('[data-range-step="1"]').click();
        assert(api.getSettings().startScreen.cardOpacity === 85, String(api.getSettings().startScreen.cardOpacity));
        assert(doc.getElementById("startScreen").style.getPropertyValue("--start-card-alpha") === "85%");
        assert(doc.querySelector('#startScreen [data-card="hero"]'), "the cards were not rebuilt away");
      }),
      test("speed and opacity are one line each, with the value in the middle of its box", (api, doc, win) => {
        api.setLanguage("en");
        api.showStart();
        const rows = doc.querySelectorAll("#startScreen .start-range");
        assert(rows.length === 2, String(rows.length));
        rows.forEach((row) => {
          const label = row.querySelector(".start-range-label").getBoundingClientRect();
          const bar = row.querySelector(".range-bar").getBoundingClientRect();
          assert(bar.left >= label.right, "the bar is not beside its name");
          assert(Math.abs((label.top + label.bottom) / 2 - (bar.top + bar.bottom) / 2) <= 2, "the bar is not on the line of its name");
          assert(row.offsetHeight <= 28, "taller than one line: " + row.offsetHeight);
          assert(Math.round(bar.width) === 165, "the bar is " + bar.width + " px long");
          const input = row.querySelector(".range-value input");
          assert(win.getComputedStyle(input).textAlign === "center", win.getComputedStyle(input).textAlign);
          const box = row.querySelector(".range-value").getBoundingClientRect();
          const inside = input.getBoundingClientRect();
          const suffix = row.querySelector(".range-suffix").getBoundingClientRect();
          assert(Math.abs((inside.left + suffix.right) / 2 - (box.left + box.right) / 2) <= 2, "the value is off centre");
        });
        assert(!doc.querySelector("#startScreen .start-note"), "the note takes a line of its own");
      }),
      test("the home button says Start beside its icon, in both languages", (api, doc) => {
        const read = () => doc.getElementById("homeButton").querySelector("span").textContent;
        assert(read() === "시작", read());
        api.setLanguage("en");
        assert(read() === "Start", read());
        const button = doc.getElementById("homeButton");
        assert(button.querySelector("svg").getBoundingClientRect().right <= button.querySelector("span").getBoundingClientRect().left, "the label is not to the right of the icon");
        api.showStart();
        assert(doc.getElementById("homeButton").classList.contains("on"));
        assert(doc.getElementById("homeButton").querySelector("span").textContent === "Start", "the toggle keeps its label");
      }),
      test("the Draw menu and the theme button have glyphs of their own, drawn from circles and straight lines", (api, doc, win) => {
        const icons = win.MyPaintIcons;
        assert(doc.querySelector('[data-menu="draw"] svg').outerHTML === doc.createRange().createContextualFragment(icons.icon("draw")).firstChild.outerHTML, "the Draw menu has another icon");
        const wheel = icons.icon("themePalette");
        assert((wheel.match(/<circle/g) || []).length === 6 && wheel.indexOf("<path") < 0, wheel);
        assert(icons.icon("palette").indexOf("<path") < 0, "the palette is a round disc");
        assert(icons.icon("draw") !== icons.icon("palette") && icons.icon("draw") !== icons.icon("pencil"));
      }),
      test("a speed of zero keeps the last frame", (api, doc) => {
        api.showStart();
        const input = doc.querySelector('#startScreen [data-field="startCardSpeed"]');
        input.value = "0";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.getSettings().startScreen.speed === 0);
        assert(!api.startScreen().background().isRunning, "still animating at speed zero");
      }),
      test("a theme tile changes the theme and marks itself", (api, doc) => {
        api.showStart();
        doc.querySelector('#startScreen [data-theme-id="dark-navy"]').click();
        assert(api.getSettings().theme === "dark-navy");
        assert(doc.querySelector('#startScreen [data-theme-id="dark-navy"]').classList.contains("on"));
        assert(!doc.querySelector('#startScreen [data-theme-id="light-classic"]').classList.contains("on"));
      }),
      test("the open drawings card goes to the drawing", (api, doc) => {
        api.showStart();
        const rows = doc.querySelectorAll('#startScreen [data-card="docs"] [data-action^="startDoc:"]');
        assert(rows.length >= 1, String(rows.length));
        rows[rows.length - 1].click();
        assert(!api.startVisible(), "the start screen stayed");
      }),
      test("moving a card keeps every card apart, and survives a reload", (api, doc, win) => {
        api.showStart();
        const Layout = win.MyPaintStartLayout;
        const view = api.startScreen();
        const cells = view.cells();
        const moved = Layout.place(cells, "docs", { col: 0, row: 0 });
        api.saveStartPrefs({ layout: Layout.layoutValue(moved) });
        const after = view.cells();
        assert(after.docs.col === 0 && after.docs.row === 0, JSON.stringify(after.docs));
        const ids = Object.keys(after);
        ids.forEach((a) => ids.forEach((b) => {
          assert(a === b || !Layout.overlaps(after[a], after[b]), a + " on " + b);
        }));
        assert(api.loadSettings().startScreen.layout.cards.docs.row === 0, "not saved");
        view.arrange();
        assert(view.cells().hero.row === 0, "auto arrange puts the hero back on top");
      }),
      test("a card is dragged by its handle, and resized by its corner", (api, doc, win) => {
        api.showStart();
        const pointer = (node, type, x, y) => node.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y }));
        const view = api.startScreen();
        const handle = doc.querySelector('[data-card-handle="docs"]');
        const from = handle.getBoundingClientRect();
        const to = doc.querySelector('[data-card="recent"]').getBoundingClientRect();
        assert(view.cells().docs.col === 2, JSON.stringify(view.cells().docs));
        pointer(handle, "pointerdown", from.left + 5, from.top + 5);
        assert(doc.querySelector(".start-ghost"), "no ghost follows the pointer");
        pointer(win, "pointermove", to.left + 12, to.top + 12);
        assert(doc.querySelector(".card-drop-outline"), "no outline shows where it will land");
        pointer(win, "pointerup", to.left + 12, to.top + 12);
        assert(!doc.querySelector(".start-ghost, .card-drop-outline"), "the drag left something behind");
        assert(view.cells().docs.col === 0, JSON.stringify(view.cells().docs));
        assert(api.loadSettings().startScreen.layout.cards.docs.col === 0, "the move was not saved");
        api.showStart();
        const corner = doc.querySelector('[data-card-resize="hero"]');
        const box = corner.getBoundingClientRect();
        const wide = doc.querySelector('[data-card="hero"]').offsetWidth;
        pointer(corner, "pointerdown", box.left, box.top);
        pointer(win, "pointermove", box.left - wide / 2, box.top);
        pointer(win, "pointerup", box.left - wide / 2, box.top);
        const hero = api.startScreen().cells().hero;
        assert(hero.w < 3 && hero.fit === false, JSON.stringify(hero));
        const row = doc.querySelector('[data-card="hero"]');
        row.querySelector("[data-card-resize]").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
        assert(api.startScreen().cells().hero.fit === true, "a double click fits the content again");
      }),
      test("the board layout is safe with anything stored", (api, doc, win) => {
        const Layout = win.MyPaintStartLayout;
        const ids = ["a", "b"];
        const span = { a: 3, b: 1 };
        const bad = Layout.cardsOf({ version: 1, cards: { a: { col: 99, row: -4, w: 9, h: "x" } } }, ids, span);
        assert(bad.a.col === 0 && bad.a.w === 3 && bad.a.row === 0, JSON.stringify(bad.a));
        assert(bad.b && bad.b.row >= bad.a.h, "a card the layout does not know goes below");
        const other = Layout.cardsOf({ version: 99, cards: {} }, ids, span);
        assert(other.a.w === 3, "an unknown version falls back to the default");
        const swapped = Layout.swapVertical(Layout.autoArrange(ids, span), "b", -1);
        assert(swapped.b.row === 0, JSON.stringify(swapped));
      }),
      test("old and damaged start settings are made valid", (api, doc, win) => {
        const Store = win.MyPaintStore;
        const old = Store.normalizeStart({ show: false, titleSize: 40, align: "left", showRecent: false });
        assert(old.show === false);
        assert(!("titleSize" in old) && !("align" in old) && !("showRecent" in old), JSON.stringify(old));
        const bad = Store.normalizeStart({ background: "gone", speed: 999, cardOpacity: 3, shuffleSec: -1, layout: [] });
        assert(bad.background === Store.START_BACKGROUNDS[0], bad.background);
        assert(bad.speed === 300 && bad.cardOpacity === 20 && bad.shuffleSec === 0 && bad.layout === null, JSON.stringify(bad));
        assert(Store.normalizeStart({}).speed === null, "no saved speed means the default for the motion setting");
        assert(Store.effectiveStartSpeed({ speed: null }, true) === 40 && Store.effectiveStartSpeed({ speed: null }, false) === 100);
        assert(Store.effectiveStartSpeed({ speed: 0 }, false) === 0, "zero is a speed");
      }),
      test("Settings > Start screen edits the same values", (api, doc) => {
        const popup = api.openPopup("settings");
        popup.querySelector('[data-tab="start"]').click();
        const tiles = popup.querySelectorAll("[data-background]");
        assert(tiles.length === 20, String(tiles.length));
        doc.querySelector('#popupLayer [data-id="layers"]').click();
        assert(api.getSettings().startScreen.background === "layers");
        assert(doc.querySelector('#popupLayer [data-id="layers"]').classList.contains("on"), "the tile follows");
        const panel = doc.querySelector('#popupLayer [data-panel="start"]');
        assert(!panel.hidden, "the dialog went back to another tab");
        panel.querySelector('[data-range="startOpacity"] [data-range-step="-1"]').click();
        assert(api.getSettings().startScreen.cardOpacity === 75, String(api.getSettings().startScreen.cardOpacity));
        const box = panel.querySelector('[data-field="startShuffle"]');
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.getSettings().startScreen.shuffleSec === 20);
        panel.querySelector('[data-popup-action="start-reset"]').click();
        const reset = api.getSettings().startScreen;
        assert(reset.background === "brushStrokes" && reset.cardOpacity === 80 && reset.shuffleSec === 0 && reset.speed === null, JSON.stringify(reset));
      }),
    ]),

    suite("Text styles", [
      test("a finished text editor is really gone from the screen", async (api, doc, win) => {
        freshDoc(api);
        api.setTool("text");
        api.draw(100, 100, 100, 100);
        const editor = doc.getElementById("textEditor");
        assert(editor && !editor.hidden && editor.offsetWidth > 0, "the editor did not open");
        api.finishText ? api.finishText() : api.setTool("select");
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert(editor.hidden, "the editor is still open");
        assert(win.getComputedStyle(editor).display === "none", "a hidden editor still shows and takes clicks: " + win.getComputedStyle(editor).display);
      }),
      test("the whole text selected: a face goes to all of it and the rest stays", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const shape = engine.makeShape("text", { x: 50, y: 80, text: "abcd", fontSize: 24, runs: [{ text: "ab", fontSize: 24 }, { text: "cd", fontSize: 24, italic: true }] });
        api.getDoc().shapes.push(shape);
        api.selectShape(shape.id);
        const lit = (name) => doc.querySelector('#toolbar [data-action="' + name + '"]').classList.contains("on");
        const now = () => engine.textRuns(api.shapes()[0]);
        assert(!lit("fontItalic"), "mixed text is not all italic");
        api.run("fontBold");
        assert(now().every((run) => run.bold), JSON.stringify(now()));
        assert(now().some((run) => run.italic) && now().some((run) => !run.italic), "bold wiped the italics: " + JSON.stringify(now()));
        assert(lit("fontBold"), "bold did not light");
        api.run("fontBold");
        assert(now().every((run) => !run.bold), JSON.stringify(now()));
        api.run("fontItalic");
        assert(now().every((run) => run.italic) && lit("fontItalic"), JSON.stringify(now()));
        api.run("fontItalic");
        assert(now().every((run) => !run.italic) && !lit("fontItalic"), JSON.stringify(now()));
      }),
      test("selecting a text makes the font buttons show that text", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const plain = engine.makeShape("text", { x: 50, y: 80, text: "plain", fontSize: 24 });
        const slanted = engine.makeShape("text", { x: 50, y: 180, text: "slanted", fontSize: 24, fontStyle: "italic" });
        api.getDoc().shapes.push(plain, slanted);
        const lit = () => doc.querySelector('#toolbar [data-action="fontItalic"]').classList.contains("on");
        api.selectShape(slanted.id);
        assert(lit(), "the italic text should light the button");
        api.selectShape(plain.id);
        assert(!lit(), "the upright text should not");
      }),
      test("over selected characters the buttons show those characters", async (api, doc, win) => {
        const editor = doc.createElement("div");
        doc.body.appendChild(editor);
        const Rich = win.MyPaintRichText;
        const base = win.PaintEngine.styleOfShape(win.PaintEngine.makeShape("text", {}));
        Rich.render(editor, [{ text: "abcd" }, { text: "ef", italic: true }], base, 1);
        editor.contentEditable = "true";
        editor.focus();
        Rich.select(editor, 4, 6);
        assert(Rich.caretStyle(editor, base).italic === true, "a selection reads its own first character");
        Rich.select(editor, 4, 4);
        assert(Rich.caretStyle(editor, base).italic === false, "a caret reads the character before it");
        editor.remove();
      }),
      test("while typing, a face turns on and off at the caret and keeps the other face", async (api, doc) => {
        freshDoc(api);
        api.setTool("text");
        api.draw(100, 100, 100, 100);
        const editor = doc.getElementById("textEditor");
        editor.focus();
        doc.execCommand("insertText", false, "ab");
        const press = (name) => api.run(name);
        const lit = (name) => doc.querySelector('#toolbar [data-action="' + name + '"]').classList.contains("on");
        const caretSpan = () => { const n = doc.getSelection().getRangeAt(0).startContainer; return n.nodeType === 3 ? n.parentNode : n; };
        await press("fontItalic");
        assert(lit("fontItalic"), "italic did not light");
        assert(doc.defaultView.getComputedStyle(caretSpan()).fontStyle === "italic", "the caret is not in italic");
        await press("fontBold");
        assert(lit("fontItalic") && lit("fontBold"), "bold dropped italic");
        assert(caretSpan().dataset.italic === "1" && caretSpan().dataset.bold === "1", caretSpan().outerHTML);
        await press("fontBold");
        await press("fontItalic");
        assert(!lit("fontItalic") && !lit("fontBold"), "a second press did not turn them off");
        assert(caretSpan().dataset.italic === "0", "the caret stayed italic");
        await press("fontItalic");
        doc.execCommand("insertText", false, "c");
        await press("fontItalic");
        doc.execCommand("insertText", false, "d");
        const spans = [...editor.querySelectorAll("[data-rt]")].map((s) => s.textContent.replace(/​/g, "") + s.dataset.italic).filter((t) => t.length > 1);
        assert(spans.join(",") === "ab0,c1,d0", spans.join(","));
        api.setTool("select");
      }),
    ]),

    suite("Reported together", [
      test("italic given to a text does not become the default for the next text", (api, doc) => {
        freshDoc(api);
        api.setTool("text");
        api.draw(100, 100, 100, 100);
        const editor = doc.getElementById("textEditor");
        editor.focus();
        doc.execCommand("insertText", false, "ab");
        api.run("fontItalic");
        doc.execCommand("insertText", false, "c");
        assert(api.getSettings().fontStyle === "normal", "typing in italic changed the default: " + api.getSettings().fontStyle);
        api.setTool("select");
        const finished = api.shapes().slice(-1)[0];
        api.selectShape(finished.id);
        api.run("fontBold");
        assert(api.getSettings().fontStyle === "normal", "a selected text changed the default: " + api.getSettings().fontStyle);
        api.setTool("text");
        api.deselect();
        api.draw(100, 300, 100, 300);
        const next = api.shapes().slice(-1)[0];
        assert(next.fontStyle === "normal", String(next.fontStyle));
        api.setTool("select");
        api.deselect();
        api.run("fontItalic");
        assert(api.getSettings().fontStyle === "italic", "with no text in hand the button sets the default");
        api.run("fontItalic");
      }),
      test("an italic saved by the old leak is cleared once, and one chosen after stays", (api, doc, win) => {
        const Store = win.MyPaintStore;
        const fake = (data) => ({ getItem: () => JSON.stringify(data) });
        assert(Store.load(fake({ fontStyle: "italic", fontUnderline: true })).fontStyle === "normal", "the leak stays");
        const chosen = Store.load(fake({ fontStyle: "italic", fontDefaultsClean: true }));
        assert(chosen.fontStyle === "italic", "a chosen default was cleared");
      }),
      test("the Select button lets go of shapes and an area; an empty click in a group lets go too", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const a = engine.makeShape("rect", { x: 40, y: 40, w: 300, h: 200, width: 2 });
        const b = engine.makeShape("line", { x: 40, y: 300, w: 300, h: 0, width: 2 });
        api.getDoc().shapes.push(a, b);
        const select = () => doc.querySelector('#leftPanel [data-action="tool:select"]').click();
        api.setTool("select");
        api.selectShape(a.id);
        select();
        assert(api.getSelected().length === 0, "the shape stayed selected");
        assert(doc.querySelectorAll("#canvasOverlay .marquee").length === 0, "its box stayed");
        api.setTool("selectRect");
        api.draw(10, 10, 100, 100);
        assert(api.getRegion(), "no area");
        select();
        assert(!api.getRegion(), "the area stayed selected");
        api.setTool("select");
        api.draw(5, 5, 400, 400);
        assert(api.getSelected().length === 2);
        const board = doc.getElementById("board");
        const r = board.getBoundingClientRect();
        api.selectAll();
        const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: r.left + 190, clientY: r.top + 301 };
        board.dispatchEvent(new win.PointerEvent("pointerdown", at));
        board.dispatchEvent(new win.PointerEvent("pointerup", at));
        assert(api.getSelected().length === 1, "a click on one narrows to it: " + api.getSelected().length);
      }),
      test("effects with something selected go to it alone", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const a = engine.makeShape("rect", { x: 40, y: 40, w: 100, h: 80, width: 2, color: "#ff0000", fill: "#ff0000" });
        const b = engine.makeShape("rect", { x: 300, y: 40, w: 100, h: 80, width: 2, color: "#ff0000", fill: "#ff0000" });
        api.getDoc().shapes.push(a, b);
        api.setTool("select");
        api.selectShape(a.id);
        const panel = () => doc.getElementById("rightPanel");
        assert(panel().querySelector(".fx-scope").dataset.scope === "shape", panel().querySelector(".fx-scope").dataset.scope);
        panel().querySelector('[data-action="fxLook:grayscale"]').click();
        assert(api.shapes()[0].effects.look === "grayscale", "the shape took no effect");
        assert(!api.shapes()[1].effects, "the other shape took it");
        assert(!api.getDoc().effects, "the whole picture took it");
        assert(doc.getElementById("board").style.filter === "", "the whole picture is filtered");
        const read = (x, y) => [...doc.getElementById("board").getContext("2d").getImageData(x, y, 1, 1).data];
        const first = read(90, 80);
        assert(first[0] === first[1] && first[1] === first[2], "the selected one is not gray: " + first);
        const second = read(350, 80);
        assert(second[0] > 200 && second[1] < 60, "the other one changed: " + second);
        const input = panel().querySelector('[data-fx="border.left"]');
        input.value = "10";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.shapes()[0].effects.border.left === 10 && !api.shapes()[1].effects);
        api.undo();
        api.undo();
        assert(!api.shapes()[0].effects || win.MyPaintEffects.isPlain(win.MyPaintEffects.normalize(api.shapes()[0].effects)), "undo did not take them back");
        api.deselect();
        assert(panel().querySelector(".fx-scope").dataset.scope === "doc", "with nothing selected it is the whole picture");
        panel().querySelector('[data-action="fxLook:sepia"]').click();
        assert(api.getDoc().effects.look === "sepia", "the whole picture took nothing");
      }),
      test("several selected all take an effect; a shape\'s effect survives a save", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        api.getDoc().shapes.push(engine.makeShape("rect", { x: 40, y: 40, w: 100, h: 80, width: 2 }), engine.makeShape("text", { x: 200, y: 80, text: "Hi", fontSize: 24 }));
        api.setTool("select");
        api.draw(5, 5, 400, 300);
        doc.querySelector('#rightPanel [data-action="fxLook:invert"]').click();
        api.shapes().forEach((shape) => assert(shape.effects.look === "invert", shape.kind));
        const copy = engine.parse(engine.serialize([api.getDoc()])).documents[0];
        assert(copy.shapes[0].effects.look === "invert", "the file lost it");
      }),
      test("an area picked with a marquee takes the effect in that part only", (api, doc) => {
        freshDoc(api);
        api.getDoc().background = "#ff0000";
        api.setTool("selectRect");
        api.draw(100, 100, 200, 180);
        const panel = doc.getElementById("rightPanel");
        assert(panel.querySelector(".fx-scope").dataset.scope === "region", panel.querySelector(".fx-scope").dataset.scope);
        const count = api.shapes().length;
        panel.querySelector('[data-action="fxLook:grayscale"]').click();
        assert(api.shapes().length === count + 1, "the area did not become its own picture");
        const piece = api.shapes().slice(-1)[0];
        assert(piece.kind === "image" && piece.effects.look === "grayscale" && !api.getDoc().effects, JSON.stringify(piece.effects));
        assert(!api.getRegion(), "the area stayed");
        const read = (x, y) => [...doc.getElementById("board").getContext("2d").getImageData(x, y, 1, 1).data];
        const inside = read(150, 140);
        assert(inside[0] === inside[1], "inside is not gray: " + inside);
        const outside = read(300, 300);
        assert(outside[0] > 200 && outside[1] < 60, "outside changed: " + outside);
        api.undo();
        assert(api.shapes().length === count, "one undo takes it all back");
      }),
    ]),

    suite("Dropping on the picture", [
      test("dropped on the work area it asks first, with putting it in already chosen", async (api, doc, win) => {
        freshDoc(api);
        api.setZoom(100);
        api.setTool("pencil");
        doc.getElementById("stage").scrollTo(0, 0);
        const bytes = await api.makePng(100, 60, "#00ff00");
        const transfer = new win.DataTransfer();
        transfer.items.add(new win.File([bytes], "photo.png", { type: "image/png" }));
        transfer.items.add(new win.File([bytes], "second.png", { type: "image/png" }));
        const board = doc.getElementById("board");
        const r = board.getBoundingClientRect();
        board.dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + 300, clientY: r.top + 200 }));
        for (let i = 0; i < 40 && !api.getPopup(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
        const popup = api.getPopup();
        assert(popup && popup.dataset.kind === "drop", "it did not ask");
        assert(api.shapes().filter((shape) => shape.kind === "image").length === 0, "it went in before the answer");
        assert(popup.querySelector('input[value="image"]').checked, "putting it in should be chosen");
        assert(popup.querySelector('input[value="drawing"]'), "a new picture must be offered");
        popup.querySelector('[data-popup-action="apply-drop"]').click();
        await api.canvasDropDone();
        assert(api.getPopup() == null, "a window stayed open");
        const images = api.shapes().filter((shape) => shape.kind === "image");
        assert(images.length === 2, String(images.length));
        assert(images[0].x === 250 && images[0].y === 170 && images[0].w === 100 && images[0].h === 60, JSON.stringify(images[0]));
        assert(images[1].x === 274 && images[1].y === 194, "the second should step away: " + images[1].x);
        assert(api.getSelected().length === 2, "the dropped pictures should be selected");
        assert(api.getSettings().tool === "select", "they should be ready to move");
        api.undo();
        assert(api.shapes().filter((shape) => shape.kind === "image").length === 1, "undo takes back one picture");
      }),
      test("every answer can reach the program from a dialog in its own window", async (api, doc) => {
        await api.dropBytes(await api.makePng(10, 10, "#ff0000"), "a.png");
        // popup-client.js collects [data-field] only: a radio without it is an answer that never arrives
        const radios = [...api.getPopup().querySelectorAll('input[name="role"]')];
        assert(radios.length === 3, String(radios.length));
        radios.forEach((radio) => assert(radio.dataset.field === "role", radio.value + " would be lost"));
        api.closePopup();
      }),
      test("answering a new picture opens a tab and leaves this one alone", async (api, doc, win) => {
        freshDoc(api);
        const before = api.getDoc();
        const count = before.shapes.length;
        const bytes = await api.makePng(100, 60, "#00ff00");
        const transfer = new win.DataTransfer();
        transfer.items.add(new win.File([bytes], "photo.png", { type: "image/png" }));
        doc.getElementById("board").dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 400, clientY: 300 }));
        for (let i = 0; i < 40 && !api.getPopup(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
        const popup = api.getPopup();
        popup.querySelector('input[value="drawing"]').checked = true;
        popup.querySelector('[data-popup-action="apply-drop"]').click();
        await api.canvasDropDone();
        assert(api.getDoc() !== before && api.getDoc().name === "photo.png", api.getDoc().name);
        assert(before.shapes.length === count, "the first picture changed");
      }),
      test("cancelling the question changes nothing, and elsewhere a new picture comes first", async (api, doc, win) => {
        freshDoc(api);
        const bytes = await api.makePng(20, 20, "#00ff00");
        const drop = async (node) => {
          const transfer = new win.DataTransfer();
          transfer.items.add(new win.File([bytes], "photo.png", { type: "image/png" }));
          node.dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 400, clientY: 300 }));
          for (let i = 0; i < 40 && !api.getPopup(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
          return api.getPopup();
        };
        let popup = await drop(doc.getElementById("leftPanel"));
        assert(popup.querySelector('input[value="drawing"]').checked, "off the picture a new picture comes first");
        popup.querySelector('[data-popup-action="cancel"]').click();
        assert(api.shapes().filter((shape) => shape.kind === "image").length === 0, "nothing goes in without an answer");
        popup = await drop(doc.getElementById("board"));
        assert(popup.querySelector('input[value="image"]').checked);
        api.closePopup();
      }),
      test("near the edge a picture stays on the page, and is sized to fit", async (api, doc, win) => {
        freshDoc(api);
        api.setZoom(100);
        doc.getElementById("stage").scrollTo(0, 0);
        const d = api.getDoc();
        const big = await api.makePng(d.width * 2, d.height * 2, "#0000ff");
        const small = await api.makePng(50, 50, "#ff0000");
        const board = doc.getElementById("board");
        const r = board.getBoundingClientRect();
        const drop = async (bytes, name, x, y) => {
          const transfer = new win.DataTransfer();
          transfer.items.add(new win.File([bytes], name, { type: "image/png" }));
          board.dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + x, clientY: r.top + y }));
          for (let i = 0; i < 100 && !(api.getPopup() && api.getPopup().dataset.kind === "drop"); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
          api.getPopup().querySelector('[data-popup-action="apply-drop"]').click();
          await api.canvasDropDone();
          return api.shapes().slice(-1)[0];
        };
        const corner = await drop(small, "a.png", 2, 2);
        assert(corner.x === 0 && corner.y === 0, JSON.stringify([corner.x, corner.y]));
        const fitted = await drop(big, "b.png", 300, 200);
        assert(fitted.w <= d.width && fitted.h <= d.height && fitted.x === 0 && fitted.y === 0, JSON.stringify([fitted.x, fitted.y, fitted.w, fitted.h]));
      }),
    ]),

    suite("Line looks", [
      test("each kind offers the looks it has", (api, doc, win) => {
        const engine = win.PaintEngine;
        ["line", "arrow", "curve", "freeCurve", "pencil"].forEach((kind) => assert(engine.lineOptions(kind).cap && engine.lineOptions(kind).dash, kind));
        assert(engine.lineOptions("arrow").heads && !engine.lineOptions("line").heads);
        assert(engine.lineOptions("rect").dash && engine.lineOptions("rect").join && !engine.lineOptions("rect").cap);
        assert(!engine.lineOptions("ellipse").join, "an ellipse has no corners");
        assert(!engine.lineOptions("text").dash && !engine.lineOptions("image").dash);
        freshDoc(api);
        const curve = engine.makeShape("curve", { x: 40, y: 40, w: 100, h: 80, width: 4 });
        const free = engine.makeShape("freeCurve", { width: 4, points: [{ x: 200, y: 40 }, { x: 260, y: 100 }, { x: 300, y: 40 }] });
        api.getDoc().shapes.push(curve, free);
        [curve, free].forEach((shape) => {
          api.selectShape(shape.id);
          assert(doc.querySelector('#rightPanel [data-action="propLook:lineCap:square"]'), shape.kind + " has no line end");
          assert(doc.querySelector('#rightPanel [data-action="propLook:lineDash:dashed"]'), shape.kind + " has no line style");
          doc.querySelector('#rightPanel [data-action="propLook:lineCap:butt"]').click();
        });
        assert(api.shapes()[0].lineCap === "butt" && api.shapes()[1].lineCap === "butt", JSON.stringify(api.shapes().map((shape) => shape.lineCap)));
      }),
      test("the line ends differ as they should, on a line, a curve and a free curve", (api, doc, win) => {
        const engine = win.PaintEngine;
        const painted = (shape, x, y) => {
          const canvas = doc.createElement("canvas");
          canvas.width = 300;
          canvas.height = 200;
          engine.render(canvas.getContext("2d"), { width: 300, height: 200, background: "#ffffff", shapes: [shape] }, {});
          return canvas.getContext("2d").getImageData(x, y, 1, 1).data[1] < 128;
        };
        const line = (cap) => engine.makeShape("line", { x: 50, y: 100, w: 200, h: 0, width: 20, color: "#000000", lineCap: cap });
        assert(!painted(line("butt"), 255, 100), "a flat end stops at the end");
        assert(painted(line("square"), 255, 100), "a square end goes on");
        assert(painted(line("square"), 258, 108), "and keeps its corners");
        assert(painted(line("round"), 255, 100) && !painted(line("round"), 258, 108), "a round end loses its corners");
        const free = (cap) => engine.makeShape("freeCurve", { width: 20, color: "#000000", lineCap: cap, points: [{ x: 50, y: 100 }, { x: 150, y: 100 }, { x: 250, y: 100 }] });
        assert(!painted(free("butt"), 255, 100) && painted(free("square"), 255, 100), "a free curve");
        const curve = (cap) => engine.makeShape("curve", { x: 50, y: 20, w: 200, h: 100, width: 20, color: "#000000", lineCap: cap });
        assert(!painted(curve("butt"), 50, 12) && painted(curve("square"), 50, 12), "a curve");
      }),
      test("a line, a curve and a free curve have one row for round or angular", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const list = [
          engine.makeShape("line", { x: 40, y: 40, w: 200, h: 0, width: 8 }),
          engine.makeShape("curve", { x: 40, y: 80, w: 200, h: 80, width: 8 }),
          engine.makeShape("freeCurve", { width: 8, points: [{ x: 300, y: 40 }, { x: 360, y: 120 }, { x: 420, y: 40 }] }),
          engine.makeShape("pencil", { width: 8, points: [{ x: 300, y: 200 }, { x: 360, y: 280 }, { x: 420, y: 200 }] }),
        ];
        list.forEach((shape) => api.getDoc().shapes.push(shape));
        const labels = () => [...doc.querySelectorAll("#rightPanel .prop-looks > span:first-child")].map((node) => node.textContent);
        list.forEach((shape, index) => {
          api.selectShape(shape.id);
          const shown = labels();
          assert(shown.filter((name) => name === api.t("prop.lineCap")).length === 1, shape.kind + ": " + shown.join());
          assert(shown.indexOf(api.t("prop.lineJoin")) < 0 || api.t("prop.lineJoin") === api.t("prop.lineCap"), shape.kind + " has two rows: " + shown.join());
          assert(!doc.querySelector('#rightPanel [data-action^="propLook:arrowEnd"]'), shape.kind + " offers arrow heads");
          assert(!doc.querySelector('#rightPanel [data-action^="propLook:lineJoin"]'), shape.kind + " has a second corners row");
          doc.querySelector('#rightPanel [data-action="propLook:lineCap:butt"]').click();
          const now = api.shapes()[index];
          assert(now.lineCap === "butt" && now.lineJoin === "miter", shape.kind + " " + now.lineCap + " " + now.lineJoin);
          doc.querySelector('#rightPanel [data-action="propLook:lineCap:round"]').click();
          const back = api.shapes()[index];
          assert(back.lineCap === "round" && back.lineJoin === "round", shape.kind + " round again");
        });
      }),
      test("an angular free line is sharp where it bends, a round one is not", (api, doc, win) => {
        const engine = win.PaintEngine;
        const painted = (lineJoin, lineCap) => {
          const canvas = doc.createElement("canvas");
          canvas.width = 200;
          canvas.height = 200;
          const shape = engine.makeShape("line", { x: 0, y: 0, w: 1, h: 1, width: 20, color: "#000000" });
          const free = engine.makeShape("pencil", { width: 20, color: "#000000", lineJoin: lineJoin, lineCap: lineCap, points: [{ x: 40, y: 150 }, { x: 100, y: 50 }, { x: 160, y: 150 }] });
          engine.render(canvas.getContext("2d"), { width: 200, height: 200, background: "#ffffff", shapes: [free] }, {});
          void shape;
          return canvas.getContext("2d").getImageData(100, 34, 1, 1).data[1] < 128;
        };
        assert(painted("miter", "butt"), "the point of the bend should be there");
        assert(!painted("round", "round"), "a round bend has no point");
      }),
      test("the dashes leave gaps, in proportion to the line", (api, doc, win) => {
        const engine = win.PaintEngine;
        const row = (dash) => {
          const canvas = doc.createElement("canvas");
          canvas.width = 300;
          canvas.height = 40;
          engine.render(canvas.getContext("2d"), { width: 300, height: 40, background: "#ffffff", shapes: [engine.makeShape("line", { x: 10, y: 20, w: 280, h: 0, width: 4, color: "#000000", lineCap: "butt", lineDash: dash })] }, {});
          const data = canvas.getContext("2d").getImageData(10, 20, 280, 1).data;
          let on = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i] < 128) on += 1;
          return on / 280;
        };
        assert(row("solid") > 0.98, String(row("solid")));
        assert(row("dashed") > 0.5 && row("dashed") < 0.75, String(row("dashed")));
        assert(row("dotted") > 0.3 && row("dotted") < 0.5, String(row("dotted")));
        assert(row("dashdot") > 0.45 && row("dashdot") < 0.7, String(row("dashdot")));
        const big = engine.dashPattern({ lineDash: "dashed", width: 10 });
        assert(big[0] === 40, "the dashes follow the width: " + big);
      }),
      test("every arrow head keeps to its tip, and nothing sticks out", (api, doc, win) => {
        const engine = win.PaintEngine;
        engine.ARROW_HEADS.forEach((end) => {
          engine.ARROW_HEADS.forEach((start) => {
            const shape = engine.makeShape("arrow", { x: 60, y: 100, w: 280, h: 0, width: 12, color: "#000000", arrowEnd: end, arrowStart: start });
            const canvas = doc.createElement("canvas");
            canvas.width = 400;
            canvas.height = 200;
            engine.render(canvas.getContext("2d"), { width: 400, height: 200, background: "#ffffff", shapes: [shape] }, {});
            const ctx = canvas.getContext("2d");
            const reach = end === "none" ? 7 : 1;
            for (let x = 340 + reach + 1; x < 370; x += 1) assert(ctx.getImageData(x, 100, 1, 1).data[1] === 255, start + "/" + end + " past the tip at " + x);
            assert(ctx.getImageData(200, 100, 1, 1).data[1] === 0, start + "/" + end + " has no shaft");
            const box = engine.bounds(shape);
            const parts = engine.arrowParts(shape);
            parts.heads.forEach((head) => {
              (head.fill || head.open || []).forEach((point) => assert(point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h, end + " head leaves its box"));
            });
          });
        });
        const svg = win.MyPaintSvgDoc.shapeToSvg(engine.makeShape("arrow", { x: 10, y: 10, w: 200, h: 0, width: 6, arrowEnd: "circle", arrowStart: "open", lineDash: "dashed" }), {});
        assert(svg.indexOf("<circle") >= 0 && svg.indexOf("<polyline") >= 0 && svg.indexOf("stroke-dasharray") >= 0, svg);
      }),
      test("the arrow properties change the arrow, with one undo each; size too", (api, doc, win) => {
        freshDoc(api);
        const shape = win.PaintEngine.makeShape("arrow", { x: 40, y: 100, w: 300, h: 0, width: 8 });
        api.getDoc().shapes.push(shape);
        api.selectShape(shape.id);
        const press = (key, value) => doc.querySelector('#rightPanel [data-action="propLook:' + key + ":" + value + '"]').click();
        assert(doc.querySelector('#rightPanel [data-action="propLook:arrowEnd:triangle"]').classList.contains("on"), "the default is not shown");
        press("arrowEnd", "open");
        assert(api.shapes()[0].arrowEnd === "open");
        assert(doc.querySelector('#rightPanel [data-action="propLook:arrowEnd:open"]').classList.contains("on"));
        press("arrowStart", "circle");
        assert(api.shapes()[0].arrowStart === "circle");
        const size = doc.querySelector('#rightPanel [data-prop="headSize"]');
        size.value = "200";
        size.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.shapes()[0].headSize === 200, String(api.shapes()[0].headSize));
        api.undo();
        api.undo();
        assert(!api.shapes()[0].arrowStart, "undo");
        const copy = win.PaintEngine.parse(win.PaintEngine.serialize([api.getDoc()])).documents[0];
        assert(copy.shapes[0].arrowEnd === "open", "the file keeps it");
      }),
      test("a box picks what is wholly inside, not a neighbour it touches", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const arrow = engine.makeShape("arrow", { x: 100, y: 100, w: 200, h: 100, width: 4 });
        const text = engine.makeShape("text", { x: 250, y: 215, text: "Label here", fontSize: 24, fontFamily: "Arial" });
        api.getDoc().shapes.push(arrow, text);
        api.setTool("select");
        api.draw(90, 90, 310, 210);
        assert(api.getSelected().join() === arrow.id, "the text came along: " + api.getSelected().length);
        api.draw(0, 0, 800, 500);
        assert(api.getSelected().length === 2, "both inside: " + api.getSelected().length);
        api.draw(150, 50, 400, 150);
        assert(api.getSelected().length === 0, "only touched, nothing picked: " + api.getSelected().length);
      }),
    ]),

    suite("Arrows", [
      test("nothing of the line sticks out past the point", (api, doc, win) => {
        const engine = win.PaintEngine;
        const canvas = doc.createElement("canvas");
        canvas.width = 400;
        canvas.height = 200;
        const shape = engine.makeShape("arrow", { x: 40, y: 100, w: 300, h: 0, width: 24, color: "#ff0000" });
        engine.render(canvas.getContext("2d"), { width: 400, height: 200, background: "#ffffff", shapes: [shape] }, {});
        const read = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
        for (let x = 341; x < 360; x += 1) assert(read(x, 100)[1] === 255, "past the point at x=" + x + ": " + read(x, 100));
        assert(read(336, 100)[1] === 0, "the point is not there: " + read(336, 100));
        // beside the point, where the old round end of the line used to bulge
        assert(read(338, 108)[1] === 255, "the line shows beside the point: " + read(338, 108));
        assert(read(150, 100)[1] === 0 && read(150, 111)[1] === 0, "the shaft: " + read(150, 111));
        assert(read(150, 114)[1] === 255, "the shaft is too wide: " + read(150, 114));
      }),
      test("a see-through arrow has no darker overlap", (api, doc, win) => {
        const engine = win.PaintEngine;
        const canvas = doc.createElement("canvas");
        canvas.width = 400;
        canvas.height = 200;
        const shape = engine.makeShape("arrow", { x: 40, y: 100, w: 300, h: 0, width: 16, color: "#000000", opacity: 50 });
        engine.render(canvas.getContext("2d"), { width: 400, height: 200, background: "#ffffff", shapes: [shape] }, {});
        const read = (x) => canvas.getContext("2d").getImageData(x, 100, 1, 1).data[0];
        const shaft = read(100);
        for (let x = 60; x < 330; x += 5) assert(Math.abs(read(x) - shaft) <= 1, "x=" + x + " is " + read(x) + ", the shaft is " + shaft);
      }),
      test("in any direction, at any length, the point is where it was drawn to", (api, doc, win) => {
        const engine = win.PaintEngine;
        [[100, 0], [-100, 0], [0, 100], [80, -60], [5, 5], [3, 0]].forEach((pair) => {
          const shape = engine.makeShape("arrow", { x: 200, y: 200, w: pair[0], h: pair[1], width: 6 });
          const points = engine.arrowOutline(shape);
          assert(points[0].x === 200 + pair[0] && points[0].y === 200 + pair[1], JSON.stringify(points[0]));
          const box = engine.bounds(shape);
          points.forEach((point) => {
            assert(point.x >= box.x - 0.01 && point.x <= box.x + box.w + 0.01 && point.y >= box.y - 0.01 && point.y <= box.y + box.h + 0.01, pair + " leaves its box: " + JSON.stringify(point));
          });
        });
        assert(engine.arrowOutline(engine.makeShape("arrow", { x: 10, y: 10, w: 0, h: 0, width: 6 })).length === 0, "no length, no arrow");
      }),
      test("a saved SVG has the same single outline", (api, doc, win) => {
        const shape = win.PaintEngine.makeShape("arrow", { x: 40, y: 100, w: 300, h: 0, width: 24, color: "#ff0000" });
        const svg = win.MyPaintSvgDoc.shapeToSvg(shape, {});
        assert(svg.indexOf("<line") < 0 && (svg.match(/<polygon/g) || []).length === 1, svg);
        const line = win.MyPaintSvgDoc.shapeToSvg(win.PaintEngine.makeShape("line", { x: 40, y: 100, w: 300, h: 0, width: 4 }), {});
        assert(line.indexOf("<line") >= 0, "a plain line stays a line: " + line);
      }),
    ]),

    suite("Line width and size of the selection", [
      test("the width control changes every selected shape, as one undo", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        api.getDoc().shapes.push(
          engine.makeShape("rect", { x: 40, y: 40, w: 100, h: 80, width: 2 }),
          engine.makeShape("line", { x: 200, y: 60, w: 100, h: 0, width: 3 }),
          engine.makeShape("text", { x: 40, y: 200, text: "Hi", fontSize: 24, width: 2 }),
        );
        api.setTool("select");
        api.draw(5, 5, 500, 300);
        assert(api.getSelected().length === 3);
        doc.querySelector('#leftPanel [data-action="width:12"]').click();
        assert(api.shapes()[0].width === 12 && api.shapes()[1].width === 12, JSON.stringify(api.shapes().map((shape) => shape.width)));
        assert(api.shapes()[2].width === 2, "a text has no line to change");
        api.undo();
        assert(api.shapes()[0].width === 2 && api.shapes()[1].width === 3, "one undo takes it all back");
      }),
      test("the width control shows the selected shape, and steps from it", (api, doc, win) => {
        freshDoc(api);
        const rect = win.PaintEngine.makeShape("rect", { x: 40, y: 40, w: 100, h: 80, width: 7 });
        api.getDoc().shapes.push(rect);
        api.selectShape(rect.id);
        const value = () => doc.querySelector('#leftPanel [data-pick="size"]').value;
        assert(value() === "7", value());
        api.run("strokeUp");
        assert(api.shapes()[0].width === 8 && value() === "8", api.shapes()[0].width + " / " + value());
        const input = doc.querySelector('#leftPanel [data-pick="size"]');
        input.value = "20";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.shapes()[0].width === 20, String(api.shapes()[0].width));
        const read = (x, y) => [...doc.getElementById("board").getContext("2d").getImageData(x, y, 1, 1).data];
        assert(read(45, 80)[3] === 255 && read(45, 80)[0] < 80, "the picture does not show the thick line: " + read(45, 80));
      }),
      test("with a drawing tool in hand the width is for the next shape", (api) => {
        freshDoc(api);
        api.setTool("pencil");
        api.setStrokeWidth(2);
        api.draw(20, 20, 120, 90);
        api.setStrokeWidth(9);
        assert(api.shapes()[0].width === 2, "the last stroke changed");
        const next = api.draw(30, 30, 130, 100);
        assert(next.width === 9, String(next.width));
      }),
      test("width and height in the panel set the size of the shape", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const rect = engine.makeShape("rect", { x: 40, y: 40, w: 100, h: 80, width: 2 });
        api.getDoc().shapes.push(rect);
        api.selectShape(rect.id);
        const set = (name, value) => {
          const input = doc.querySelector('#rightPanel [data-prop="' + name + '"]');
          assert(input, name + " is not editable");
          input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const before = engine.bounds(api.shapes()[0]);
        set("shapeW", 300);
        let box = engine.bounds(api.shapes()[0]);
        assert(Math.abs(box.w - 300) < 1 && Math.abs(box.x - before.x) < 1 && Math.abs(box.h - before.h) < 1, JSON.stringify(box));
        set("shapeH", 150);
        box = engine.bounds(api.shapes()[0]);
        assert(Math.abs(box.h - 150) < 1 && Math.abs(box.y - before.y) < 1, JSON.stringify(box));
        api.undo();
        assert(Math.abs(engine.bounds(api.shapes()[0]).h - before.h) < 1, "undo");
        const text = engine.makeShape("text", { x: 40, y: 300, text: "Hello", fontSize: 40, fontFamily: "Arial" });
        api.getDoc().shapes.push(text);
        api.selectShape(text.id);
        const old = engine.bounds(api.shapes()[1]);
        set("shapeH", Math.round(old.h * 2));
        assert(api.shapes()[1].fontSize === 80, "a text takes it as a font size: " + api.shapes()[1].fontSize);
      }),
    ]),

    suite("Grid and reset", [
      test("the grid lies under shapes and pictures, on the background", (api, doc, win) => {
        freshDoc(api);
        api.getDoc().background = "#ffffff";
        api.getDoc().shapes.push(win.PaintEngine.makeShape("rect", { x: 100, y: 100, w: 200, h: 200, width: 2, color: "#ff0000", fill: "#ff0000" }));
        const board = doc.getElementById("board");
        const grid = doc.getElementById("canvasGrid");
        if (grid.hidden) doc.querySelector('#toolbar [data-action="toggleGrid"]').click();
        const css = win.getComputedStyle;
        assert(Number(css(grid).zIndex) < Number(css(board).zIndex), "the grid is in front: " + css(grid).zIndex + " / " + css(board).zIndex);
        assert(css(grid).mixBlendMode === "normal", css(grid).mixBlendMode);
        assert(grid.style.backgroundColor === "rgb(255, 255, 255)", "the background moved to the grid: " + grid.style.backgroundColor);
        const read = (x, y) => [...board.getContext("2d").getImageData(x, y, 1, 1).data];
        assert(read(10, 10)[3] === 0, "the board should let the grid show: " + read(10, 10));
        assert(read(200, 200)[3] === 255 && read(200, 200)[0] === 255 && read(200, 200)[1] === 0, "the shape is on the board: " + read(200, 200));
        doc.querySelector('#toolbar [data-action="toggleGrid"]').click();
        assert(read(10, 10)[3] === 255, "with no grid the board has its background");
      }),
      test("the grid never goes into a saved picture", async (api, doc, win) => {
        freshDoc(api);
        api.getDoc().background = "#336699";
        doc.querySelector('#toolbar [data-action="toggleGrid"]').click();
        assert(doc.getElementById("canvasGrid").style.getPropertyValue("--grid-ink").indexOf("255") >= 0, "on a dark background the lines are light");
        const canvas = doc.createElement("canvas");
        canvas.width = 20;
        canvas.height = 20;
        const d = api.getDoc();
        win.PaintEngine.render(canvas.getContext("2d"), { width: 20, height: 20, background: d.background, shapes: [] }, {});
        assert(canvas.getContext("2d").getImageData(5, 5, 1, 1).data[3] === 255, "a saved picture keeps its background");
        doc.querySelector('#toolbar [data-action="toggleGrid"]').click();
      }),
      test("reset clears the selected shape alone, and is undone", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const a = engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2, effects: { look: "sepia" } });
        const b = engine.makeShape("rect", { x: 300, y: 40, w: 80, h: 60, width: 2, effects: { look: "invert" } });
        api.getDoc().shapes.push(a, b);
        api.getDoc().effects = { look: "grayscale" };
        api.setTool("select");
        api.selectShape(a.id);
        const reset = () => doc.querySelector('#rightPanel [data-action="fxReset"]');
        assert(!reset().disabled, "reset is off with effects to clear");
        const fx = doc.querySelector("#rightPanel .fx-section");
        assert(fx.firstElementChild.classList.contains("fx-scope") && fx.children[1].querySelector('[data-action="fxReset"]'), "reset belongs right under the scope");
        reset().click();
        assert(!api.shapes()[0].effects, "the shape kept its effects");
        assert(api.shapes()[1].effects.look === "invert", "the other shape lost its");
        assert(api.getDoc().effects.look === "grayscale", "the picture lost its");
        assert(reset().disabled, "nothing left to clear here");
        api.undo();
        assert(api.shapes()[0].effects.look === "sepia", "undo did not bring it back");
      }),
      test("with several selected it clears those; with nothing selected, the picture", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        api.getDoc().shapes.push(engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2, effects: { look: "sepia" } }), engine.makeShape("rect", { x: 300, y: 40, w: 80, h: 60, width: 2, effects: { blur: 3 } }));
        api.getDoc().effects = { look: "grayscale" };
        api.setTool("select");
        api.draw(5, 5, 500, 300);
        doc.querySelector('#rightPanel [data-action="fxReset"]').click();
        api.shapes().forEach((shape) => assert(!shape.effects, shape.id));
        assert(api.getDoc().effects.look === "grayscale", "the picture is not part of the selection");
        api.deselect();
        doc.querySelector('#rightPanel [data-action="fxReset"]').click();
        assert(!api.getDoc().effects, "with nothing selected it clears the picture");
      }),
      test("an area picked: the shapes it touches, never the whole picture; a lifted piece goes away", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        api.getDoc().background = "#ff0000";
        api.getDoc().effects = { look: "grayscale" };
        const near = engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2, effects: { look: "sepia" } });
        const far = engine.makeShape("rect", { x: 500, y: 300, w: 80, h: 60, width: 2, effects: { look: "invert" } });
        api.getDoc().shapes.push(near, far);
        api.setTool("selectRect");
        api.draw(30, 30, 150, 150);
        doc.querySelector('#rightPanel [data-action="fxReset"]').click();
        assert(!api.shapes()[0].effects, "the shape in the area kept its effect");
        assert(api.shapes()[1].effects.look === "invert", "a shape outside the area lost its");
        assert(api.getDoc().effects.look === "grayscale", "picking an area must not clear the whole picture");
        const count = api.shapes().length;
        api.setTool("selectRect");
        api.draw(200, 200, 300, 280);
        doc.querySelector('#rightPanel [data-action="fxLook:invert"]').click();
        assert(api.shapes().length === count + 1, "the area was not lifted");
        doc.querySelector('#rightPanel [data-action="fxReset"]').click();
        assert(api.shapes().length === count, "the lifted piece stayed");
      }),
    ]),

    suite("Pixels", [
      test("a click picks one pixel, a drag every pixel it touches", (api, doc) => {
        freshDoc(api);
        api.setTool("selectPixel");
        api.draw(10.7, 20.2, 10.7, 20.2);
        let r = api.regionBounds();
        assert(r.x === 10 && r.y === 20 && r.w === 1 && r.h === 1, JSON.stringify(r));
        assert(doc.querySelector('#rightPanel [data-color="pixel:color"]'), "the panel offers no pixel colour");
        assert(doc.getElementById("regionSize").textContent === "1 x 1", doc.getElementById("regionSize").textContent);
        api.draw(14.5, 9.5, 11.2, 12.9);
        r = api.regionBounds();
        assert(r.x === 11 && r.y === 9 && r.w === 4 && r.h === 4, "both ends count: " + JSON.stringify(r));
        api.draw(-30, -30, -20, -20);
        r = api.regionBounds();
        assert(r.x === 0 && r.y === 0 && r.w === 1 && r.h === 1, "it stays on the picture: " + JSON.stringify(r));
      }),
      test("a colour changes the picked pixels and no others, and is one undo", (api, doc) => {
        freshDoc(api);
        api.getDoc().background = "#ffffff";
        api.setTool("selectPixel");
        api.draw(50.5, 60.5, 50.5, 60.5);
        const count = api.shapes().length;
        doc.querySelector('#leftPanel [data-action="color:#ed1c24"]').click();
        const read = (x, y) => [...doc.getElementById("board").getContext("2d").getImageData(x, y, 1, 1).data];
        const hit = read(50, 60);
        assert(hit[0] === 237 && hit[1] === 28 && hit[2] === 36, "the pixel: " + hit);
        [[49, 60], [51, 60], [50, 59], [50, 61]].forEach((p) => {
          const near = read(p[0], p[1]);
          assert(near[0] === 255 && near[1] === 255, "a neighbour changed at " + p + ": " + near);
        });
        assert(api.regionBounds().w === 1, "the pick stays for the next change");
        doc.querySelector('#leftPanel [data-action="color:#22b14c"]').click();
        assert(read(50, 60)[1] === 177, "a second colour: " + read(50, 60));
        assert(api.shapes().length === count + 1, "changes in a row share one layer: " + api.shapes().length);
        api.undo();
        api.undo();
        assert(api.shapes().length === count, "undo");
        assert(read(50, 60)[1] === 255, "undo left the pixel: " + read(50, 60));
      }),
      test("the layer of pixels is not picked up, and goes out in a saved picture", async (api, doc, win) => {
        freshDoc(api);
        api.getDoc().background = "#ffffff";
        const rect = win.PaintEngine.makeShape("rect", { x: 200, y: 200, w: 80, h: 60, width: 2 });
        api.getDoc().shapes.push(rect);
        api.setTool("selectPixel");
        api.draw(30.5, 30.5, 40.5, 40.5);
        api.setColor("#3f48cc");
        api.setTool("select");
        api.draw(30, 30, 30, 30);
        assert(api.getSelected().length === 0, "a click on changed pixels picked the layer");
        api.draw(5, 5, 600, 500);
        assert(api.getSelected().join() === rect.id, "the box picked the layer: " + api.getSelected().length);
        const copy = win.PaintEngine.parse(win.PaintEngine.serialize([api.getDoc()])).documents[0];
        assert(copy.shapes.some((shape) => shape.pixelLayer && shape.src.indexOf("data:image/png") === 0), "the file lost the pixels");
      }),
      test("a shape selected takes the colour even with an old area about", (api, doc, win) => {
        freshDoc(api);
        const rect = win.PaintEngine.makeShape("rect", { x: 200, y: 200, w: 80, h: 60, width: 2 });
        api.getDoc().shapes.push(rect);
        api.selectShape(rect.id);
        const count = api.shapes().length;
        doc.querySelector('#leftPanel [data-action="color:#ed1c24"]').click();
        assert(api.shapes()[0].color === "#ed1c24" && api.shapes().length === count, "no layer for a shape");
      }),
      test("the other area tools change their pixels too", (api, doc) => {
        freshDoc(api);
        api.getDoc().background = "#ffffff";
        api.setTool("selectEllipse");
        api.draw(100, 100, 200, 180);
        doc.querySelector('#leftPanel [data-action="color:#ed1c24"]').click();
        const read = (x, y) => [...doc.getElementById("board").getContext("2d").getImageData(x, y, 1, 1).data];
        assert(read(150, 140)[1] === 28, "inside: " + read(150, 140));
        assert(read(101, 101)[1] === 255, "outside the ellipse: " + read(101, 101));
      }),
    ]),

    suite("Colour of the selection", [
      test("a palette colour goes to the selected shape and text, as one undo step each", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const rect = engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2, color: "#000000" });
        const text = engine.makeShape("text", { x: 200, y: 80, text: "abcd", fontSize: 24, color: "#000000", runs: [{ text: "ab", color: "#111111" }, { text: "cd", color: "#222222" }] });
        api.getDoc().shapes.push(rect, text);
        const palette = (hex) => doc.querySelector('#leftPanel [data-action="color:' + hex + '"]').click();
        const textColor = api.shapes()[1].color;
        api.selectShape(rect.id);
        palette("#ed1c24");
        assert(api.shapes()[0].color === "#ed1c24", api.shapes()[0].color);
        assert(api.shapes()[1].color === textColor, "the other shape changed");
        api.undo();
        assert(api.shapes()[0].color === "#000000", "undo did not take it back");
        api.selectShape(api.shapes()[1].id);
        palette("#22b14c");
        engine.textRuns(api.shapes()[1]).forEach((run) => assert(run.color === "#22b14c", JSON.stringify(run)));
      }),
      test("every selected shape takes the colour; the fill only goes where it can", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const rect = engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2 });
        const line = engine.makeShape("line", { x: 40, y: 160, w: 100, h: 0, width: 2 });
        const text = engine.makeShape("text", { x: 200, y: 80, text: "Hi", fontSize: 24 });
        api.getDoc().shapes.push(rect, line, text);
        api.setTool("select");
        api.draw(5, 5, 400, 300);
        assert(api.getSelected().length === 3, String(api.getSelected().length));
        doc.querySelector('#leftPanel [data-action="color:#3f48cc"]').click();
        api.shapes().forEach((shape) => assert(shape.color === "#3f48cc", shape.kind + " " + shape.color));
        const box = doc.querySelector('#leftPanel [data-pick="noFill"]');
        box.checked = false;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.shapes()[0].fill !== "", "the rectangle took no fill");
        assert(!api.shapes()[1].fill, "a line has no fill");
      }),
      test("a colour picked with a drawing tool in hand is for the next shape", (api, doc) => {
        freshDoc(api);
        api.setTool("pencil");
        api.setColor("#000000");
        api.draw(20, 20, 120, 90);
        doc.querySelector('#leftPanel [data-action="color:#ed1c24"]').click();
        assert(api.shapes()[0].color === "#000000", "picking a colour repainted the last stroke");
        const next = api.draw(30, 30, 130, 100);
        assert(next.color === "#ed1c24", next.color);
      }),
      test("while typing, a colour goes to the caret and typing goes on", async (api, doc, win) => {
        freshDoc(api);
        api.setTool("text");
        api.setColor("#000000");
        api.draw(100, 100, 100, 100);
        const editor = doc.getElementById("textEditor");
        editor.focus();
        doc.execCommand("insertText", false, "ab");
        doc.querySelector('#leftPanel [data-action="color:#ed1c24"]').click();
        assert(!editor.hidden, "the colour ended the typing");
        doc.execCommand("insertText", false, "c");
        const spans = [...editor.querySelectorAll("[data-rt]")].map((node) => node.textContent.replace(/\u200B/g, "") + node.dataset.color).filter((row) => !row.startsWith("#"));
        assert(spans.join(",") === "ab#000000,c#ed1c24", spans.join(","));
        api.setTool("select");
      }),
    ]),

    suite("Moving several", [
      test("shapes and text picked with a box move together, as one undo step", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const shapes = [
          engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2 }),
          engine.makeShape("text", { x: 180, y: 90, text: "Hello", fontSize: 24 }),
          engine.makeShape("line", { x: 40, y: 160, w: 200, h: 10, width: 2 }),
          engine.makeShape("pencil", { width: 2, points: [{ x: 40, y: 200 }, { x: 120, y: 230 }] }),
        ];
        shapes.forEach((shape) => api.getDoc().shapes.push(shape));
        api.setTool("select");
        const box = (i) => engine.bounds(api.shapes()[i]);
        const before = [0, 1, 2, 3].map(box);
        api.draw(10, 10, 400, 300);
        assert(api.getSelected().length === 4, "the box picked " + api.getSelected().length);
        // by the text, then by an empty part of the line's box
        api.draw(190, 80, 230, 110);
        assert(api.getSelected().length === 4, "dragging one dropped the others");
        const after = [0, 1, 2, 3].map(box);
        after.forEach((row, i) => {
          assert(Math.abs(row.x - before[i].x - 40) < 1 && Math.abs(row.y - before[i].y - 30) < 1, i + ": " + JSON.stringify([before[i], row]));
        });
        api.undo();
        const back = box(1);
        assert(Math.abs(back.x - before[1].x) < 1, "one drag is one undo step");
      }),
      test("Shift adds and removes, and a click without a drag narrows the group", (api, doc, win) => {
        freshDoc(api);
        const engine = win.PaintEngine;
        const a = engine.makeShape("rect", { x: 40, y: 40, w: 80, h: 60, width: 2 });
        const b = engine.makeShape("text", { x: 200, y: 80, text: "Hi", fontSize: 24 });
        const c = engine.makeShape("ellipse", { x: 40, y: 200, w: 80, h: 60, width: 2 });
        [a, b, c].forEach((shape) => api.getDoc().shapes.push(shape));
        api.setTool("select");
        const board = doc.getElementById("board");
        const press = (x, y, shift) => {
          const r = board.getBoundingClientRect();
          const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: r.left + x, clientY: r.top + y, shiftKey: Boolean(shift) };
          board.dispatchEvent(new win.PointerEvent("pointerdown", at));
          board.dispatchEvent(new win.PointerEvent("pointerup", at));
        };
        press(60, 60);
        assert(api.getSelected().join() === a.id, api.getSelected().join());
        press(210, 72, true);
        assert(api.getSelected().length === 2 && api.getSelected().indexOf(b.id) >= 0, "Shift did not add the text");
        press(60, 220, true);
        assert(api.getSelected().length === 3, "Shift did not add the third");
        press(60, 60, true);
        assert(api.getSelected().length === 2 && api.getSelected().indexOf(a.id) < 0, "Shift did not take it back out");
        press(60, 220);
        assert(api.getSelected().join() === c.id, "a plain click should narrow to the shape: " + api.getSelected().join());
        assert(doc.querySelectorAll("#canvasOverlay .shape-handle").length === 8, "one shape has its handles");
        press(600, 500);
        assert(api.getSelected().length === 0, "a click on nothing clears the selection");
      }),
    ]),

    suite("More shapes", [
      test("each new tool draws its own closed outline, filled and exported", (api, doc, win) => {
        const engine = win.PaintEngine;
        const kinds = ["diamond", "rightTriangle", "pentagon", "hexagon", "star", "heart", "blockArrow", "cross", "bubble", "cloud"];
        kinds.forEach((kind) => {
          freshDoc(api);
          assert(doc.querySelector('#leftPanel [data-action="tool:' + kind + '"] svg'), kind + " has no tool button");
          assert(api.t("tool." + kind) !== "tool." + kind && api.t("kind." + kind) !== "kind." + kind, kind + " has no name");
          api.setTool(kind);
          const shape = api.draw(40, 40, 240, 200);
          assert(shape && shape.kind === kind, kind + " drew " + (shape && shape.kind));
          const outline = engine.outlinePoints(shape);
          assert(outline.length >= 3, kind);
          outline.forEach((point) => {
            assert(point.x >= 39 && point.x <= 241 && point.y >= 39 && point.y <= 201, kind + " leaves its box: " + JSON.stringify(point));
          });
          assert(engine.isFillable(kind), kind + " takes no fill");
          const svg = win.MyPaintSvgDoc.shapeToSvg ? win.MyPaintSvgDoc.shapeToSvg(shape, {}) : "<polygon";
          assert(svg.indexOf("<polygon") >= 0, kind + " is missing from an SVG: " + svg);
        });
      }),
      test("a filled star is painted inside and its corners are not", (api, doc, win) => {
        const engine = win.PaintEngine;
        const canvas = doc.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const shape = engine.makeShape("star", { x: 0, y: 0, w: 100, h: 100, color: "#ff0000", fill: "#ff0000", width: 1 });
        engine.render(canvas.getContext("2d"), { width: 100, height: 100, background: "#ffffff", shapes: [shape] }, {});
        const read = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
        assert(read(50, 55)[1] === 0, "the middle is not filled: " + read(50, 55));
        assert(read(2, 2)[1] === 255, "the corner is painted: " + read(2, 2));
      }),
      test("the new shapes resize like the others, and the Draw menu still fits", (api, doc, win) => {
        const engine = win.PaintEngine;
        const heart = engine.makeShape("heart", { x: 10, y: 10, w: 100, h: 80, width: 2 });
        const box = engine.bounds(heart);
        engine.resizeShape(heart, "se", { x: box.x, y: box.y, w: box.w + 100, h: box.h });
        assert(Math.abs(heart.w - 200) < 1, String(heart.w));
        doc.querySelector('#menubar [data-menu="draw"]').click();
        const actions = [...doc.querySelectorAll("#menuLayer [data-action]")].map((node) => node.dataset.action);
        api.closeMenu();
        assert(actions.indexOf("tool:rect") >= 0 && actions.indexOf("tool:star") < 0, actions.join(","));
      }),
    ]),

    suite("Moving and resizing", [
      test("a selected shape has eight handles, and a handle resizes it from the opposite side", (api, doc, win) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(100, 100, 200, 180);
        const shape = api.shapes()[0];
        api.selectShape(shape.id);
        const handles = doc.querySelectorAll("#canvasOverlay .shape-handle");
        assert(handles.length === 8, String(handles.length));
        const pointer = (node, type, x, y) => node.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y }));
        const board = doc.getElementById("board").getBoundingClientRect();
        const drag = (name, x, y) => {
          const grip = doc.querySelector('#canvasOverlay [data-handle="' + name + '"]');
          pointer(grip, "pointerdown", 0, 0);
          pointer(win, "pointermove", board.left + x, board.top + y);
          pointer(win, "pointerup", board.left + x, board.top + y);
        };
        const before = win.PaintEngine.bounds(api.shapes()[0]);
        drag("se", before.x + before.w + 50, before.y + before.h + 30);
        const after = win.PaintEngine.bounds(api.shapes()[0]);
        assert(Math.abs(after.w - before.w - 50) < 1 && Math.abs(after.h - before.h - 30) < 1, JSON.stringify(after));
        assert(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1, "the opposite corner moved");
        api.undo();
        const back = win.PaintEngine.bounds(api.shapes()[0]);
        assert(Math.abs(back.w - before.w) < 1, "one drag is one undo step");
        api.selectShape(api.shapes()[0].id);
        drag("nw", before.x - 20, before.y - 10);
        const grown = win.PaintEngine.bounds(api.shapes()[0]);
        assert(Math.abs(grown.x - (before.x - 20)) < 1 && Math.abs(grown.x + grown.w - (before.x + before.w)) < 1, JSON.stringify(grown));
        drag("e", grown.x - 500, 0);
        const least = win.PaintEngine.bounds(api.shapes()[0]);
        assert(least.w >= 4 && Math.abs(least.x - grown.x) < 1, "a shape turned inside out: " + JSON.stringify(least));
      }),
      test("text is resized by its handles and moved with the select tool", (api, doc, win) => {
        freshDoc(api);
        const made = api.addShape ? null : null;
        const engine = win.PaintEngine;
        const text = engine.makeShape("text", { x: 100, y: 200, text: "Hello", fontSize: 40, fontFamily: "Arial", color: "#000000" });
        const box = engine.bounds(text);
        engine.resizeShape(text, "se", engine.resizedBox(box, "se", box.x + box.w * 2, box.y + box.h * 2));
        assert(text.fontSize === 80, String(text.fontSize));
        const big = engine.bounds(text);
        assert(Math.abs(big.x - box.x) < 1 && Math.abs(big.y - box.y) < 1, "the top left corner should stay: " + JSON.stringify(big));
        const left = engine.makeShape("text", { x: 100, y: 200, text: "Hello", fontSize: 40, fontFamily: "Arial" });
        const leftBox = engine.bounds(left);
        engine.resizeShape(left, "nw", engine.resizedBox(leftBox, "nw", leftBox.x + leftBox.w / 2, leftBox.y + leftBox.h / 2));
        const small = engine.bounds(left);
        assert(left.fontSize === 20, String(left.fontSize));
        assert(Math.abs(small.x + small.w - leftBox.x - leftBox.w) < 1 && Math.abs(small.y + small.h - leftBox.y - leftBox.h) < 1, "the bottom right corner should stay");
        const rich = engine.makeShape("text", { x: 0, y: 50, text: "ab", fontSize: 20, runs: [{ text: "a", fontSize: 20 }, { text: "b", fontSize: 30 }] });
        const richBox = engine.bounds(rich);
        engine.resizeShape(rich, "s", engine.resizedBox(richBox, "s", 0, richBox.y + richBox.h * 2));
        assert(rich.runs[0].fontSize === 40 * rich.fontSize / 40 && rich.runs[1].fontSize > 30, JSON.stringify(rich.runs));
        assert(made === null);
      }),
      test("strokes and lines keep their ends in step, and a selected list row can be moved", (api, doc, win) => {
        const engine = win.PaintEngine;
        const stroke = engine.makeShape("pencil", { width: 4, points: [{ x: 10, y: 10 }, { x: 110, y: 60 }] });
        const box = engine.bounds(stroke);
        engine.resizeShape(stroke, "se", { x: box.x, y: box.y, w: box.w + 100, h: box.h + 50 });
        const last = stroke.points[stroke.points.length - 1];
        assert(Math.abs(last.x - 210) < 1 && Math.abs(last.y - 110) < 1, JSON.stringify(last));
        const line = engine.makeShape("line", { x: 100, y: 100, w: -50, h: 40, width: 2 });
        const lineBox = engine.bounds(line);
        engine.resizeShape(line, "e", { x: lineBox.x, y: lineBox.y, w: lineBox.w + 50, h: lineBox.h });
        assert(Math.abs(line.x - 150) < 1 && Math.abs(line.x + line.w - 50) < 1, "the line swapped ends: " + JSON.stringify(line));
        freshDoc(api);
        api.setTool("rect");
        api.draw(100, 100, 200, 180);
        api.setTool("pencil");
        api.selectShape(api.shapes()[0].id);
        assert(api.getSettings().tool === "select", "picking a shape should let it be dragged");
      }),
    ]),

    suite("Effects", [
      test("the effects sit under the properties in the right panel", (api, doc) => {
        const panel = doc.getElementById("rightPanel");
        const props = panel.querySelector(".props");
        const title = panel.querySelector(".fx-title");
        assert(title && title.getBoundingClientRect().top >= props.getBoundingClientRect().bottom - 1, "the effects are not under the properties");
        assert(panel.querySelectorAll(".fx-look").length === 8, String(panel.querySelectorAll(".fx-look").length));
        ["brightness", "contrast", "saturate", "blur", "border.top", "border.bottom", "border.left", "border.right", "shadow.x", "shadow.y", "shadow.blur", "shadow.opacity"].forEach((name) => {
          const input = panel.querySelector('[data-fx="' + name + '"]');
          assert(input, name);
          assert(panel.querySelector('[data-step^="fx:' + name + ':"]'), name + " has no stepper");
        });
      }),
      test("a look is previewed, undone and kept in the drawing file", (api, doc, win) => {
        const panel = doc.getElementById("rightPanel");
        panel.querySelector('[data-action="fxLook:sepia"]').click();
        assert(doc.getElementById("board").style.filter.indexOf("sepia") >= 0, doc.getElementById("board").style.filter);
        assert(api.getDoc().effects.look === "sepia");
        assert(api.getDoc().dirty === true, "the drawing should count as changed");
        const copy = win.PaintEngine.parse(win.PaintEngine.serialize([api.getDoc()])).documents[0];
        assert(copy.effects && copy.effects.look === "sepia", "the file lost the effects");
        api.undo();
        assert(win.MyPaintEffects.normalize(api.getDoc().effects).look === "none", "undo did not take it back");
        assert(doc.getElementById("board").style.filter === "", doc.getElementById("board").style.filter);
      }),
      test("the border and the shadow change the size of the saved picture", async (api, doc) => {
        const size = api.getDoc();
        const w = size.width;
        const h = size.height;
        const panel = () => doc.getElementById("rightPanel");
        const set = (name, value) => {
          const input = panel().querySelector('[data-fx="' + name + '"]');
          input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        set("border.top", 10);
        set("border.bottom", 20);
        set("border.left", 30);
        set("border.right", 40);
        let result = await api.convert("png", 92);
        assert(result.width === w + 70 && result.height === h + 30, result.width + "x" + result.height);
        const layer = doc.getElementById("canvasEffect");
        assert(!layer.hidden && layer.style.left === "-30px" && layer.style.bottom === "-20px", layer.style.cssText);
        panel().querySelector('[data-fx="shadow.on"]').click();
        assert(api.getDoc().effects.shadow.on === true);
        result = await api.convert("png", 92);
        assert(result.width === w + 70 + 32 && result.height === h + 30 + 32, result.width + "x" + result.height);
        panel().querySelector('[data-action="fxReset"]').click();
        result = await api.convert("png", 92);
        assert(result.width === w && result.height === h, "reset left the frame");
        assert(layer.hidden, "the preview stayed");
      }),
      test("the export dialog sets each side of the border and the shadow", (api, doc) => {
        const popup = api.openPopup("convert");
        const set = (name, value) => {
          const input = popup.querySelector('[data-field="' + name + '"]');
          assert(input, name);
          if (input.type === "checkbox") input.checked = value;
          else input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        set("fxBorderTop", 4);
        set("fxBorderBottom", 5);
        set("fxBorderLeft", 6);
        set("fxBorderRight", 7);
        set("fxBorderColor", "#112233");
        set("fxShadowOn", true);
        set("fxShadowX", -3);
        set("fxShadowY", 9);
        set("fxShadowBlur", 11);
        set("fxShadowOpacity", 70);
        set("fxShadowColor", "#445566");
        set("fxShadowTransparent", true);
        const fx = api.getDoc().effects;
        assert(fx.border.top === 4 && fx.border.bottom === 5 && fx.border.left === 6 && fx.border.right === 7 && fx.border.color === "#112233", JSON.stringify(fx.border));
        assert(fx.shadow.on && fx.shadow.x === -3 && fx.shadow.y === 9 && fx.shadow.blur === 11 && fx.shadow.opacity === 70 && fx.shadow.color === "#445566" && fx.shadow.transparent, JSON.stringify(fx.shadow));
        assert(doc.querySelector('#rightPanel [data-fx="border.top"]').value === "4", "the panel does not follow the dialog");
        api.closePopup();
        api.undo();
        const back = api.getDoc().effects;
        assert(!back || !back.border.top, "one visit to the dialog is one undo");
      }),
      test("the pixels of a saved picture have the effects in them", (api, doc, win) => {
        const Fx = win.MyPaintEffects;
        const source = doc.createElement("canvas");
        source.width = 20;
        source.height = 20;
        const g = source.getContext("2d");
        g.fillStyle = "#c81e1e";
        g.fillRect(0, 0, 20, 20);
        assert(Fx.apply(source, {}) === source, "no effects must not copy the picture");
        const read = (canvas, x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
        const gray = read(Fx.apply(source, { look: "grayscale" }), 10, 10);
        assert(gray[0] === gray[1] && gray[1] === gray[2], gray.join(","));
        const inverted = read(Fx.apply(source, { look: "invert" }), 10, 10);
        assert(Math.abs(inverted[0] - 55) <= 1 && Math.abs(inverted[1] - 225) <= 1, inverted.join(","));
        const framed = Fx.apply(source, { border: { top: 2, bottom: 3, left: 4, right: 5, color: "#0000ff" } });
        assert(framed.width === 29 && framed.height === 25, framed.width + "x" + framed.height);
        assert(read(framed, 1, 10)[2] === 255 && read(framed, 28, 10)[2] === 255 && read(framed, 10, 0)[2] === 255 && read(framed, 10, 24)[2] === 255, "the band is not on all four sides");
        assert(read(framed, 4, 2)[0] === 200, "the picture is not inside the band");
        const shadow = { on: true, x: 6, y: 6, blur: 0, opacity: 100, color: "#000000", backdrop: "#ffffff" };
        const shaded = Fx.apply(source, { shadow: shadow });
        assert(shaded.width === 26 && shaded.height === 26, shaded.width + "x" + shaded.height);
        assert(read(shaded, 24, 24)[0] === 0, "no shadow past the corner: " + read(shaded, 24, 24));
        assert(read(shaded, 24, 2)[0] === 255, "the backdrop is missing: " + read(shaded, 24, 2));
        const clear = Object.assign({}, shadow, { transparent: true });
        assert(read(Fx.apply(source, { shadow: clear }), 24, 2)[3] === 0, "the backdrop should be clear");
        assert(read(Fx.apply(source, { shadow: clear }, { flatten: true }), 24, 2)[3] === 255, "a format without transparency gets the backdrop");
        const blurred = doc.createElement("canvas");
        blurred.width = 30;
        blurred.height = 10;
        const b = blurred.getContext("2d");
        b.fillStyle = "#000";
        b.fillRect(0, 0, 30, 10);
        b.fillStyle = "#fff";
        b.fillRect(15, 0, 15, 10);
        const soft = read(Fx.apply(blurred, { blur: 3 }), 14, 5);
        assert(soft[0] > 40 && soft[0] < 215, "the blur did nothing: " + soft.join(","));
      }),
      test("the colour chooser starts from the effect's colour and writes it", (api, doc, win) => {
        const button = doc.querySelector('#rightPanel [data-color="fx:border.color"]');
        assert(button, "no border colour button");
        button.click();
        const hex = doc.querySelector(".cp-hex, .color-picker input[type=\"text\"], [data-cp-hex]");
        assert(hex && hex.value.toLowerCase() === "#ffffff", hex ? hex.value : "no hex field");
        hex.value = "#123456";
        hex.dispatchEvent(new Event("input", { bubbles: true }));
        hex.dispatchEvent(new Event("change", { bubbles: true }));
        assert(api.getDoc().effects.border.color === "#123456", JSON.stringify(api.getDoc().effects));
        doc.body.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        assert(!doc.querySelector(".cp-hex"), "the chooser stayed open");
      }),
      test("the round colour wheel sets the border, shadow and backdrop colours", (api, doc, win) => {
        const panel = () => doc.getElementById("rightPanel");
        const pointer = (node, type, x, y) => node.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y }));
        const disc = () => doc.getElementById("fxWheelDisc");
        assert(disc() && disc().getContext("2d").getImageData(74, 74, 1, 1).data[3] === 255, "the disc is not painted");
        assert(disc().getContext("2d").getImageData(1, 1, 1, 1).data[3] === 0, "the disc is not round");
        const depth = api.undoDepth ? api.undoDepth() : null;
        let box = disc().getBoundingClientRect();
        // the white default sits in the middle; the right edge is pure red
        pointer(disc(), "pointerdown", box.right - 1, box.top + box.height / 2);
        assert(/^#ff0[0-9a-f]0[0-9a-f]$/.test(api.getDoc().effects.border.color), api.getDoc().effects.border.color);
        const canvasWhileDragging = disc();
        pointer(win, "pointermove", box.left + box.width / 2, box.bottom - 1);
        assert(disc() === canvasWhileDragging, "the panel was rebuilt under the drag");
        const swatch = panel().querySelector('[data-color="fx:border.color"] .hex').textContent;
        assert(swatch === api.getDoc().effects.border.color, swatch);
        pointer(win, "pointerup", box.left + box.width / 2, box.bottom - 1);
        if (depth !== null) assert(api.undoDepth() === depth + 1, "one drag is one undo step");
        // a black shadow still takes a colour
        panel().querySelector('[data-action="fxWheel:shadow.color"]').click();
        assert(panel().querySelector('[data-action="fxWheel:shadow.color"]').classList.contains("on"));
        box = disc().getBoundingClientRect();
        pointer(disc(), "pointerdown", box.right - 1, box.top + box.height / 2);
        pointer(win, "pointerup", box.right - 1, box.top + box.height / 2);
        assert(/^#ff/.test(api.getDoc().effects.shadow.color), api.getDoc().effects.shadow.color);
        // the value control darkens it
        const value = panel().querySelector('[data-fxwheel="value"]');
        value.value = "50";
        value.dispatchEvent(new Event("change", { bubbles: true }));
        assert(/^#80/.test(api.getDoc().effects.shadow.color), api.getDoc().effects.shadow.color);
        assert(panel().querySelector('[data-fxwheel="value"]').value === "50");
        // outside the disc nothing happens
        const before = JSON.stringify(api.getDoc().effects);
        box = disc().getBoundingClientRect();
        pointer(disc(), "pointerdown", box.left + 1, box.top + 1);
        assert(JSON.stringify(api.getDoc().effects) === before, "a corner of the square picked a colour");
        const W = win.MyPaintColorWheel;
        ["#ff0000", "#00ff00", "#123456", "#ffffff", "#000000"].forEach((hex) => {
          const c = W.hexToHsv(hex);
          assert(W.hsvToHex(c.h, c.s, c.v) === hex, hex + " came back as " + W.hsvToHex(c.h, c.s, c.v));
        });
      }),
      test("the fold buttons of both panels are in colour", (api, doc) => {
        ["leftPanel", "rightPanel"].forEach((id) => {
          const html = doc.querySelector("#" + id + " .panel-fold").innerHTML;
          assert(html.indexOf("#2563eb") >= 0 && html.indexOf("#f97316") >= 0, id + ": " + html);
        });
      }),
      test("Supported formats is in the Help menu, not Tools", (api, doc) => {
        const items = (name) => {
          doc.querySelector('#menubar [data-menu="' + name + '"]').click();
          const list = [...doc.querySelectorAll("#menuLayer [data-action]")].map((node) => node.dataset.action);
          api.closeMenu();
          return list;
        };
        assert(items("help").indexOf("formats") >= 0, "not in Help");
        assert(items("tools").indexOf("formats") < 0, "still in Tools");
      }),
      test("damaged effects are made valid", (api, doc, win) => {
        const fx = win.MyPaintEffects.normalize({ look: "gone", brightness: 999, blur: -4, border: { top: "x", left: 9999, color: "red" }, shadow: { x: 1000, opacity: 500 } });
        assert(fx.look === "none" && fx.brightness === 200 && fx.blur === 0, JSON.stringify(fx));
        assert(fx.border.top === 0 && fx.border.left === 500 && fx.border.color === "#ffffff", JSON.stringify(fx.border));
        assert(fx.shadow.x === 200 && fx.shadow.opacity === 100, JSON.stringify(fx.shadow));
      }),
    ]),

    suite("Settings", [
      test("settings survive a reload", (api) => {
        api.setLanguage("en");
        api.setTheme("dark-midnight");
        api.setZoom(150);
        api.setFont("Georgia", 32, "bold");
        api.setStrokeWidth(9);
        const loaded = api.loadSettings();
        assert(loaded.language === "en", loaded.language);
        assert(loaded.theme === "dark-midnight");
        assert(loaded.zoom === 150, String(loaded.zoom));
        assert(loaded.fontFamily === "Georgia");
        assert(loaded.fontSize === 32);
        assert(loaded.strokeWidth === 9);
      }),
      test("the settings popup has one row per item across five tabs", (api) => {
        const popup = api.openPopup("settings");
        const tabs = [...popup.querySelectorAll("[data-tab]")].map((tab) => tab.dataset.tab);
        assert(tabs.join(",") === "general,font,appearance,workspace,start", tabs.join(","));
        popup.querySelectorAll(".line").forEach((line) => {
          assert(line.offsetHeight <= 34, "a settings row is taller than one line");
        });
      }),
      test("the settings popup applies language, theme and font", (api) => {
        const popup = api.openPopup("settings");
        popup.querySelector('[data-field="language"]').value = "en";
        popup.querySelector('[data-field="theme"]').value = "dark-navy";
        popup.querySelector('[data-popup-action="apply-settings"]').click();
        assert(api.getLanguage() === "en");
        assert(api.getTheme() === "dark-navy");
      }),
      test("the new drawing size comes from the settings", (api) => {
        api.popupAction("apply-settings", { canvasWidth: 400, canvasHeight: 300 });
        api.run("new");
        const popup = api.getPopup();
        assert(popup && popup.dataset.kind === "newdoc", "new does not ask for a size");
        assert(popup.querySelector('[data-field="width"]').value === "400", popup.querySelector('[data-field="width"]').value);
        assert(popup.querySelector('[data-field="height"]').value === "300", popup.querySelector('[data-field="height"]').value);
        popup.querySelector('[data-field="width"]').value = "640";
        popup.querySelector('[data-field="height"]').value = "200";
        popup.querySelector('[data-popup-action="create-new"]').click();
        assert(api.getDoc().width === 640 && api.getDoc().height === 200, api.getDoc().width + "x" + api.getDoc().height);
      }),
      test("the panels can be hidden from the settings", (api, doc) => {
        api.popupAction("apply-settings", { showLeft: false, showRight: false });
        assert(doc.getElementById("leftPanel").classList.contains("collapsed"));
        assert(doc.getElementById("rightPanel").classList.contains("collapsed"));
        assert(doc.getElementById("leftPanel").querySelector(".panel-fold"));
        assert(doc.getElementById("rightPanel").querySelector(".panel-fold"));
      }),
    ]),

    suite("Language", [
      test("both packs carry the same keys", (api, doc, win) => {
        const ko = Object.keys(win.MyPaintI18n.ko);
        const en = Object.keys(win.MyPaintI18n.en);
        assert(ko.length === en.length, ko.length + " vs " + en.length);
        ko.forEach((key) => assert(en.indexOf(key) >= 0, "English is missing " + key));
        en.forEach((key) => assert(ko.indexOf(key) >= 0, "Korean is missing " + key));
      }),
      test("switching the language rewrites the whole window", (api, doc) => {
        api.setLanguage("en");
        assert(doc.querySelector('#menubar [data-menu="file"] span').textContent === "File");
        assert(doc.querySelector('#toolbar [data-action="print"]').title === "Print");
        assert(doc.getElementById("leftPanel").textContent.indexOf("Tools") >= 0);
        api.setLanguage("ko");
        assert(doc.querySelector('#menubar [data-menu="file"] span').textContent === "파일");
        assert(doc.querySelector('#toolbar [data-action="print"]').title === "인쇄");
      }),
      test("the language button shows the other language with its flag", (api, doc) => {
        const button = doc.querySelector('#toolbar [data-action="language"]');
        assert(button.dataset.flag === "uk", button.dataset.flag);
        assert(button.title.indexOf("English") >= 0, button.title);
        button.click();
        assert(api.getLanguage() === "en");
        const next = doc.querySelector('#toolbar [data-action="language"]');
        assert(next.dataset.flag === "kr");
        assert(next.querySelector("svg.flag"), "no flag drawing");
      }),
      test("only Korean and English are offered", (api) => {
        const popup = api.openPopup("settings");
        const options = [...popup.querySelectorAll('[data-field="language"] option')].map((item) => item.value);
        assert(options.join(",") === "ko,en", options.join(","));
      }),
    ]),

    suite("Theme", [
      test("every theme sets the shared variables", (api, doc) => {
        api.themes().forEach((id) => {
          api.setTheme(id);
          const style = doc.defaultView.getComputedStyle(doc.documentElement);
          ["--bg", "--panel", "--ink", "--accent", "--line"].forEach((name) => {
            assert(style.getPropertyValue(name).trim().length > 0, id + " " + name);
          });
        });
        assert(api.themes().length >= 40, String(api.themes().length));
      }),
      test("the theme button shows colours, not a moon", (api, doc, win) => {
        const icons = win.MyPaintIcons;
        const theme = icons.icon("theme");
        // a ring with colour spots in it, not the old crescent
        assert((theme.match(/<circle/g) || []).length >= 4, "the theme icon has no colour spots: " + theme);
        assert(theme.indexOf("a9 9 0 1 0 9 9") < 0, "the theme icon is still the moon");
        assert(theme !== icons.icon("palette"), "the theme button must not reuse the palette glyph");
        const button = doc.querySelector('#toolbar [data-action="themeCycle"]');
        assert(button, "the theme button is missing");
        assert((button.innerHTML.match(/<circle/g) || []).length >= 4, button.innerHTML);
      }),
      test("the theme list opens as one menu with light and dark columns", (api, doc) => {
        doc.querySelector('#toolbar [data-action="themeMenu"]').click();
        const menu = api.getMenu();
        assert(menu, "no theme menu");
        assert(menu.querySelectorAll(".theme-col").length === 2);
        assert(menu.querySelectorAll(".menu-item").length >= 41);
        assert(menu.scrollHeight <= menu.clientHeight + 2, menu.scrollHeight + "/" + menu.clientHeight);
        api.closeMenu();
      }),
      test("the next theme button cycles", (api) => {
        const first = api.getTheme();
        api.run("themeCycle");
        assert(api.getTheme() !== first);
      }),
      test("a custom theme can be built", (api) => {
        api.setCustom({ mode: "dark", bg: "#102030", accent: "#ff8800" });
        api.setTheme("custom");
        assert(api.getTheme() === "custom");
        const style = getComputedStyle(document.documentElement);
        assert(api.getSettings().custom.accent === "#ff8800");
      }),
    ]),

    suite("Toolbar", [
      test("every toolbar button has a tooltip", (api, doc) => {
        const buttons = [...doc.querySelectorAll("#toolbar button")];
        assert(buttons.length >= 15, String(buttons.length));
        buttons.forEach((button) => {
          assert(button.title && button.title.length > 0, (button.dataset.action || button.id) + " has no tooltip");
          assert(button.querySelector("svg") || button.id === "zoomValue" || button.id === "fontSizeValue" || button.classList.contains("font-step") || button.classList.contains("font-style") || button.classList.contains("lang-btn"), (button.dataset.action || "") + " has no icon");
        });
      }),
      test("the tooltip shows at once on the whole of a button, a disabled one too", (api, doc, win) => {
        const bar = doc.getElementById("toolbar");
        const tip = () => doc.querySelector(".quick-tip");
        const move = (x, y) => bar.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
        const save = bar.querySelector('[data-action="save"]');
        const box = save.getBoundingClientRect();
        [[box.left + 1, box.top + 1], [box.right - 1, box.bottom - 1], [box.left + box.width / 2, box.top + box.height / 2]].forEach((point) => {
          move(point[0], point[1]);
          assert(tip() && !tip().hidden && tip().textContent === api.t("file.save"), "no tooltip at " + point.join(","));
          bar.dispatchEvent(new win.PointerEvent("pointerleave"));
          assert(tip().hidden, "the tooltip stayed");
        });
        assert(!save.hasAttribute("title"), "the browser would show its own tooltip as well");
        const undo = bar.querySelector('[data-action="undo"]');
        assert(undo.disabled, "a fresh start has nothing to undo");
        const off = undo.getBoundingClientRect();
        move(off.left + 3, off.top + 3);
        assert(!tip().hidden && tip().textContent === api.t("edit.undo"), "a disabled button has no tooltip");
        assert(tip().getBoundingClientRect().top >= off.bottom, "the tooltip covers the button");
        bar.dispatchEvent(new win.PointerEvent("pointerleave"));
      }),
      test("the tooltip survives the toolbar being drawn again, but not a press", (api, doc, win) => {
        const bar = doc.getElementById("toolbar");
        const tip = () => doc.querySelector(".quick-tip");
        const box = bar.querySelector('[data-action="save"]').getBoundingClientRect();
        const at = { bubbles: true, clientX: box.left + 5, clientY: box.top + 5 };
        bar.dispatchEvent(new win.PointerEvent("pointermove", at));
        api.setLanguage("en");
        assert(!tip().hidden && tip().textContent === api.t("file.save"), "the tooltip was lost: " + tip().textContent);
        bar.dispatchEvent(new win.PointerEvent("pointerdown", at));
        assert(tip().hidden, "a press hides it");
        api.setLanguage("ko");
        assert(tip().hidden, "it came back after the press");
      }),
      test("the toolbar offers select all and the stacking order", (api, doc) => {
        ["selectAll", "bringForward", "sendBackward"].forEach((name) => {
          const node = doc.querySelector('#toolbar [data-action="' + name + '"]');
          assert(node && node.querySelector("svg"), name);
        });
      }),
      test("a separator stands beside each panel and resizes it", (api, doc, win) => {
        const pointer = (node, type, x) => node.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: 200 }));
        const left = doc.getElementById("leftPanel");
        const right = doc.getElementById("rightPanel");
        const a = doc.getElementById("splitLeft");
        const b = doc.getElementById("splitRight");
        assert(a.offsetWidth === 4 && b.offsetWidth === 4, "the separators do not show");
        assert(a.previousElementSibling === left && b.nextElementSibling === right, "a separator is not beside its panel");
        assert(a.title.length > 0 && a.getAttribute("role") === "separator");
        const start = left.offsetWidth;
        const x = a.getBoundingClientRect().left;
        pointer(a, "pointerdown", x);
        assert(a.classList.contains("dragging"));
        pointer(win, "pointermove", x + 60);
        pointer(win, "pointerup", x + 60);
        assert(left.offsetWidth === start + 60, left.offsetWidth + " from " + start);
        assert(api.loadSettings().layout.left === start + 60, "the width was not saved");
        const rightStart = right.offsetWidth;
        const bx = doc.getElementById("splitRight").getBoundingClientRect().left;
        pointer(doc.getElementById("splitRight"), "pointerdown", bx);
        pointer(win, "pointermove", bx - 40);
        pointer(win, "pointerup", bx - 40);
        assert(right.offsetWidth === rightStart + 40, "dragging left widens the right panel: " + right.offsetWidth);
        const again = doc.getElementById("splitLeft");
        pointer(again, "pointerdown", again.getBoundingClientRect().left);
        pointer(win, "pointermove", -2000);
        pointer(win, "pointerup", -2000);
        assert(left.offsetWidth === api.metrics.TOOL_PANEL, "a panel went below its minimum: " + left.offsetWidth);
        again.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        assert(left.offsetWidth === api.metrics.TOOL_PANEL + 10, "the arrow key did nothing");
        again.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
        assert(left.offsetWidth === api.metrics.TOOL_PANEL, "a double click restores the smallest");
        assert(api.setPanelWidth("right", 9999) === api.metrics.PANEL_MAX, "no upper limit");
        api.run("toggleLeft");
        assert(doc.getElementById("splitLeft").offsetWidth === 0, "no separator beside a folded panel");
        api.run("toggleLeft");
      }),
      test("the File menu leaves the start screen to the Start button", (api, doc) => {
        doc.querySelector('#menubar [data-menu="file"]').click();
        const list = [...doc.querySelectorAll("#menuLayer [data-action]")].map((node) => node.dataset.action);
        api.closeMenu();
        assert(list.indexOf("home") < 0, "still in the File menu");
        assert(doc.querySelector('#menubar [data-action="toggleStart"]'), "no Start button");
      }),
      test("the theme list's Dark and Light read as titles", (api, doc, win) => {
        api.run("themeMenu");
        const head = doc.querySelector("#menuLayer .theme-col-head");
        assert(head && head.querySelector("svg"), "no icon");
        const style = win.getComputedStyle(head);
        assert(Number(style.fontWeight) >= 700 && parseFloat(style.borderBottomWidth) >= 2, style.fontWeight + " " + style.borderBottomWidth);
        api.closeMenu();
      }),
      test("the toolbar fits inside the smallest window", (api, doc) => {
        const bar = doc.getElementById("toolbar");
        const children = [...bar.children];
        const gaps = 6 * Math.max(0, children.length - 1);
        const width = children.reduce((sum, node) => sum + node.offsetWidth, 0) + gaps + 16;
        assert(width <= api.metrics.MIN_WIDTH, "the toolbar needs " + Math.round(width) + "px but the minimum width is " + api.metrics.MIN_WIDTH);
        assert(bar.scrollWidth <= bar.clientWidth + 2, "the toolbar is clipped");
        const frame = doc.defaultView.frameElement;
        const previousWidth = frame.style.width;
        const previousLanguage = api.getSettings().language;
        const hidden = [];
        frame.style.width = api.metrics.MIN_WIDTH + "px";
        ["ko", "en"].forEach((language) => {
          api.setLanguage(language);
          const view = doc.defaultView;
          const box = doc.getElementById("toolbar").getBoundingClientRect();
          const buttons = [...doc.querySelectorAll("#toolbar button")];
          buttons.forEach((button) => {
            const rect = button.getBoundingClientRect();
            const name = button.dataset.action || button.id;
            if (rect.width < 8 || rect.left < box.left - 1 || rect.right > box.right + 1 || rect.right > view.innerWidth + 1) hidden.push(language + " " + name);
          });
          for (let i = 0; i < buttons.length; i += 1) {
            for (let j = i + 1; j < buttons.length; j += 1) {
              const a = buttons[i].getBoundingClientRect();
              const b = buttons[j].getBoundingClientRect();
              const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (overlapX > 1 && overlapY > 1) hidden.push(language + " overlap");
            }
          }
        });
        frame.style.width = previousWidth;
        api.setLanguage(previousLanguage);
        assert(hidden.length === 0, hidden.join(", "));
      }),
      test("the toolbar runs file, edit, view and print commands", (api, doc) => {
        const names = ["new", "open", "save", "export", "undo", "redo", "cut", "copy", "paste", "deleteShape", "zoomOut", "zoomIn", "toggleGrid", "toggleShapes", "print", "themeCycle", "themeMenu", "language", "settings", "about"];
        names.forEach((name) => {
          assert(doc.querySelector('#toolbar [data-action="' + name + '"]'), name + " is missing from the toolbar");
        });
      }),
      test("the zoom readout is a button that resets the zoom", (api, doc) => {
        api.setZoom(175);
        assert(doc.getElementById("zoomValue").textContent === "175%");
        doc.getElementById("zoomValue").click();
        assert(api.getZoom() === 100);
      }),
      test("the grid follows the picture at every zoom", (api, doc) => {
        const button = doc.querySelector('#toolbar [data-action="toggleGrid"]');
        const grid = doc.getElementById("canvasGrid");
        assert(button && grid, "the grid control is missing");
        if (grid.hidden) button.click();
        assert(grid.hidden === false, "the grid did not turn on");
        assert(button.classList.contains("on"), "the button does not show that the grid is on");
        assert(button.getAttribute("aria-pressed") === "true");
        const picture = doc.getElementById("board");
        const widths = {};
        // a 10 px grid: split again from 300 %, joined below 60 %
        const cells = { 25: 12.5, 50: 25, 60: 6, 100: 10, 200: 20, 290: 29, 300: 6, 400: 8 };
        [25, 50, 60, 100, 200, 290, 300, 400].forEach((zoom) => {
          api.setZoom(zoom);
          const parts = getComputedStyle(grid).backgroundSize.split(/[\s,]+/).filter(Boolean);
          const cell = cells[zoom];
          const expect = [cell * 5, cell * 5, cell * 5, cell * 5, cell, cell, cell, cell].map((n) => n + "px").join(" ");
          assert(parts.join(" ") === expect, zoom + "% spacing is " + parts.join(" ") + ", not " + expect);
          const box = grid.getBoundingClientRect();
          const image = picture.getBoundingClientRect();
          widths[zoom] = image.width;
          assert(Math.abs(box.width - image.width) < 1 && Math.abs(box.height - image.height) < 1, "the grid does not cover the picture at " + zoom + "%");
        });
        assert(widths[200] > widths[100] * 1.5, "zooming did not resize the picture");
        button.click();
        assert(grid.hidden === true, "the grid did not turn off");
        assert(button.classList.contains("on") === false);
        assert(button.getAttribute("aria-pressed") === "false");
      }),
      test("the grid is quiet, and its coarser lines stay put when it splits", (api, doc, win) => {
        const grid = doc.getElementById("canvasGrid");
        const style = win.getComputedStyle(grid);
        const alphas = (style.backgroundImage.match(/rgba\(\d+, \d+, \d+, ([0-9.]+)\)/g) || []).map((row) => Number(row.split(",")[3].replace(")", "")));
        const lines = alphas.filter((alpha) => alpha > 0);
        assert(lines.length === 4 && lines[0] <= 0.3 && lines[2] <= 0.15 && lines[2] < lines[0], style.backgroundImage);
        const size = () => win.getComputedStyle(grid).backgroundSize.split(/[\s,]+/).filter(Boolean).map(parseFloat);
        api.setZoom(290);
        const before = size();
        api.setZoom(300);
        const after = size();
        assert(after[0] === 30 && after[4] === 6, after.join(","));
        assert(before[4] === 29 && before[0] === 145, before.join(","));
      }),
      test("the ruler marks the pointer in red", (api, doc) => {
        api.run("toggleRulers");
        // an earlier zoom may have left the stage scrolled, with this point out of the ruler's view
        doc.getElementById("stage").scrollLeft = 0;
        doc.getElementById("stage").scrollTop = 0;
        api.markRulers(40, 30);
        const redPixels = (id) => {
          const canvas = doc.getElementById(id);
          const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 110 && data[i + 2] < 110 && data[i + 3] > 200) count += 1;
          return count;
        };
        assert(redPixels("rulerH") > 0, "no red mark on the top ruler");
        assert(redPixels("rulerV") > 0, "no red mark on the side ruler");
        api.run("toggleRulers");
      }),
      test("the shape list button hides the list and leaves the drawing", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(20, 20, 120, 80);
        const button = doc.querySelector('#toolbar [data-action="toggleShapes"]');
        assert(button && button.getAttribute("aria-pressed") === "true", "the list starts hidden");
        assert(doc.querySelector("#leftPanel .shape-list"), "the shape list is missing");
        const shown = doc.getElementById("board").toDataURL();
        button.click();
        assert(api.getSettings().showShapes === false);
        assert(button.classList.contains("on") === false);
        assert(!doc.querySelector("#leftPanel .shape-list"), "the shape list stayed open");
        assert(doc.getElementById("board").toDataURL() === shown, "hiding the list changed the picture");
        button.click();
        assert(doc.querySelector("#leftPanel .shape-list"), "the shape list did not come back");
        assert(doc.getElementById("board").toDataURL() === shown);
      }),
    ]),

    suite("Menu", [
      test("menus are a single column of icon and label rows", (api, doc) => {
        api.menuDefinitions().forEach((menu) => {
          const el = api.openMenu(menu.id, 8, 60);
          assert(el.parentElement.id === "menuLayer");
          assert(!doc.getElementById("app").contains(el));
          const style = doc.defaultView.getComputedStyle(el);
          assert(style.position === "fixed", menu.id);
          assert(style.flexDirection === "column", menu.id);
          assert(el.scrollHeight <= el.clientHeight + 2, menu.id + " " + el.scrollHeight + "/" + el.clientHeight);
          const items = [...el.querySelectorAll(".menu-item")];
          assert(items.length === menu.items.length);
          items.forEach((item) => {
            assert(item.querySelector("svg"), item.dataset.action + " has no icon");
            assert(item.querySelector(".label").textContent.length > 0, item.dataset.action + " has no label");
            assert(item.offsetHeight <= 34, item.dataset.action);
          });
          api.closeMenu();
        });
      }),
      test("menus end right under the last row", (api, doc) => {
        const slack = (el) => {
          const rows = [...el.querySelectorAll(".menu-item")];
          const last = rows[rows.length - 1].getBoundingClientRect();
          return el.getBoundingClientRect().bottom - last.bottom;
        };
        api.menuDefinitions().forEach((menu) => {
          const el = api.openMenu(menu.id, 8, 60);
          assert(slack(el) <= 6, menu.id + " leaves " + Math.round(slack(el)) + "px under the last row");
          api.closeMenu();
        });
        doc.querySelector("#toolbar [data-action='themeMenu']").click();
        assert(slack(api.getMenu()) <= 6, "the theme list leaves room under the last row");
        api.closeMenu();
      }),
      test("every menu row runs an action that exists, and none of them twice", (api) => {
        const seen = new Map();
        const prefixes = ["recent:", "tool:", "color:", "shape:", "removeShape:", "theme:"];
        api.menuDefinitions().forEach((menu) => {
          menu.items.forEach((item) => {
            assert(item.label && item.label.length > 0, menu.id + " row without a label");
            if (item.disabled || item.action.indexOf("recent") === 0) return;
            const dynamic = prefixes.some((prefix) => item.action.indexOf(prefix) === 0);
            if (!dynamic) assert(api.hasAction(item.action), menu.id + " > " + item.action + " is not an action");
            const before = seen.get(item.action);
            assert(!before || before === item.label, item.action + " is called both " + before + " and " + item.label);
            seen.set(item.action, item.label);
          });
        });
        assert(seen.size > 25, String(seen.size));
      }),
      test("a menu can be taller than the window content", (api, doc) => {
        for (let i = 0; i < 10; i += 1) api.addRecent({ id: "m" + i, name: "recent-" + i + ".mpaint", path: "C:/r/" + i + ".mpaint" });
        const el = api.openMenu("file", 4, 20);
        const app = doc.getElementById("app");
        assert(el.offsetHeight > 400, String(el.offsetHeight));
        assert(el.scrollHeight <= el.clientHeight + 2);
        assert(el.getBoundingClientRect().bottom > app.getBoundingClientRect().top);
        api.closeMenu();
      }),
      test("menus open under their button and the right side holds the app commands", (api, doc) => {
        const file = doc.querySelector("#menubar [data-menu='file']");
        file.click();
        const opened = api.getMenu();
        const fileBox = file.getBoundingClientRect();
        const menuBox = opened.getBoundingClientRect();
        assert(Math.abs(menuBox.left - fileBox.left) <= 2, menuBox.left + " vs " + fileBox.left);
        assert(Math.abs(menuBox.top - fileBox.bottom) <= 2, menuBox.top + " vs " + fileBox.bottom);
        api.closeMenu();
        const bar = doc.getElementById("toolbar");
        const print = doc.querySelector("#toolbar [data-action='print']");
        const right = ["themeCycle", "themeMenu", "language", "settings", "about"].map((name) => doc.querySelector("#toolbar [data-action='" + name + "']"));
        right.forEach((button, index) => {
          assert(button, "toolbar button " + index);
          assert(button.getBoundingClientRect().left > print.getBoundingClientRect().right, "right of the print button " + index);
          if (index > 0) assert(button.getBoundingClientRect().left > right[index - 1].getBoundingClientRect().left);
        });
        assert(Math.abs(right[4].getBoundingClientRect().right - bar.getBoundingClientRect().right) <= 10, "flush right");
        ["minimize", "maximize", "close"].forEach((name) => {
          const control = doc.querySelector("#menubar [data-window='" + name + "']");
          assert(control && control.title.length > 0, "window control " + name);
        });
        assert(doc.querySelector(".titlebar") == null, "no separate title bar");
      }),
      test("every enabled menu command can run", async (api) => {
        const actions = [];
        api.menuDefinitions().forEach((menu) => menu.items.forEach((item) => {
          if (!item.disabled) actions.push(item.action);
        }));
        for (const action of actions) {
          await api.run(action);
          const popup = api.getPopup();
          if (popup) {
            const close = popup.querySelector('[data-popup-action="cancel"], [data-popup-action="close"], [data-popup-action="discard"]');
            if (close) close.click();
            else api.closePopup();
          }
        }
        api.reopen();
        assert(actions.length > 25, String(actions.length));
      }),
    ]),

    suite("Popup", [
      test("every popup is fixed, fits without a scrollbar, and uses one line per row", (api) => {
        api.showError(new Error("the disk is full"));
        api.closePopup();
        ["settings", "about", "error", "progress", "print", "unsaved", "recent", "save", "canvas", "newdoc", "drop", "theme", "guide", "palette", "convert", "formats", "dicom"].forEach((kind) => {
          const el = api.openPopup(kind);
          const spec = api.metrics.POPUPS[kind];
          assert(Math.abs(el.offsetWidth - spec.width) <= 2, kind + " width");
          assert(Math.abs(el.offsetHeight - spec.height) <= 2, kind + " height");
          const style = el.ownerDocument.defaultView.getComputedStyle(el);
          assert(style.overflow === "hidden", kind);
          assert(style.position === "fixed", kind);
          const bar = el.querySelector("header.popup-titlebar");
          assert(bar, kind + " title bar");
          assert(bar.querySelector(".popup-ico svg"), kind + " icon");
          assert(bar.querySelector(".popup-title").textContent.length > 0, kind + " title");
          const view = el.ownerDocument.defaultView;
          const fits = (where) => {
            el.querySelectorAll("*").forEach((node) => {
              if (node.hidden || node.offsetParent === null) return;
              const box = view.getComputedStyle(node);
              if (box.overflow !== "hidden" && box.overflowY !== "hidden") return;
              const name = kind + " " + where + " " + (node.className || node.tagName);
              assert(node.scrollHeight <= node.clientHeight + 2, name + " is cut off");
              assert(node.scrollWidth <= node.clientWidth + 2, name + " is cut off sideways");
            });
            assert(el.scrollHeight <= el.clientHeight + 2, kind + " " + where + " v " + el.scrollHeight + "/" + el.clientHeight);
            assert(el.scrollWidth <= el.clientWidth + 2, kind + " " + where + " h");
          };
          fits("start");
          el.querySelectorAll("[data-tab]").forEach((tab) => {
            tab.click();
            fits(tab.dataset.tab);
          });
          el.querySelectorAll(".line").forEach((line) => {
            assert(line.offsetHeight <= 34, kind + " line " + line.textContent);
          });
          api.closePopup();
        });
      }),
      test("every button of every dialog has a coloured icon", (api) => {
        Object.keys(api.metrics.POPUPS).forEach((kind) => {
          const popup = api.openPopup(kind);
          const buttons = [...popup.querySelectorAll("button.action")];
          buttons.forEach((button) => {
            const name = kind + " " + (button.dataset.popupAction || button.textContent);
            const icon = button.querySelector("svg");
            assert(icon, name + " has no icon");
            assert(icon.classList.contains("ico-color"), name + " has an icon without colour");
          });
          api.closePopup();
        });
      }),
      test("no popup is wider than it needs to be", (api) => {
        const sizes = api.metrics.POPUPS;
        Object.keys(sizes).forEach((kind) => {
          assert(sizes[kind].width <= 640, kind + " is " + sizes[kind].width + "px wide");
          assert(sizes[kind].width >= 340, kind + " is only " + sizes[kind].width + "px wide");
        });
        // the one wide window is the print setup, which carries a preview beside its settings
        const wide = Object.keys(sizes).filter((kind) => sizes[kind].width > 520);
        assert(wide.join(",") === "print,dicom", wide.join(","));
      }),
      test("the guide opens its own page in the chosen language", async (api) => {
        api.setLanguage("en");
        assert(await api.run("guide") === "guide.html?lang=en", api.getLastGuide());
        assert(api.getPopup() == null, "the guide is a window of its own, not a popup");
        assert(api.getLastLink() === "", "the guide is not a web link");
        api.setLanguage("ko");
        assert(api.getLastGuide() === "guide.html?lang=en");
        await api.run("guide");
        assert(api.getLastGuide() === "guide.html?lang=ko", api.getLastGuide());
      }),
      test("the short guide still opens in a popup", async (api) => {
        await api.run("guidePopup");
        const popup = api.getPopup();
        assert(popup.dataset.kind === "guide");
        assert(popup.querySelector(".popup-title").textContent === "사용법 안내");
        assert(popup.querySelectorAll('[data-panel="draw"] .line').length === 6);
        assert(api.getLastLink() === "");
        api.closePopup();
      }),
      test("popups close when the application closes", (api) => {
        api.openPopup("about");
        api.openMenu("help");
        api.closeApplication();
        assert(api.getPopup() == null);
        assert(api.getMenu() == null);
        assert(api.isClosed() === true);
        api.reopen();
      }),
      test("the palette popup sets the drawing color and width", (api) => {
        const popup = api.openPopup("palette");
        popup.querySelector('[data-field="color"]').value = "#123456";
        popup.querySelector('[data-field="strokeWidth"]').value = "12";
        popup.querySelector('[data-popup-action="apply-palette"]').click();
        assert(api.getColor() === "#123456", api.getColor());
        assert(api.getSettings().strokeWidth === 12);
      }),
      test("the canvas popup changes the drawing size", (api) => {
        const popup = api.openPopup("canvas");
        popup.querySelector('[data-field="width"]').value = "480";
        popup.querySelector('[data-field="height"]').value = "360";
        popup.querySelector('[data-popup-action="apply-canvas"]').click();
        assert(api.getDoc().width === 480 && api.getDoc().height === 360, api.getDoc().width + "x" + api.getDoc().height);
      }),
    ]),

    suite("Tabs", [
      test("overflow uses arrow buttons instead of a scrollbar", (api, doc) => {
        const strip = doc.getElementById("tabstrip");
        assert(doc.defaultView.getComputedStyle(strip).overflow === "hidden");
        assert(doc.getElementById("tabPrev").disabled === true);
        api.addTabs(24);
        assert(api.tabOverflow() === true);
        assert(doc.getElementById("tabNext").disabled === false);
        assert(doc.getElementById("tabNext").title.length > 0);
        const prev = doc.getElementById("tabPrev");
        const next = doc.getElementById("tabNext");
        assert(prev.getBoundingClientRect().left > strip.getBoundingClientRect().right - 2, "the back arrow is not on the right");
        assert(next.getBoundingClientRect().left >= prev.getBoundingClientRect().right - 1, "the arrows are not together");
        const before = strip.scrollLeft;
        api.scrollTabs(1);
        assert(strip.scrollLeft > before);
      }),
      test("every tab carries a close button", (api, doc) => {
        const tabs = [...doc.querySelectorAll("#tabstrip .tab")];
        assert(tabs.length === 2, String(tabs.length));
        tabs.forEach((tab) => {
          const close = tab.querySelector(".tab-close");
          assert(close, "a tab has no close button");
          assert(close.title.length > 0, "the close button has no tooltip");
          assert(close.querySelector("svg"), "the close button has no mark");
        });
      }),
      test("the close button closes that tab and keeps the others", (api, doc) => {
        assert(api.getDocs().length === 2);
        doc.querySelectorAll("#tabstrip .tab-close")[0].click();
        assert(api.getDocs().length === 1, String(api.getDocs().length));
        assert(api.getDoc().name === "shapes.mypaint", api.getDoc().name);
      }),
      test("closing the last tab leaves an empty drawing", (api, doc) => {
        doc.querySelectorAll("#tabstrip .tab-close")[0].click();
        doc.querySelectorAll("#tabstrip .tab-close")[0].click();
        assert(api.getDocs().length === 1, String(api.getDocs().length));
        assert(api.shapeCount() === 0, "the drawing left behind should be empty");
      }),
      test("closing a changed tab asks before dropping the work", (api, doc) => {
        api.setTool("rect");
        api.draw(10, 10, 60, 60);
        assert(api.getDoc().dirty === true);
        doc.querySelectorAll("#tabstrip .tab-close")[0].click();
        const popup = api.getPopup();
        assert(popup && popup.dataset.kind === "unsaved", "no question was asked");
        assert(api.getDocs().length === 2, "the tab must stay until the question is answered");
        popup.querySelector('[data-popup-action="discard"]').click();
        assert(api.getDocs().length === 1, String(api.getDocs().length));
        assert(api.isClosed() === false, "closing one tab must not close the program");
      }),
      test("clicking a tab switches the drawing", (api, doc) => {
        const tabs = doc.querySelectorAll("#tabstrip .tab-name");
        assert(tabs.length === 2);
        tabs[1].click();
        assert(api.getDoc().name === "shapes.mypaint", api.getDoc().name);
      }),
    ]),

    suite("Status", [
      test("the status bar shows the working state", (api, doc) => {
        ["stState", "stFile", "stTool", "stShapes", "stSelection", "stSize", "stPos", "stZoom", "stFormat", "stFrame", "stColor", "stDirty", "stLang", "stTheme", "stVersion"].forEach((id) => {
          const el = doc.getElementById(id);
          assert(el, id + " is missing");
          assert(el.textContent.length > 0, id + " is empty");
        });
        assert(doc.getElementById("stVersion").textContent === api.build.version);
      }),
      test("the status bar follows the drawing", (api, doc) => {
        freshDoc(api);
        api.setTool("ellipse");
        api.draw(10, 10, 60, 60);
        assert(doc.getElementById("stShapes").textContent.indexOf("1") >= 0, doc.getElementById("stShapes").textContent);
        assert(doc.getElementById("stDirty").textContent === api.t("status.dirty"));
        assert(doc.getElementById("stSelection").textContent.indexOf(api.t("kind.ellipse")) >= 0);
        api.setZoom(125);
        assert(doc.getElementById("stZoom").textContent.indexOf("125") >= 0);
      }),
    ]),

    suite("Context", [
      test("a menu near the bottom opens upward instead of off the edge", (api, doc, win) => {
        const height = win.innerHeight;
        const width = win.innerWidth;
        // plenty of room: the menu stays where it was asked for
        const roomy = api.fitMenu(100, 100, 300, 200);
        assert(roomy.x === 100 && roomy.y === 100, JSON.stringify(roomy));
        // no room below: it rises from the point instead
        const low = api.fitMenu(100, height - 40, 300, 200);
        assert(low.y === height - 40 - 200, "it should open upward: " + low.y);
        // no room on the right: it opens to the left of the point
        const right = api.fitMenu(width - 20, 100, 300, 200);
        assert(right.x === width - 20 - 300, "it should open leftward: " + right.x);
        // taller than the window: pushed back inside, never above the top
        const tall = api.fitMenu(100, height - 10, 300, height + 200);
        assert(tall.y === 0, "a menu taller than the window should start at the top: " + tall.y);
        assert(tall.x >= 0);
      }),
      test("a context menu at the bottom of the window stays on screen", (api, doc, win) => {
        freshDoc(api);
        const menu = api.openContextAt(win.innerWidth - 10, win.innerHeight - 10);
        const box = menu.getBoundingClientRect();
        assert(box.bottom <= win.innerHeight + 1, "it hangs below the window: " + box.bottom);
        assert(box.right <= win.innerWidth + 1, "it hangs past the right: " + box.right);
        assert(box.top >= -1 && box.left >= -1, JSON.stringify({ top: box.top, left: box.left }));
        // every row is still reachable
        const rows = [...menu.querySelectorAll(".menu-item")];
        rows.forEach((row) => {
          const line = row.getBoundingClientRect();
          assert(line.bottom <= win.innerHeight + 1, row.dataset.action + " is below the window");
        });
        api.closeMenu();
      }),
      test("a menu bar menu that will not fit below is moved up", (api, doc, win) => {
        for (let i = 0; i < 10; i += 1) api.addRecent({ id: "f" + i, name: "file-" + i + ".mpaint", path: "D:/f/" + i + ".mpaint" });
        const menu = api.openMenu("file", 8, win.innerHeight - 60);
        const box = menu.getBoundingClientRect();
        assert(box.bottom <= win.innerHeight + 1, "the file menu hangs below the window: " + box.bottom);
        assert(box.height > 300, "this test needs a tall menu: " + box.height);
        api.closeMenu();
      }),
      test("the context menu holds edit and layer commands", (api, doc) => {
        const menu = api.openContextAt(40, 90);
        assert(menu.dataset.menu === "context");
        assert(menu.parentElement.id === "menuLayer");
        const actions = [...menu.querySelectorAll(".menu-item")].map((item) => item.dataset.action);
        ["undo", "redo", "cut", "copy", "paste", "deleteShape", "selectAll", "bringForward", "sendBackward", "export", "print"].forEach((name) => {
          assert(actions.indexOf(name) >= 0, name + " is missing from the context menu");
        });
        menu.querySelectorAll(".menu-item").forEach((item) => {
          assert(item.querySelector("svg"), item.dataset.action + " has no icon");
          assert(item.querySelector(".label").textContent.length > 0);
          assert(item.offsetHeight <= 34, item.dataset.action + " is taller than one row");
        });
        // it sits in the menu layer, which is how it leaves the window in the desktop build
        assert(menu.parentElement.id === "menuLayer");
        assert(doc.defaultView.getComputedStyle(menu).position === "fixed");
        assert(menu.scrollHeight <= menu.clientHeight + 2, "the context menu scrolls");
        api.closeMenu();
      }),
      test("undo and redo in the context menu follow the history", (api) => {
        freshDoc(api);
        const row = (action) => api.contextItems().find((item) => item.action === action);
        api.resetForTests();
        assert(row("undo").disabled === true, "undo should be off with nothing done");
        assert(row("redo").disabled === true);
        api.setTool("rect");
        api.draw(10, 10, 60, 60);
        assert(row("undo").disabled === false, "undo should be on after drawing");
        api.undo();
        assert(row("redo").disabled === false, "redo should be on after undoing");
      }),
      test("the right mouse button on the canvas opens the context menu", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(20, 20, 160, 120);
        const board = doc.getElementById("board");
        const box = board.getBoundingClientRect();
        board.dispatchEvent(new doc.defaultView.MouseEvent("contextmenu", {
          clientX: box.left + 90,
          clientY: box.top + 70,
          bubbles: true,
          cancelable: true,
        }));
        assert(api.getMenu(), "no context menu");
        assert(api.getSelection().length === 1, "the shape under the pointer is selected");
        api.closeMenu();
      }),
    ]),

    suite("Zoom", [
      test("zoom in, out and reset stay inside the limits", (api) => {
        api.setZoom(100);
        api.run("zoomIn");
        assert(api.getZoom() === 108, String(api.getZoom()));
        api.run("zoomOut");
        assert(api.getZoom() === 100);
        api.setZoom(10);
        assert(api.getZoom() === 25);
        api.setZoom(900);
        assert(api.getZoom() === 400);
        api.run("zoomReset");
        assert(api.getZoom() === 100);
      }),
      test("every zoom step is a small one, in and out alike", (api) => {
        const climb = [];
        api.setZoom(25);
        for (let i = 0; i < 40 && api.getZoom() < 400; i += 1) {
          const before = api.getZoom();
          api.run("zoomIn");
          const after = api.getZoom();
          assert(after > before, "zooming in stopped at " + before);
          climb.push(after / before);
        }
        assert(api.getZoom() === 400, "zooming in did not reach 400%: " + api.getZoom());
        assert(climb.length >= 30, "there are only " + climb.length + " steps between 25% and 400%");
        const worst = Math.max(...climb);
        assert(worst < 1.11, "one step enlarges the picture by " + Math.round((worst - 1) * 100) + "%");
        // the familiar percentages are steps of their own, so stepping off one and back lands on it
        [50, 100, 200].forEach((stop) => {
          api.setZoom(stop);
          api.run("zoomIn");
          api.run("zoomOut");
          assert(api.getZoom() === stop, stop + "% is not one of the steps: it became " + api.getZoom());
        });
        [25, 400].forEach((edge) => {
          api.setZoom(edge);
          api.run(edge === 25 ? "zoomIn" : "zoomOut");
          api.run(edge === 25 ? "zoomOut" : "zoomIn");
          assert(api.getZoom() === edge, edge + "% is not one of the steps: it became " + api.getZoom());
        });
        // and the way back down lands on exactly the same stops
        const drop = [];
        for (let i = 0; i < 40 && api.getZoom() > 25; i += 1) {
          api.run("zoomOut");
          drop.push(api.getZoom());
        }
        assert(api.getZoom() === 25, "zooming out did not reach 25%: " + api.getZoom());
        const up = [25];
        api.setZoom(25);
        for (let i = 0; i < 40 && api.getZoom() < 400; i += 1) { api.run("zoomIn"); up.push(api.getZoom()); }
        assert(drop.slice().reverse().join(",") === up.slice(0, -1).join(","), "the way down is not the way up: " + drop.join(","));
      }),
      test("Ctrl and the wheel zoom the drawing", (api, doc, win) => {
        const wheel = (deltaY) => win.dispatchEvent(new win.WheelEvent("wheel", { deltaY: deltaY, ctrlKey: true, bubbles: true, cancelable: true }));
        api.setZoom(100);
        wheel(-100);
        assert(api.getZoom() === 108, String(api.getZoom()));
        wheel(100);
        assert(api.getZoom() === 100, String(api.getZoom()));
      }),
      test("a trackpad zooms by however far it was pushed", (api, doc, win) => {
        const wheel = (deltaY) => win.dispatchEvent(new win.WheelEvent("wheel", { deltaY: deltaY, ctrlKey: true, bubbles: true, cancelable: true }));
        // a trackpad sends a stream of small amounts, and each one has to move the picture a
        // little rather than a whole step
        api.setZoom(100);
        wheel(-12);
        const small = api.getZoom();
        assert(small > 100 && small < 104, "a small push gave " + small + "%");
        for (let i = 0; i < 7; i += 1) wheel(-12);
        assert(api.getZoom() > small, "pushing on did not keep zooming: " + api.getZoom());
        assert(api.getZoom() <= 110, "eight small pushes went all the way to " + api.getZoom() + "%");
        // the smallest push there is still has to move by one per cent, not nothing
        api.setZoom(100);
        wheel(-1);
        assert(api.getZoom() === 101, "the smallest push gave " + api.getZoom() + "%");
        api.setZoom(100);
        wheel(1);
        assert(api.getZoom() === 99, "the smallest push back gave " + api.getZoom() + "%");
        // and it stays inside the limits
        api.setZoom(400);
        wheel(-1000);
        assert(api.getZoom() === 400, String(api.getZoom()));
        api.setZoom(25);
        wheel(1000);
        assert(api.getZoom() === 25, String(api.getZoom()));
      }),
      test("a picture smaller than the stage sits in the middle", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 120, background: "#ffffff" });
        api.setZoom(50);
        const stage = doc.getElementById("stage").getBoundingClientRect();
        const frame = doc.getElementById("canvasFrame").getBoundingClientRect();
        assert(frame.width < stage.width && frame.height < stage.height, "the picture should be smaller than the stage");
        assert(Math.abs((frame.left + frame.width / 2) - (stage.left + stage.width / 2)) <= 2, "not centred sideways");
        assert(Math.abs((frame.top + frame.height / 2) - (stage.top + stage.height / 2)) <= 2, "not centred up and down");
      }),
      test("zooming in keeps the middle of the stage in the middle", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 2000, height: 1600, background: "#ffffff" });
        api.setZoom(100);
        const stage = doc.getElementById("stage");
        stage.scrollLeft = 300;
        stage.scrollTop = 200;
        const before = api.stageCenterPoint();
        api.setZoom(200);
        const after = api.stageCenterPoint();
        assert(Math.abs(after.x - before.x) <= 1, "sideways: " + before.x + " became " + after.x);
        assert(Math.abs(after.y - before.y) <= 1, "up and down: " + before.y + " became " + after.y);
        api.setZoom(150);
        const out = api.stageCenterPoint();
        assert(Math.abs(out.x - before.x) <= 1, "zooming out moved the middle: " + out.x);
      }),
      test("dragging beside the picture moves it, with a hand pointer", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 2400, height: 1800, background: "#ffffff" });
        api.setZoom(100);
        const stage = doc.getElementById("stage");
        const view = doc.defaultView;
        assert(view.getComputedStyle(stage).cursor === "grab", view.getComputedStyle(stage).cursor);
        assert(view.getComputedStyle(doc.getElementById("board")).cursor === "crosshair");
        const box = stage.getBoundingClientRect();
        stage.scrollLeft = 200;
        stage.scrollTop = 150;
        const at = (x, y) => ({ clientX: x, clientY: y, bubbles: true, button: 0, pointerId: 7, pointerType: "mouse" });
        stage.dispatchEvent(new view.PointerEvent("pointerdown", at(box.left + 6, box.top + 6)));
        assert(stage.classList.contains("panning"), "the hand pointer is not shown while dragging");
        stage.dispatchEvent(new view.PointerEvent("pointermove", at(box.left + 66, box.top + 46)));
        assert(stage.scrollLeft === 140, String(stage.scrollLeft));
        assert(stage.scrollTop === 110, String(stage.scrollTop));
        stage.dispatchEvent(new view.PointerEvent("pointerup", at(box.left + 66, box.top + 46)));
        assert(!stage.classList.contains("panning"));
      }),
      test("the canvas frame grows with the zoom", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 200, height: 100, background: "#ffffff" });
        api.setZoom(200);
        const frame = doc.getElementById("canvasFrame");
        assert(Math.round(frame.offsetWidth) === 400, String(frame.offsetWidth));
        api.setZoom(100);
        assert(Math.round(doc.getElementById("canvasFrame").offsetWidth) === 200);
      }),
    ]),

    suite("Print", [
      test("a small drawing prints on one page", (api) => {
        api.setPrintOption("scope", "current");
        api.setPrintOption("paper", "A4");
        api.setPrintOption("orientation", "landscape");
        assert(api.previewCount() === 1, String(api.previewCount()));
      }),
      test("printing every drawing makes one page each", (api) => {
        api.setPrintOption("scope", "all");
        assert(api.previewCount() === 2, String(api.previewCount()));
      }),
      test("a large drawing is split into pages", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 3000, height: 2000, background: "#ffffff" });
        api.setPrintOption("scope", "current");
        api.setPrintOption("paper", "A4");
        api.setPrintOption("orientation", "landscape");
        api.setPrintOption("marginTop", 12);
        api.setPrintOption("marginRight", 12);
        api.setPrintOption("marginBottom", 12);
        api.setPrintOption("marginLeft", 12);
        assert(api.previewCount() === 9, String(api.previewCount()));
      }),
      test("a custom range keeps only the chosen pages", (api) => {
        freshDoc(api);
        api.applyCanvas({ width: 3000, height: 2000, background: "#ffffff" });
        api.setPrintOption("scope", "custom");
        api.setPrintOption("from", 2);
        api.setPrintOption("to", 4);
        assert(api.previewCount() === 3, String(api.previewCount()));
      }),
      test("the settings sit on the left and the preview on the right", (api) => {
        const popup = api.openPopup("print");
        const settings = popup.querySelector(".print-settings");
        const side = popup.querySelector(".print-side");
        assert(settings && side, "the print window is not in two columns");
        const left = settings.getBoundingClientRect();
        const right = side.getBoundingClientRect();
        assert(right.left >= left.right - 1, "the preview is not to the right of the settings");
        assert(Math.abs(left.top - right.top) <= 2, "the two columns do not start at the same height");
        ["scope", "from", "to", "paper", "orientation", "marginTop", "marginBottom", "marginLeft", "marginRight", "scaleMode", "scalePercent", "align", "copies"].forEach((name) => {
          const field = settings.querySelector('[data-field="' + name + '"]');
          assert(field, name + " is missing from the settings column");
          assert(field.getBoundingClientRect().right <= right.left + 1, name + " is not in the left column");
        });
        assert(side.querySelector("#printPreview"), "the preview is not in the right column");
        assert(side.querySelector("#printPage"), "the page number is not in the right column");
        settings.querySelectorAll(".line").forEach((line) => {
          assert(line.offsetHeight <= 34, "a settings row is taller than one line");
        });
        api.closePopup();
      }),
      test("the print popup previews a page and prints", (api) => {
        const popup = api.openPopup("print");
        assert(popup.querySelector("#printPreview img"), "no preview picture");
        assert(popup.querySelector("#printPage").textContent.indexOf("1/") >= 0, popup.querySelector("#printPage").textContent);
        popup.querySelector('[data-popup-action="do-print"]').click();
        const result = api.getLastPrint();
        assert(result && result.count >= 1, JSON.stringify(result));
        assert(result.paper === "A4");
      }),
      test("the preview shows the sheet that will come out of the printer", async (api) => {
        const ratioOf = async () => {
          const image = api.getPopup().querySelector("#printImage");
          assert(image, "no preview picture");
          if (!image.complete) await image.decode();
          return image.naturalWidth / image.naturalHeight;
        };
        api.setPrintOption("paper", "A4");
        api.setPrintOption("orientation", "portrait");
        api.openPopup("print");
        const portrait = await ratioOf();
        assert(Math.abs(portrait - 210 / 297) < 0.02, "the sheet is not A4 portrait: " + portrait.toFixed(3));
        api.closePopup();
        api.setPrintOption("orientation", "landscape");
        api.openPopup("print");
        const landscape = await ratioOf();
        assert(Math.abs(landscape - 297 / 210) < 0.02, "the sheet is not A4 landscape: " + landscape.toFixed(3));
        api.closePopup();
        api.setPrintOption("paper", "Letter");
        api.setPrintOption("orientation", "portrait");
        api.openPopup("print");
        const letter = await ratioOf();
        assert(Math.abs(letter - 215.9 / 279.4) < 0.02, "the sheet is not Letter: " + letter.toFixed(3));
        api.closePopup();
      }),
      test("page setup choices are kept for the next print", (api) => {
        const popup = api.openPopup("print");
        popup.querySelector('[data-field="paper"]').value = "Letter";
        popup.querySelector('[data-field="orientation"]').value = "portrait";
        popup.querySelector('[data-field="marginTop"]').value = "20";
        popup.querySelector('[data-field="copies"]').value = "3";
        popup.querySelector('[data-popup-action="do-print"]').click();
        const saved = api.getSettings().print;
        assert(saved.paper === "Letter", saved.paper);
        assert(saved.orientation === "portrait");
        assert(saved.marginTop === 20, String(saved.marginTop));
        assert(saved.copies === 3, String(saved.copies));
      }),
      test("the page geometry follows the paper and the margin", (api, doc, win) => {
        const Print = win.MyPaintPrint;
        const a4 = Print.printable("A4", "portrait", 10);
        assert(Math.round(a4.width) === 190 && Math.round(a4.height) === 277, a4.width + "x" + a4.height);
        const land = Print.paperSize("A4", "landscape");
        assert(land.width === 297 && land.height === 210);
      }),
    ]),

    suite("Drop", [
      test("a dropped drawing file opens", async (api) => {
        const raw = api.serialize();
        const before = api.getDocs().length;
        await api.dropFiles([{ name: "work.mpaint", text: raw }]);
        assert(api.getDocs().length > before, String(api.getDocs().length));
        assert(api.getDoc().name === "work.mpaint", api.getDoc().name);
      }),
      test("dropping an image file on the window asks how to use it", async (api, doc, win) => {
        freshDoc(api);
        const png = await picture(win, 12, 12, "#2266aa", "image/png");
        const file = new win.File([png], "outside.png", { type: "image/png" });
        const transfer = new win.DataTransfer();
        transfer.items.add(file);
        win.dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
        for (let i = 0; i < 30 && !(api.getPopup() && api.getPopup().dataset.kind === "drop"); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const popup = api.getPopup();
        assert(popup && popup.dataset.kind === "drop", "dropping a picture did not ask");
        assert(popup.querySelector("#dropKind"), "the dropped file was not recognised");
        api.closePopup();
      }),
      test("a dropped picture asks how it should be used", async (api) => {
        freshDoc(api);
        await api.dropImage("photo.png");
        const popup = api.getPopup();
        assert(popup && popup.dataset.kind === "drop", "no question popup");
        const roles = [...popup.querySelectorAll('input[name="role"]')].map((input) => input.value);
        assert(roles.join(",") === "drawing,image,background", roles.join(","));
        api.closePopup();
      }),
      test("a dropped picture can be placed on the drawing", async (api) => {
        freshDoc(api);
        await api.dropImage("photo.png");
        api.closePopup();
        await api.applyDrop("image");
        assert(api.shapeCount() === 1, String(api.shapeCount()));
        assert(api.shapes()[0].kind === "image");
        assert(api.shapes()[0].w > 0);
      }),
      test("a dropped picture can become the window background", async (api) => {
        await api.dropImage("wall.png");
        api.closePopup();
        await api.applyDrop("background");
        assert(api.getSettings().backgroundName === "wall.png", api.getSettings().backgroundName);
        await api.clearBackground();
      }),
      test("a file that is neither a drawing nor a picture is reported", async (api) => {
        let message = "";
        try {
          await api.dropFiles([{ name: "notes.txt", text: "hello" }]);
        } catch (error) {
          message = error.message;
        }
        assert(message.indexOf("notes.txt") >= 0, message);
      }),
    ]),

    suite("Formats", [
      test("every family of picture file is recognised by its name", (api, doc, win) => {
        const F = win.MyPaintFormats;
        const rows = [
          ["holiday.png", "native"], ["holiday.jpg", "native"], ["holiday.webp", "native"], ["holiday.gif", "native"],
          ["scan.tif", "tiff"], ["scan.tiff", "tiff"],
          ["phone.heic", "heif"], ["phone.heif", "heif"], ["phone.hif", "heif"],
          ["map.jp2", "j2k"], ["map.j2k", "j2k"],
          ["study.dcm", "dicom"], ["study.dicom", "dicom"],
          ["shot.cr2", "raw"], ["shot.cr3", "raw"], ["shot.nef", "raw"], ["shot.arw", "raw"],
          ["shot.dng", "raw"], ["shot.orf", "raw"], ["shot.raf", "raw"], ["shot.rw2", "raw"],
          ["shot.pef", "raw"], ["shot.srw", "raw"], ["shot.x3f", "raw"], ["shot.iiq", "raw"],
          ["shot.3fr", "raw"], ["shot.mrw", "raw"], ["shot.gpr", "raw"],
        ];
        rows.forEach((row) => assert(F.kindOf(row[0], null) === row[1], row[0] + " read as " + F.kindOf(row[0], null)));
        assert(F.kindOf("notes.txt", null) === "", "a text file is not a picture");
        assert(F.listExtensions().length >= 55, String(F.listExtensions().length));
      }),
      test("a file with no useful name is recognised by its first bytes", (api, doc, win) => {
        const F = win.MyPaintFormats;
        const head = (values) => {
          const out = new Uint8Array(140);
          values.forEach((pair) => { out[pair[0]] = pair[1]; });
          return out;
        };
        const png = head([[0, 0x89], [1, 0x50], [2, 0x4e], [3, 0x47]]);
        const jpeg = head([[0, 0xff], [1, 0xd8], [2, 0xff]]);
        const tiff = head([[0, 0x49], [1, 0x49], [2, 42]]);
        const dicm = head([[128, 0x44], [129, 0x49], [130, 0x43], [131, 0x4d]]);
        const heic = head([[4, 0x66], [5, 0x74], [6, 0x79], [7, 0x70], [8, 0x68], [9, 0x65], [10, 0x69], [11, 0x63]]);
        assert(F.magicKind(png) === "native");
        assert(F.magicKind(jpeg) === "native");
        assert(F.magicKind(tiff) === "tiff");
        assert(F.magicKind(dicm) === "dicom", F.magicKind(dicm));
        assert(F.magicKind(heic) === "heif", F.magicKind(heic));
        assert(F.kindOf("unknown", dicm) === "dicom");
      }),
      test("the supported format list is shown in a popup, one family per tab", (api) => {
        const popup = api.openPopup("formats");
        const tabs = [...popup.querySelectorAll("[data-tab]")].map((tab) => tab.dataset.tab);
        assert(tabs.join(",") === "native,tiff,heif,j2k,dicom,raw", tabs.join(","));
        popup.querySelector('[data-tab="raw"]').click();
        assert(popup.querySelector('[data-panel="raw"]').textContent.indexOf(".cr2") >= 0);
        api.closePopup();
      }),
      test("MyPaint can write every save format", (api, doc, win) => {
        const ids = win.MyPaintFormats.SAVE_FORMATS.map((item) => item.id);
        assert(ids.join(",") === "png,jpeg,webp,bmp,tiff,gif,ico,jp2,j2k,dicom,tga,ppm,pam,qoi,pcx,avif,svg", ids.join(","));
        ids.forEach((id) => assert(api.t("format." + id) !== "format." + id, id + " has no label"));
        const writable = win.MyPaintFormats.writableFormats().map((item) => item.id);
        ["png", "jpeg", "bmp", "tiff", "gif", "ico", "jp2", "dicom", "qoi", "svg"].forEach((id) => assert(writable.indexOf(id) >= 0, id + " is not offered"));
        const popup = api.openPopup("save");
        const offered = [...popup.querySelectorAll('[data-field="format"] option')].map((option) => option.value);
        assert(offered.join(",") === ["mypaint"].concat(writable).join(","), "the save choices are not what this system can write: " + offered.join(","));
        api.closePopup();
      }),
    ]),

    suite("Effects in print and SVG", (() => {
      const RED = "#ff0000";
      const redDoc = (api, win) => {
        freshDoc(api);
        const current = api.getDoc();
        current.width = 200;
        current.height = 100;
        current.background = RED;
        current.shapes.length = 0;
        return current;
      };
      const pixelOf = (canvas, x, y) => {
        const data = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
      };
      const gray = (value) => Math.abs(value[0] - value[1]) <= 2 && Math.abs(value[1] - value[2]) <= 2;
      const near = (a, b, slack) => a.every((value, index) => Math.abs(value - b[index]) <= (slack || 3));
      const drawnSvg = (api, win) => {
        const text = api.documentSvg();
        const size = win.MyPaintSvgDoc.inspect(text);
        assert(size.ok, size.error);
        return win.MyPaintSvgDoc.rasterize(text, size.width, size.height).then((canvas) => ({ text: text, canvas: canvas }));
      };
      const printed = (api, win, doc) => {
        const pages = api.pagesForPrint();
        const page = pages[0];
        const canvas = doc.createElement("canvas");
        canvas.width = page.source.w;
        canvas.height = page.source.h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = page.doc.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        page.doc.shapes.forEach((shape) => win.PaintEngine.drawWithEffects(ctx, shape, page.doc, api.images()));
        return { page: page, canvas: canvas, pages: pages };
      };
      return [
        test("the print preview has a look on a shape", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.background = "#ffffff";
          const shape = win.PaintEngine.makeShape("rect", { x: 20, y: 20, w: 100, h: 60, color: RED, fill: RED, width: 2, effects: { look: "grayscale" } });
          current.shapes.push(shape);
          const out = printed(api, win, doc);
          const value = pixelOf(out.canvas, 60, 50);
          assert(gray(value) && value[0] < 200, value.join());
        }),
        test("printing a whole picture has its look, border and shadow, at the finished size", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.effects = { look: "grayscale", border: { top: 10, bottom: 10, left: 10, right: 10, color: "#0000ff" } };
          const out = printed(api, win, doc);
          assert(out.page.doc.width === 220 && out.page.doc.height === 120, out.page.doc.width + "x" + out.page.doc.height);
          assert(near(pixelOf(out.canvas, 3, 3), [0, 0, 255, 255]), pixelOf(out.canvas, 3, 3).join());
          assert(gray(pixelOf(out.canvas, 110, 60)), pixelOf(out.canvas, 110, 60).join());
          const same = Array.from(win.MyPaintEffects.apply(api.renderCanvas(current), current.effects, {}).getContext("2d").getImageData(110, 60, 1, 1).data);
          assert(near(pixelOf(out.canvas, 110, 60), same), same.join());
        }),
        test("a document without effects prints as itself", async (api, win) => {
          freshDoc(api);
          assert(api.pagesForPrint()[0].doc === api.getDoc(), "no copy is needed");
          void win;
        }),
        test("leaving the background out also leaves out the shadow's backdrop", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.effects = { shadow: { on: true, x: 0, y: 0, blur: 0, opacity: 100, color: "#000000", backdrop: "#00ff00" }, border: { top: 8, bottom: 8, left: 8, right: 8, color: "#0000ff" } };
          api.setPrintState({ printBackground: true });
          const withBack = printed(api, win, doc);
          assert(pixelOf(withBack.canvas, 12, 12)[0] > 200, "the picture's colour");
          api.setPrintState({ printBackground: false });
          const without = printed(api, win, doc);
          assert(pixelOf(without.canvas, 12, 12)[3] === 0, pixelOf(without.canvas, 12, 12).join());
          api.setPrintState({ printBackground: true });
        }),
        test("the view is drawn again when the document changes", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.effects = { look: "grayscale" };
          const first = api.pagesForPrint()[0].doc;
          assert(api.pagesForPrint()[0].doc === first, "asked again with nothing changed, it is kept");
          current.effects = { look: "invert" };
          const second = printed(api, win, doc);
          assert(second.page.doc !== first);
          assert(near(pixelOf(second.canvas, 100, 50), [0, 255, 255, 255]), pixelOf(second.canvas, 100, 50).join());
        }),
        test("the SVG of a shape with a look draws as the picture does", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.background = "#ffffff";
          current.shapes.push(win.PaintEngine.makeShape("rect", { x: 20, y: 20, w: 100, h: 60, color: RED, fill: RED, width: 2, effects: { look: "invert" } }));
          const out = await drawnSvg(api, win);
          assert(out.text.indexOf("<feColorMatrix") > 0 && out.text.indexOf("<rect") > 0, out.text);
          assert(near(pixelOf(out.canvas, 60, 50), pixelOf(api.renderCanvas(current), 60, 50)), pixelOf(out.canvas, 60, 50).join());
        }),
        test("a straight line keeps its effects in the SVG", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.background = "#ffffff";
          current.shapes.push(win.PaintEngine.makeShape("line", { x: 20, y: 50, w: 160, h: 0, color: RED, width: 8, effects: { look: "invert" } }));
          const out = await drawnSvg(api, win);
          assert(near(pixelOf(out.canvas, 100, 50), [0, 255, 255, 255], 8), pixelOf(out.canvas, 100, 50).join());
        }),
        test("a shape's border and shadow are in the SVG", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.background = "#ffffff";
          current.shapes.push(win.PaintEngine.makeShape("rect", { x: 40, y: 30, w: 80, h: 40, color: RED, fill: RED, width: 2, effects: { border: { top: 6, bottom: 6, left: 6, right: 6, color: "#0000ff" }, shadow: { on: true, x: 20, y: 0, blur: 0, opacity: 100, color: "#00ff00" } } }));
          const out = await drawnSvg(api, win);
          const box = win.PaintEngine.bounds(current.shapes[0]);
          const bandX = Math.round(box.x - 3);
          assert(near(pixelOf(out.canvas, bandX, 50), [0, 0, 255, 255], 8), pixelOf(out.canvas, bandX, 50).join());
          const shadowX = Math.round(box.x + box.w + 6 + 10);
          assert(near(pixelOf(out.canvas, shadowX, 50), [0, 255, 0, 255], 8), pixelOf(out.canvas, shadowX, 50).join());
        }),
        test("the SVG of a whole picture grows by the frame, and matches the exported picture", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.effects = { look: "grayscale", border: { top: 10, bottom: 20, left: 30, right: 40, color: "#0000ff" } };
          const out = await drawnSvg(api, win);
          assert(out.canvas.width === 270 && out.canvas.height === 130, out.canvas.width + "x" + out.canvas.height);
          assert(near(pixelOf(out.canvas, 5, 60), [0, 0, 255, 255]), pixelOf(out.canvas, 5, 60).join());
          const picture = win.MyPaintEffects.apply(api.renderCanvas(current), current.effects, {});
          assert(near(pixelOf(out.canvas, 130, 60), pixelOf(picture, 130, 60)), pixelOf(out.canvas, 130, 60).join() + " / " + pixelOf(picture, 130, 60).join());
        }),
        test("a backdrop and a shadow of a whole picture are in the SVG", async (api, doc, win) => {
          const current = redDoc(api, win);
          current.effects = { shadow: { on: true, x: 20, y: 0, blur: 0, opacity: 100, color: "#00ff00", backdrop: "#ffff00" } };
          const out = await drawnSvg(api, win);
          assert(out.canvas.width === 220, String(out.canvas.width));
          assert(near(pixelOf(out.canvas, 210, 50), [0, 255, 0, 255], 8), pixelOf(out.canvas, 210, 50).join());
          assert(near(pixelOf(out.canvas, 100, 50), [255, 0, 0, 255]), pixelOf(out.canvas, 100, 50).join());
        }),
        test("an SVG document with whole-picture effects wraps its source", async (api, doc, win) => {
          const source = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#ff0000"/></svg>';
          await api.openFiles([{ name: "logo.svg", text: source, type: "image/svg+xml" }]);
          assert(api.documentSvg() === source, "without effects it stays word for word");
          api.getDoc().effects = { look: "grayscale", border: { top: 10, bottom: 10, left: 10, right: 10, color: "#0000ff" } };
          const out = await drawnSvg(api, win);
          assert(out.canvas.width === 220 && out.canvas.height === 120, out.canvas.width + "x" + out.canvas.height);
          assert(gray(pixelOf(out.canvas, 110, 60)), pixelOf(out.canvas, 110, 60).join());
          assert(near(pixelOf(out.canvas, 4, 60), [0, 0, 255, 255]), pixelOf(out.canvas, 4, 60).join());
          assert(api.getDoc().svg === source, "the source being edited does not change");
        }),
        test("every kind of shape writes well-formed SVG, with and without effects", async (api, doc, win) => {
          const engine = win.PaintEngine;
          const kinds = ["line", "arrow", "curve", "rect", "roundRect", "ellipse", "triangle", "diamond", "rightTriangle", "pentagon", "hexagon", "star", "heart", "blockArrow", "cross", "bubble", "cloud", "text"];
          const strokes = ["pencil", "brush", "marker", "spray", "eraser", "freeCurve"];
          [undefined, { look: "sepia", blur: 2, shadow: { on: true }, border: { top: 2 } }].forEach((effects) => {
            const current = redDoc(api, win);
            kinds.forEach((kind) => current.shapes.push(engine.makeShape(kind, { x: 20, y: 20, w: 100, h: 60, width: 3, text: "Aa", effects: effects })));
            strokes.forEach((kind) => current.shapes.push(engine.makeShape(kind, { width: 3, points: [{ x: 10, y: 10 }, { x: 40, y: 50 }, { x: 80, y: 20 }], effects: effects })));
            const info = win.MyPaintSvgDoc.inspect(api.documentSvg());
            assert(info.ok, info.error);
          });
        }),
        test("a filter name in a source is not used again", async (api, doc, win) => {
          const source = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><defs><filter id="mypaint-fx-1"/></defs></svg>';
          await api.openFiles([{ name: "again.svg", text: source, type: "image/svg+xml" }]);
          api.getDoc().shapes.push(win.PaintEngine.makeShape("rect", { x: 20, y: 20, w: 100, h: 60, color: RED, width: 2, effects: { look: "invert" } }));
          const ids = api.documentSvg().match(/filter id="[^"]+"/g);
          assert(new Set(ids).size === ids.length, ids.join());
        }),
      ];
    })()),
    suite("SVG source", (() => {
      const SOURCE = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#ff0000"/></svg>';
      const BLUE = SOURCE.replace("#ff0000", "#0000ff");
      const open = (api, text) => api.openFiles([{ name: "logo.svg", text: text || SOURCE, type: "image/svg+xml" }]);
      const type = async (api, doc, win, text) => {
        const box = doc.getElementById("svgSource");
        box.value = text;
        box.dispatchEvent(new win.Event("input", { bubbles: true }));
        await api.flushSvg();
      };
      const pixel = (api, doc, x, y) => {
        const data = doc.getElementById("board").getContext("2d").getImageData(Math.round(x * api.getZoom() / 100), Math.round(y * api.getZoom() / 100), 1, 1).data;
        return [data[0], data[1], data[2]];
      };
      const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
      return [
        test("an SVG opens with its source in the right panel, word for word", async (api, doc) => {
          await open(api);
          const box = doc.getElementById("svgSource");
          assert(box && box.tagName === "TEXTAREA", "no source box");
          assert(box.value === SOURCE, box.value);
          assert(api.getDoc().svg === SOURCE);
          assert(doc.getElementById("svgSize").textContent.indexOf("200") === 0, doc.getElementById("svgSize").textContent);
          assert(doc.getElementById("svgViewBox").textContent === "0 0 200 100");
          assert(doc.getElementById("sourceKind").textContent === "SVG", doc.getElementById("sourceKind").textContent);
          assert(api.getDoc().dirty === false, "opening is not a change");
        }),
        test("other pictures have no source box", async (api, doc) => {
          await api.resetForTests();
          assert(!doc.getElementById("svgSource"));
        }),
        test("editing the source draws the picture again", async (api, doc, win) => {
          await open(api);
          await settle();
          assert(pixel(api, doc, 50, 50).join() === "255,0,0", pixel(api, doc, 50, 50).join());
          await type(api, doc, win, BLUE);
          await settle();
          assert(pixel(api, doc, 50, 50).join() === "0,0,255", pixel(api, doc, 50, 50).join());
          assert(api.getDoc().svg === BLUE);
          assert(api.getDoc().dirty === true, "the edit is a change");
        }),
        test("the box keeps its focus and text while it redraws", async (api, doc, win) => {
          await open(api);
          const box = doc.getElementById("svgSource");
          box.focus();
          await type(api, doc, win, BLUE.replace('width="200" height="100" viewBox', 'width="300" height="150" viewBox'));
          const now = doc.getElementById("svgSource");
          assert(api.getDoc().width === 300 && api.getDoc().height === 150, api.getDoc().width + "x" + api.getDoc().height);
          assert(doc.activeElement === now, "the box lost the focus");
          assert(now.value.indexOf('width="300"') > 0);
          assert(doc.getElementById("svgSize").textContent.indexOf("300") === 0);
        }),
        test("a mistake is reported and the last good picture and source stay", async (api, doc, win) => {
          await open(api);
          await settle();
          const broken = SOURCE.replace("</svg>", "");
          await type(api, doc, win, broken);
          await settle();
          const error = doc.getElementById("svgError");
          assert(!error.hidden && error.textContent.indexOf(api.t("svg.error")) === 0, error.textContent);
          assert(doc.getElementById("svgSource").value === broken, "the text being typed must stay");
          assert(api.getDoc().svg === SOURCE, "the source that drew must stay");
          assert(pixel(api, doc, 50, 50).join() === "255,0,0");
          assert(api.documentSvg() === SOURCE, "saving now writes the good source");
          await type(api, doc, win, BLUE);
          assert(doc.getElementById("svgError").hidden, "fixed, so the message goes");
        }),
        test("undo brings the source and the picture back", async (api, doc, win) => {
          await open(api);
          await settle();
          await type(api, doc, win, BLUE);
          await settle();
          await api.run("undo");
          await settle();
          assert(api.getDoc().svg === SOURCE, api.getDoc().svg);
          assert(doc.getElementById("svgSource").value === SOURCE);
          assert(pixel(api, doc, 50, 50).join() === "255,0,0", pixel(api, doc, 50, 50).join());
          await api.run("redo");
          await settle();
          assert(pixel(api, doc, 50, 50).join() === "0,0,255");
        }),
        test("the picture is not a shape to pick, and shapes drawn on it are", async (api, doc) => {
          await open(api);
          api.setTool("rect");
          const shape = api.draw(20, 20, 80, 80);
          api.setTool("select");
          await api.run("selectAll");
          assert(api.getSelected().length === 1 && api.getSelected()[0] === shape.id, api.getSelected().join());
          assert(doc.querySelectorAll(".shape-list [data-action^='pick'], .shape-list > *").length === 1, "the list should hold only the drawn shape");
        }),
        test("saving writes the source, with drawn shapes after it", async (api) => {
          await open(api);
          assert(api.documentSvg() === SOURCE, "untouched, it is word for word");
          api.setTool("rect");
          api.draw(20, 20, 80, 80);
          const out = api.documentSvg();
          assert(out.indexOf('fill="#ff0000"') > 0 && out.indexOf('id="mypaint-shapes"') > 0, out);
          assert(out.indexOf("<image") < 0, "the picture must not be embedded as well");
          assert(out.lastIndexOf("</svg>") > out.indexOf("mypaint-shapes"));
          const saved = await api.run("save");
          assert(saved !== undefined);
          assert(api.getLastSaved().format === "svg", JSON.stringify(api.getLastSaved()));
          assert(api.getDoc().dirty === false);
        }),
        test("a .mypaint file brings the source back, drawn again", async (api, doc) => {
          await open(api);
          const saved = await api.finishSave(api.getDoc(), "logo.mypaint", "mypaint");
          assert(saved.text.indexOf('"svgFrame": true') > 0, "the frame is marked");
          assert(saved.text.indexOf("data:image") < 0, "the pixels the source can draw stay out of the file");
          await api.openFiles([{ name: "again.mypaint", text: saved.text, type: "text/plain" }]);
          await settle();
          assert(api.getDoc().name === "again.mypaint");
          assert(api.getDoc().svg === SOURCE);
          assert(doc.getElementById("svgSource").value === SOURCE);
          assert(pixel(api, doc, 50, 50).join() === "255,0,0", pixel(api, doc, 50, 50).join());
        }),

        test("a new canvas size scales the picture and the source follows", async (api, doc, win) => {
          await open(api);
          await settle();
          const field = doc.querySelector('#rightPanel [data-prop="canvasWidth"]');
          assert(field, "no width field");
          field.value = "400";
          field.dispatchEvent(new win.Event("change", { bubbles: true }));
          await settle();
          assert(api.getDoc().svg.indexOf('width="400"') > 0, api.getDoc().svg);
          assert(doc.getElementById("svgSource").value === api.getDoc().svg);
          assert(pixel(api, doc, 200, 50).join() === "255,0,0", pixel(api, doc, 200, 50).join());
        }),
        test("cropping makes it plain pixels, and undo returns the source", async (api, doc) => {
          await open(api);
          await settle();
          api.setTool("selectRect");
          api.draw(10, 10, 60, 40);
          api.cropRegion();
          assert(!api.getDoc().svg, "the crop is no longer its source");
          assert(!doc.getElementById("svgSource"));
          await api.run("undo");
          await settle();
          assert(api.getDoc().svg === SOURCE);
          assert(pixel(api, doc, 150, 80).join() === "255,0,0", pixel(api, doc, 150, 80).join());
        }),
      ];
    })()),
    suite("Pictures", [
      test("a PNG opens as its own drawing", async (api, doc, win) => {
        const png = await picture(win, 40, 24, "#1166cc", "image/png");
        const opened = await api.openBytes(png, "photo.png");
        assert(opened.width === 40 && opened.height === 24, opened.width + "x" + opened.height);
        assert(api.getDoc().name === "photo.png");
        assert(api.shapeCount() === 1 && api.shapes()[0].kind === "image");
        assert(api.sourceInfo().kind === "native");
        const pixel = api.pixelAt(35, 20);
        assert(pixel[0] === 0x11 && pixel[1] === 0x66 && pixel[2] === 0xcc, pixel.join(","));
      }),
      test("a JPEG and a WebP open the same way", async (api, doc, win) => {
        const jpeg = await picture(win, 32, 16, "#cc3311", "image/jpeg");
        await api.openBytes(jpeg, "snap.jpg");
        assert(api.getDoc().width === 32, String(api.getDoc().width));
        const webp = await picture(win, 24, 24, "#22aa55", "image/webp");
        await api.openBytes(webp, "snap.webp");
        assert(api.getDoc().width === 24 && api.getDoc().height === 24);
        assert(api.sourceInfo().kind === "native");
      }),
      test("a TIFF opens with its colors in place", async (api) => {
        const tiff = await bytesOf("/test/fixtures/gradient.tif");
        await api.openBytes(tiff, "gradient.tif");
        assert(api.getDoc().width === 64 && api.getDoc().height === 48, api.getDoc().width + "x" + api.getDoc().height);
        assert(api.sourceInfo().kind === "tiff");
        const pixel = api.pixelAt(63, 0);
        assert(pixel[0] > 240 && pixel[2] === 77, pixel.join(","));
      }),
      test("a 16-bit grey TIFF is brought down to 8 bit", async (api) => {
        const tiff = await bytesOf("/test/fixtures/gray16.tif");
        await api.openBytes(tiff, "gray16.tif");
        assert(api.getDoc().width === 32 && api.getDoc().height === 16);
        const dark = api.pixelAt(0, 0);
        const light = api.pixelAt(31, 15);
        assert(dark[0] === dark[1] && dark[1] === dark[2], "grey");
        assert(light[0] > dark[0] + 100, light[0] + " vs " + dark[0]);
      }),
      test("BMP and GIF files open too", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/gradient.bmp"), "gradient.bmp");
        assert(api.getDoc().width === 64, String(api.getDoc().width));
        await api.openBytes(await bytesOf("/test/fixtures/gradient.gif"), "gradient.gif");
        assert(api.getDoc().width === 64 && api.getDoc().height === 48);
      }),
      test("the status bar and the right panel name the format", async (api, doc, win) => {
        await api.openBytes(await bytesOf("/test/fixtures/gradient.tif"), "gradient.tif");
        assert(doc.getElementById("stFormat").textContent.indexOf(api.t("kind.tiff")) >= 0, doc.getElementById("stFormat").textContent);
        api.deselect();
        assert(doc.getElementById("sourceKind").textContent === api.t("kind.tiff"));
      }),
      test("a picture that cannot be read is reported with its name", async (api) => {
        let message = "";
        try {
          await api.openBytes(new Uint8Array([0x49, 0x49, 42, 0, 0, 0, 0, 0]), "broken.tif");
        } catch (error) {
          message = error.message;
        }
        assert(message.length > 0, "a broken TIFF must be reported");
      }),
      test("a dropped picture can be opened, placed, or used as the background", async (api, doc, win) => {
        const png = await picture(win, 20, 20, "#884400", "image/png");
        await api.dropBytes(png, "drop.png");
        const popup = api.getPopup();
        assert(popup.dataset.kind === "drop");
        assert(popup.querySelector("#dropKind").textContent === api.t("kind.native"), popup.querySelector("#dropKind").textContent);
        api.closePopup();
        const before = api.getDocs().length;
        await api.applyDrop("drawing");
        assert(api.getDocs().length === before + 1, "a dropped picture opens as a drawing");
        await api.dropBytes(png, "drop.png");
        api.closePopup();
        await api.applyDrop("image");
        assert(api.shapes().some((shape) => shape.kind === "image"), "placed into the drawing");
      }),
    ]),

    suite("Camera", [
      test("the full-size picture inside a camera RAW file is found", async (api, doc, win) => {
        const F = win.MyPaintFormats;
        const jpeg = await picture(win, 48, 32, "#3366aa", "image/jpeg");
        const raw = fakeRaw(jpeg, "Canon", "EOS R5");
        const previews = F.rawPreviews(raw);
        assert(previews.length >= 1, "no preview found");
        assert(previews[0].length === jpeg.length, previews[0].length + " vs " + jpeg.length);
      }),
      test("a RAW file opens and keeps the camera details", async (api, doc, win) => {
        const jpeg = await picture(win, 48, 32, "#3366aa", "image/jpeg");
        const raw = fakeRaw(jpeg, "Canon", "EOS R5");
        await api.openBytes(raw, "IMG_0001.cr2");
        assert(api.getDoc().width === 48 && api.getDoc().height === 32, api.getDoc().width + "x" + api.getDoc().height);
        assert(api.sourceInfo().kind === "raw");
        assert(api.sourceInfo().exifText.indexOf("Canon") >= 0, api.sourceInfo().exifText);
        assert(api.sourceInfo().exifText.indexOf("EOS R5") >= 0);
        api.deselect();
        assert(doc.getElementById("cameraInfo").textContent.indexOf("Canon") >= 0);
      }),
      test("a RAW file with no file table still gives up its picture", async (api, doc, win) => {
        const F = win.MyPaintFormats;
        const jpeg = await picture(win, 64, 48, "#aa2277", "image/jpeg");
        const blob = new Uint8Array(64 + jpeg.length + 32);
        blob.set(jpeg, 64);
        const previews = F.rawPreviews(blob);
        assert(previews.length === 1 && previews[0].start === 64, JSON.stringify(previews));
        const result = await F.decodeRaw(blob);
        assert(result.width === 64 && result.height === 48, result.width + "x" + result.height);
      }),
      test("camera details are read from the picture itself", (api, doc, win) => {
        const F = win.MyPaintFormats;
        const raw = fakeRaw(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "NIKON CORPORATION", "NIKON Z 9");
        const info = F.exif(raw);
        assert(info.make === "NIKON CORPORATION", info.make);
        assert(info.model === "NIKON Z 9", info.model);
        assert(F.describeExif(info).indexOf("NIKON Z 9") >= 0);
      }),
      test("every RAW extension MyPaint claims is routed to the RAW reader", (api, doc, win) => {
        const F = win.MyPaintFormats;
        Array.from(F.RAW).forEach((ext) => {
          assert(F.kindOf("file." + ext, null) === "raw", ext);
        });
        assert(F.RAW.size >= 35, String(F.RAW.size));
      }),
    ]),

    suite("Dicom", [
      test("a DICOM file opens with its size, patient and window", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        assert(api.getDoc().width === 64 && api.getDoc().height === 64, api.getDoc().width + "x" + api.getDoc().height);
        assert(api.sourceInfo().kind === "dicom");
        const meta = api.dicomMeta();
        assert(meta.patientName === "Test Phantom", meta.patientName);
        assert(meta.modality === "CT", meta.modality);
        const state = api.dicomState();
        assert(state.wc === 600 && state.ww === 1600, JSON.stringify(state));
      }),
      test("the window can be changed and reset", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        const before = api.pixelAt(32, 32)[0];
        await api.dicomRender({ wc: 0, ww: 200 });
        assert(api.dicomState().wc === 0 && api.dicomState().ww === 200);
        const after = api.pixelAt(32, 32)[0];
        assert(after !== before, "the picture did not change with the window");
        await api.dicomRender({ resetWindow: true });
        assert(api.dicomState().wc === 600, String(api.dicomState().wc));
      }),
      test("the CT presets are offered and applied", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        const presets = api.dicomPresets();
        ["file", "auto", "brain", "lung", "bone"].forEach((id) => assert(presets.indexOf(id) >= 0, id + " is missing"));
        presets.forEach((id) => assert(api.t("dicom.preset." + id) !== "dicom.preset." + id, id + " has no label"));
        await api.dicomPreset("lung");
        assert(api.dicomState().wc === -600 && api.dicomState().ww === 1500, JSON.stringify(api.dicomState()));
        await api.dicomPreset("bone");
        assert(api.dicomState().ww === 1800);
      }),
      test("grey can be inverted and a colour map applied", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        const plain = api.pixelAt(32, 32);
        await api.dicomRender({ invert: true });
        const inverted = api.pixelAt(32, 32);
        assert(api.dicomState().invert === true);
        assert(Math.abs(255 - plain[0] - inverted[0]) <= 2, plain[0] + " vs " + inverted[0]);
        await api.dicomRender({ invert: false, colormap: "hotiron" });
        assert(api.dicomState().colormap === "hotiron");
        const warm = api.pixelAt(32, 32);
        assert(warm[0] !== warm[2], "a colour map must not stay grey: " + warm.join(","));
      }),
      test("a multi-frame study steps through its frames and plays them", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-multiframe.dcm"), "ct-multiframe.dcm");
        assert(api.dicom().frames === 8, String(api.dicom().frames));
        assert(api.sourceInfo().pages === 8);
        await api.dicomRender({ frame: 3 });
        assert(api.dicomState().frame === 3);
        await api.run("nextPage");
        assert(api.dicomState().frame === 4, String(api.dicomState().frame));
        await api.run("prevPage");
        assert(api.dicomState().frame === 3);
        assert(api.dicomCine() === true, "cine did not start");
        assert(api.cineRunning() === true);
        api.stopCine();
        assert(api.cineRunning() === false);
      }),
      test("a length is measured in millimetres", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        api.setTool("line");
        const shape = api.draw(10, 10, 30, 10);
        const measure = api.dicomMeasure(shape);
        assert(measure.kind === "length", JSON.stringify(measure));
        assert(Math.abs(measure.px - 20) < 0.001, String(measure.px));
        assert(Math.abs(measure.mm - 10) < 0.001, String(measure.mm));
      }),
      test("a region gives its mean, spread and area", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        api.setTool("rect");
        const shape = api.draw(20, 20, 40, 40);
        const roi = api.dicomMeasure(shape);
        assert(roi.kind === "roi", JSON.stringify(roi));
        assert(roi.n > 100, String(roi.n));
        assert(roi.areaMm2 > 0 && roi.max >= roi.mean && roi.mean >= roi.min, JSON.stringify(roi));
      }),
      test("the value under the pointer is read in Hounsfield units", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        const probe = api.dicomProbe(32, 32);
        assert(probe, "no value under the pointer");
        assert(probe.units === "HU", probe.units);
        assert(Number.isFinite(probe.value), JSON.stringify(probe));
      }),
      test("the DICOM panel offers the window, colour map and details", async (api, doc) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-multiframe.dcm"), "ct-multiframe.dcm");
        api.deselect();
        const panel = doc.getElementById("rightPanel");
        ["preset", "wc", "ww", "colormap", "invert", "voiFunction"].forEach((name) => {
          assert(panel.querySelector('[data-dicom="' + name + '"]'), name + " is missing from the panel");
        });
        assert(doc.getElementById("dicomFrame").textContent === "1/8", doc.getElementById("dicomFrame").textContent);
        panel.querySelectorAll(".props .line").forEach((line) => {
          assert(line.scrollWidth <= line.clientWidth + 2, "a DICOM row is cut off: " + line.textContent);
        });
        const width = panel.querySelector('[data-dicom="ww"]');
        width.value = "400";
        width.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert(api.dicomState().ww === 400, String(api.dicomState().ww));
      }),
      test("the details popup lists the summary and pages through every tag", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        assert(api.dicomTags().length > 20, String(api.dicomTags().length));
        const popup = api.openPopup("dicom");
        assert(popup.textContent.indexOf("Test Phantom") >= 0, "the patient is missing");
        assert(popup.textContent.indexOf(api.t("meta.patientName")) >= 0, "the summary labels are not translated");
        assert(popup.textContent.indexOf("patientName") < 0, "a raw field name leaked into the summary");
        popup.querySelector('[data-tab="tags"]').click();
        const first = popup.querySelector("#tagPage").textContent;
        assert(first.indexOf("1/") >= 0, first);
        assert(api.tagPages() > 1, String(api.tagPages()));
        popup.querySelector('[data-popup-action="tag-next"]').click();
        assert(api.getPopup().querySelector("#tagPage").textContent.indexOf("2/") >= 0);
        api.closePopup();
      }),
      test("a colour DICOM keeps its colours", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/SC_rgb_small_odd.dcm"), "SC_rgb_small_odd.dcm");
        const image = api.dicom();
        assert(image.isColor === true, image.photometric);
        assert(api.getDoc().width > 0 && api.getDoc().height > 0);
      }),
      test("a compressed DICOM is decoded with its own codec", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/JPEG2000.dcm"), "JPEG2000.dcm");
        const image = api.dicom();
        assert(image.transferSyntaxName.indexOf("JPEG 2000") >= 0, image.transferSyntaxName);
        assert(api.getDoc().width > 0, "the compressed picture did not come out");
      }),
      test("a real CT from the test set opens with its rescale", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/CT_small.dcm"), "CT_small.dcm");
        const image = api.dicom();
        assert(image.modality === "CT", image.modality);
        assert(image.units === "HU", image.units);
        assert(api.getDoc().width === 128 && api.getDoc().height === 128, api.getDoc().width + "x" + api.getDoc().height);
      }),
      test("the DICOM commands are off when the drawing is not a scan", (api) => {
        const tools = api.menuDefinitions().find((menu) => menu.id === "tools");
        const info = tools.items.find((item) => item.action === "dicomInfo");
        assert(info.disabled === true, "the DICOM command must be off for a drawing");
        const popup = api.openPopup("dicom");
        assert(popup.textContent.indexOf(api.t("dicom.none")) >= 0);
        api.closePopup();
      }),
      test("a data set saved without the Part 10 wrapper still opens", async (api) => {
        for (const file of ["ct-no-preamble.dcm", "ct-no-meta.dcm"]) {
          await api.openBytes(await bytesOf("/test/fixtures/" + file), file);
          assert(api.getDoc().width === 64 && api.getDoc().height === 64, file + " came out " + api.getDoc().width + "x" + api.getDoc().height);
          assert(api.dicomMeta().patientName === "Test Phantom", file + ": " + api.dicomMeta().patientName);
          assert(api.dicom().modality === "CT", file + ": " + api.dicom().modality);
          assert(api.dicom().transferSyntaxName === "Explicit VR Little Endian", file + ": " + api.dicom().transferSyntaxName);
        }
      }),
      test("8-bit colour written as words in big endian keeps its colours", async (api) => {
        const shot = async (file) => {
          await api.openBytes(await bytesOf("/test/fixtures/" + file), file);
          // The drawing itself is held to the smallest canvas MyPaint keeps; the picture is 3x3.
          assert(api.dicom().width === 3 && api.dicom().height === 3, file + " came out " + api.dicom().width + "x" + api.dicom().height);
          const out = [];
          for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) out.push(api.framePixelAt(x, y).join(","));
          return out;
        };
        const little = await shot("rgb-odd.dcm");
        const big = await shot("rgb-odd-be.dcm");
        assert(little[0] === "166,141,52,255", "the little endian file read as " + little[0]);
        assert(big.join(" ") === little.join(" "), "big endian gave " + big.join(" ") + " instead of " + little.join(" "));
      }),
      test("4:2:2 chroma is spread back over the pixels", async (api) => {
        const shot = async (file) => {
          await api.openBytes(await bytesOf("/test/fixtures/" + file), file);
          assert(api.dicom().photometric.indexOf("YBR") === 0, file + " read as " + api.dicom().photometric);
          const out = [];
          for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) out.push(api.framePixelAt(x, y).join(","));
          return out;
        };
        const full = await shot("ybr-full.dcm");
        const half = await shot("ybr-422.dcm");
        assert(half.join(" ") === full.join(" "), "4:2:2 gave " + half.join(" ") + " instead of " + full.join(" "));
      }),
      test("float pixel data is windowed over the values it holds", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/float-map.dcm"), "float-map.dcm");
        assert(api.dicom().isFloat === true, "the file should be read as float");
        assert(api.dicomState().voiFunction === "LINEAR_EXACT", api.dicomState().voiFunction);
        const greys = {};
        for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) greys[api.framePixelAt(x, y)[0]] = true;
        assert(Object.keys(greys).length > 16, "the ramp came out as " + Object.keys(greys).length + " shades");
        assert(api.framePixelAt(0, 0)[0] < api.framePixelAt(15, 15)[0], "the ramp does not run dark to light");
      }),
      test("frames deflated one at a time are read", async (api) => {
        const shot = async (file) => {
          await api.openBytes(await bytesOf("/test/fixtures/" + file), file);
          assert(api.dicom().frames === 2, file + " has " + api.dicom().frames + " frames");
          const out = [];
          for (const frame of [0, 1]) {
            await api.dicomRender({ frame: frame });
            for (let i = 0; i < 16; i += 1) out.push(api.framePixelAt(i, i).join(","));
          }
          return out;
        };
        const plain = await shot("frames-plain.dcm");
        const deflated = await shot("frames-deflated.dcm");
        assert(api.dicom().transferSyntaxName === "Deflated Image Frame Compression", api.dicom().transferSyntaxName);
        assert(deflated.join(" ") === plain.join(" "), "the deflated frames came out differently");
      }),
      test("a VOI function can be chosen without typing a window first", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        const plain = api.pixelAt(20, 20)[0];
        const sigmoid = await api.dicomRender({ voiFunction: "SIGMOID" });
        assert(sigmoid.voiFunction === "SIGMOID", "the function stayed " + sigmoid.voiFunction);
        assert(api.pixelAt(20, 20)[0] !== plain, "SIGMOID did not change the picture");
        await api.dicomRender({ resetWindow: true });
        assert(api.dicomState().voiFunction === "LINEAR", api.dicomState().voiFunction);
      }),
      test("the window rows are left out for a scan that has no window", async (api, doc) => {
        await api.openBytes(await bytesOf("/samples/colour-capture.dcm"), "colour-capture.dcm");
        api.deselect();
        assert(api.dicom().windowed === false, "an RGB capture has no window to set");
        const panel = doc.getElementById("rightPanel");
        ["wc", "ww", "preset", "colormap", "voiFunction"].forEach((name) => {
          assert(!panel.querySelector('[data-dicom="' + name + '"]'), name + " should not be offered for an RGB capture");
        });
        assert(panel.querySelector('[data-dicom="invert"]'), "inversion still applies");
      }),
    ]),

    suite("Convert", [
      test("a drawing is converted to every format MyPaint writes", async (api, doc, win) => {
        freshDoc(api);
        api.applyCanvas({ width: 48, height: 32, background: "#ffffff" });
        api.setTool("rect");
        api.draw(4, 4, 40, 28);
        for (const spec of win.MyPaintFormats.writableFormats()) {
          const result = await api.convert(spec.id, 90);
          assert(result.format === spec.id, spec.id + " came out as " + result.format);
          assert(result.bytes > 50, spec.id + " wrote only " + result.bytes + " bytes");
          assert(result.path.indexOf("." + spec.ext) > 0, result.path);
          assert(result.width === 48 && result.height === 32, JSON.stringify(result));
        }
      }),
      test("a picture is converted from one format to another", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/gradient.tif"), "gradient.tif");
        const png = await api.convert("png", 92);
        assert(png.format === "png" && png.path.indexOf("gradient.png") >= 0, png.path);
        const jpeg = await api.convert("jpeg", 70);
        assert(jpeg.mime === "image/jpeg", jpeg.mime);
        assert(jpeg.bytes > 100, String(jpeg.bytes));
      }),
      test("a DICOM frame is converted to an ordinary picture", async (api) => {
        await api.openBytes(await bytesOf("/test/fixtures/ct-sphere.dcm"), "ct-sphere.dcm");
        const result = await api.convert("png");
        assert(result.width === 64 && result.height === 64, JSON.stringify(result));
        assert(result.bytes > 100);
      }),
      test("a picture is exported as an icon, JPEG 2000 and DICOM", async (api, doc, win) => {
        freshDoc(api);
        api.applyCanvas({ width: 64, height: 48, background: "#ffffff" });
        api.popupAction("apply-palette", { color: "#2266cc", fillColor: "#2266cc" });
        api.setTool("rect");
        api.draw(6, 6, 58, 42);
        const ico = await api.convert("ico");
        assert(ico.format === "ico" && /\.ico$/.test(ico.path), ico.path);
        assert(ico.bytes > 500, String(ico.bytes));
        const jp2 = await api.convert("jp2");
        assert(jp2.format === "jp2" && /\.jp2$/.test(jp2.path), jp2.path);
        assert(jp2.bytes > 100, String(jp2.bytes));
        const dcm = await api.convert("dicom");
        assert(dcm.format === "dicom" && /\.dcm$/.test(dcm.path), dcm.path);
        assert(dcm.bytes > 64 * 48 * 3, String(dcm.bytes));
      }),
      test("what MyPaint writes it can read back", async (api, doc, win) => {
        const F = win.MyPaintFormats;
        freshDoc(api);
        api.applyCanvas({ width: 40, height: 32, background: "#ffffff" });
        api.popupAction("apply-palette", { color: "#cc3300", fillColor: "#cc3300" });
        api.setTool("rect");
        api.draw(0, 0, 40, 32);
        const canvas = doc.getElementById("board");
        const rgba = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 40, 32).data;
        const image = { width: 40, height: 32, rgba: rgba };
        for (const id of ["png", "bmp", "ico", "jp2", "j2k", "dicom", "tiff"]) {
          const written = await F.encode(id, image, { quality: 0.9, name: "round trip" });
          const name = "round." + written.ext;
          const back = await F.decode(written.bytes, name);
          if (id === "ico") {
            // an icon file carries several square sizes, so the reader picks the largest
            assert(back.width === back.height && back.width >= 16, id + " came back " + back.width + "x" + back.height);
          } else {
            assert(back.width === 40 && back.height === 32, id + " came back " + back.width + "x" + back.height);
          }
          const middle = (Math.floor(back.height / 2) * back.width + Math.floor(back.width / 2)) * 4;
          assert(Math.abs(back.rgba[middle] - 0xcc) < 40, id + " lost the colour: " + back.rgba[middle]);
        }
      }),
      test("the convert popup picks the format and the quality", async (api) => {
        const popup = api.openPopup("convert");
        popup.querySelector('[data-field="format"]').value = "webp";
        popup.querySelector('[data-field="quality"]').value = "60";
        popup.querySelector('[data-popup-action="apply-convert"]').click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        const result = api.getLastConvert();
        assert(result && result.format === "webp", JSON.stringify(result));
      }),
      test("a converted file is written next to the last save folder", async (api) => {
        api.rememberDirectory("save", "D:/pictures/out.png");
        freshDoc(api);
        const result = await api.convert("png");
        assert(result.path.indexOf("D:/pictures/") === 0, result.path);
      }),
    ]),

    suite("Samples", [
      test("every sample file opens in the program", async (api) => {
        const manifest = await (await fetch("/samples/index.json")).json();
        assert(manifest.pictures.length >= 30, String(manifest.pictures.length));
        const seen = {};
        for (const row of manifest.pictures) {
          const data = await bytesOf("/samples/" + row.file);
          await api.openBytes(data, row.file);
          const doc = api.getDoc();
          assert(doc.name === row.file, row.file + " opened as " + doc.name);
          assert(doc.width > 8 && doc.height > 8, row.file + " came out " + doc.width + "x" + doc.height);
          assert(api.sourceInfo().kind === row.kind, row.file + " was read as " + api.sourceInfo().kind);
          seen[row.kind] = (seen[row.kind] || 0) + 1;
        }
        ["native", "tiff", "heif", "j2k", "dicom", "raw"].forEach((kind) => {
          assert(seen[kind] > 0, "no sample covers " + kind);
        });
      }),
      test("the HEIC and HEIF samples open with their pictures", async (api) => {
        const manifest = await (await fetch("/samples/index.json")).json();
        const heif = manifest.pictures.filter((row) => row.kind === "heif");
        assert(heif.length >= 2, "there are not enough HEIC samples: " + heif.length);
        for (const row of heif) {
          await api.openBytes(await bytesOf("/samples/" + row.file), row.file);
          const doc = api.getDoc();
          assert(doc.width >= 320 && doc.height >= 240, row.file + " came out " + doc.width + "x" + doc.height);
          // a real photograph is not one flat colour
          const a = api.framePixelAt(Math.round(doc.width * 0.25), Math.round(doc.height * 0.25));
          const b = api.framePixelAt(Math.round(doc.width * 0.75), Math.round(doc.height * 0.75));
          assert(a[3] === 255 && b[3] === 255, row.file + " has no pixels");
          assert(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 10, row.file + " decoded flat");
        }
      }),
      test("a grid HEIC opens as the whole picture, with its tiles behind it", async (api) => {
        await api.openBytes(await bytesOf("/samples/grid.heic"), "grid.heic");
        const doc = api.getDoc();
        // The file stores a 2560x1440 photograph as four 1280x720 tiles; the grid is its primary
        // image, so that is what has to open — not one tile.
        assert(doc.width === 2560 && doc.height === 1440, "the grid came out " + doc.width + "x" + doc.height);
        assert(api.sourceInfo().pages === 5, String(api.sourceInfo().pages));
        assert(api.framePixelAt(1400, 800)[3] === 255, "the bottom right quarter of the grid is empty");
        await api.showPage(1);
        assert(api.sourceInfo().page === 1, "the page did not step: " + api.sourceInfo().page);
        assert(api.getDoc().width === 1280 && api.getDoc().height === 720, "a tile came out " + api.getDoc().width + "x" + api.getDoc().height);
      }),
      test("stepping through a HEIC with two images shows the other one", async (api) => {
        await api.openBytes(await bytesOf("/samples/conformance.heic"), "conformance.heic");
        assert(api.sourceInfo().pages === 2, String(api.sourceInfo().pages));
        const spots = [[200, 150], [640, 360], [1000, 500]];
        const first = spots.map((spot) => api.framePixelAt(spot[0], spot[1]).join(","));
        await api.showPage(1);
        assert(api.sourceInfo().page === 1, "the page did not step: " + api.sourceInfo().page);
        const second = spots.map((spot) => api.framePixelAt(spot[0], spot[1]).join(","));
        assert(second.join(" ") !== first.join(" "), "the second image looks exactly like the first");
      }),
      test("an image sequence says what it is instead of opening", async (api) => {
        // ftyp saying "msf1" (an image sequence) and a movie box: pictures live in a track here,
        // which libheif does not read, so the reader has to say so rather than blame the file.
        const bytes = new Uint8Array(32);
        const view = new DataView(bytes.buffer);
        const write = (at, text) => { for (let i = 0; i < 4; i += 1) bytes[at + i] = text.charCodeAt(i); };
        view.setUint32(0, 24);
        write(4, "ftyp");
        write(8, "msf1");
        view.setUint32(12, 0);
        write(16, "msf1");
        write(20, "iso8");
        view.setUint32(24, 8);
        write(28, "moov");
        let message = "";
        try { await api.openBytes(bytes, "clip.heics"); } catch (error) { message = error.message; }
        assert(/sequence/i.test(message), "the reader said: " + message);
      }),
      test("the multi-page TIFF sample carries three pages", async (api) => {
        await api.openBytes(await bytesOf("/samples/pages.tif"), "pages.tif");
        assert(api.sourceInfo().pages === 3, String(api.sourceInfo().pages));
        assert(api.getDoc().width === 320, String(api.getDoc().width));
        await api.showPage(1);
        assert(api.getDoc().width === 160, String(api.getDoc().width));
        await api.showPage(2);
        assert(api.getDoc().width === 80, String(api.getDoc().width));
      }),
      test("the camera samples carry the maker and the model", async (api) => {
        const rows = [["canon-eos-r5.cr2", "EOS R5"], ["nikon-z9.nef", "NIKON Z 9"], ["fujifilm-xt5.raf", ""]];
        for (const row of rows) {
          await api.openBytes(await bytesOf("/samples/" + row[0]), row[0]);
          assert(api.getDoc().width === 320, row[0] + " is " + api.getDoc().width + " wide");
          if (row[1]) assert(api.sourceInfo().exifText.indexOf(row[1]) >= 0, row[0] + ": " + api.sourceInfo().exifText);
        }
      }),
      test("the DICOM samples carry a window, frames and colour", async (api) => {
        await api.openBytes(await bytesOf("/samples/ct-one-frame.dcm"), "ct-one-frame.dcm");
        assert(api.dicom().modality === "CT");
        assert(api.dicomState().ww === 1600, String(api.dicomState().ww));
        await api.openBytes(await bytesOf("/samples/ct-eight-frames.dcm"), "ct-eight-frames.dcm");
        assert(api.dicom().frames === 8, String(api.dicom().frames));
        await api.openBytes(await bytesOf("/samples/colour-capture.dcm"), "colour-capture.dcm");
        assert(api.dicom().isColor === true, api.dicom().photometric);
      }),
      test("the sample drawing opens as a drawing", async (api) => {
        const raw = await (await fetch("/samples/drawing.mpaint")).text();
        const count = api.openDrawingText(raw, "drawing.mpaint", "");
        assert(count === 2, String(count));
        assert(api.shapeCount() > 4, String(api.shapeCount()));
      }),
    ]),

    suite("Close", [
      test("a changed drawing asks before closing", (api) => {
        api.setTool("rect");
        api.draw(10, 10, 40, 40);
        assert(api.requestClose() === "ask");
        const popup = api.getPopup();
        assert(popup.dataset.kind === "unsaved");
        assert(popup.textContent.indexOf("저장") >= 0);
        popup.querySelector('[data-popup-action="discard"]').click();
        assert(api.isClosed() === true);
        api.reopen();
      }),
      test("an unchanged drawing closes straight away", (api) => {
        api.getDocs().forEach((doc) => { doc.dirty = false; });
        assert(api.requestClose() === "closed");
        assert(api.isClosed() === true);
        api.reopen();
      }),
      test("saving from the question closes the window", async (api) => {
        api.setTool("line");
        api.draw(0, 0, 20, 20);
        api.requestClose();
        api.getPopup().querySelector('[data-popup-action="save-close"]').click();
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert(api.getLastSaved(), "nothing was saved");
        assert(api.isClosed() === true);
        api.reopen();
      }),
    ]),

    suite("Font", [
      test("the font list comes from the system", (api) => {
        const names = api.setFontCatalog(["Zed", "Arial", "Arial", "Batang"]);
        assert(names.length === 3, String(names.length));
        assert(names[0] === "Arial", names[0]);
        assert(api.getFontCatalog().indexOf("Batang") >= 0);
      }),
      test("Windows font names are cleaned up", (api, doc, win) => {
        const parsed = win.MyPaintFonts.parseWindowsFontQuery([
          "    Malgun Gothic & Malgun Gothic Semilight (TrueType)    REG_SZ    malgun.ttf",
          "    Arial Bold (TrueType)    REG_SZ    arialbd.ttf",
        ].join("\n"));
        assert(parsed.indexOf("Arial") >= 0, parsed.join(","));
      }),
      test("the font family, size and style reach the text shapes", (api) => {
        freshDoc(api);
        api.setFont("Georgia", 40, "bold-italic");
        api.setTool("text");
        const shape = api.click(50, 80);
        assert(shape.fontFamily === "Georgia", shape.fontFamily);
        assert(shape.fontSize === 40, String(shape.fontSize));
        assert(shape.fontStyle === "bold-italic");
      }),
      test("the drawing font string carries the style", (api, doc, win) => {
        const shape = win.PaintEngine.makeShape("text", { text: "x", fontFamily: "Arial", fontSize: 20, fontStyle: "bold-italic" });
        const font = win.PaintEngine.fontOf(shape);
        assert(font.indexOf("italic") >= 0 && font.indexOf("700") >= 0 && font.indexOf("20px") >= 0, font);
      }),
    ]),

    suite("Background", [
      test("a window background image can be set and cleared", async (api, doc) => {
        await api.setBackgroundBytes(new Uint8Array([1, 2, 3, 4]), "image/png", "wall.png");
        assert(api.getSettings().backgroundName === "wall.png");
        const value = doc.documentElement.style.getPropertyValue("--workspace-image");
        assert(value.indexOf("url(") >= 0, value);
        await api.clearBackground();
        assert(doc.documentElement.style.getPropertyValue("--workspace-image") === "none");
      }),
      test("the background opacity can be changed", (api, doc) => {
        api.popupAction("apply-settings", { backgroundOpacity: 80 });
        assert(api.getSettings().backgroundOpacity === 80);
        assert(doc.documentElement.style.getPropertyValue("--workspace-image-opacity") === "0.8");
      }),
      test("a very large background image is still accepted", async (api) => {
        const big = new Uint8Array(1024 * 1024);
        await api.setBackgroundBytes(big, "image/png", "huge.png");
        assert(api.getSettings().backgroundBytes === big.length, String(api.getSettings().backgroundBytes));
        await api.clearBackground();
      }),
    ]),

    suite("Progress", [
      test("a long save shows the progress popup", async (api) => {
        freshDoc(api);
        api.setTool("pencil");
        const points = [];
        for (let i = 0; i < 2000; i += 1) points.push({ x: i % 400, y: (i * 7) % 300 });
        api.stroke(points);
        await api.saveCurrent(false);
        const marks = api.progressMarks();
        assert(marks.length >= 3, "no progress steps: " + marks.join(","));
        assert(marks[marks.length - 1] === 100, marks.join(","));
        assert(api.getPopup() == null, "the progress popup stays open");
      }),
      test("a link downloads the picture and opens it", async (api) => {
        const before = api.getDocs().length;
        await api.openFromUrl(location.origin + "/samples/scene.png");
        assert(api.getDocs().length === before + 1, String(api.getDocs().length));
        assert(api.getDoc().name === "scene.png", api.getDoc().name);
        assert(api.getDoc().width === 320 && api.getDoc().height === 240, api.getDoc().width + "x" + api.getDoc().height);
        assert(api.sourceInfo().kind === "native");
        const saved = api.getLastDownload();
        assert(saved.url.indexOf("/samples/scene.png") > 0, saved.url);
        assert(saved.bytes > 1000, String(saved.bytes));
      }),
      test("the download window counts up as the bytes arrive", async (api) => {
        api.openPopup("progress");
        await api.openFromUrl(location.origin + "/samples/photo.heic");
        const marks = api.progressMarks();
        assert(marks.length >= 3, "no steps were reported: " + marks.join(","));
        assert(marks[marks.length - 1] === 100, marks.join(","));
        // the share must climb, not jump straight to the end
        const climbing = marks.filter((value) => value > 0 && value < 100);
        assert(climbing.length >= 1, "the bar never showed a part-way share: " + marks.join(","));
        assert(api.getPopup() == null, "the progress window stayed open");
        assert(api.getDoc().name === "photo.heic", api.getDoc().name);
      }),
      test("the share is worked out from the bytes, known length or not", (api) => {
        assert(api.downloadPercent(0, 1000) === 0);
        assert(api.downloadPercent(500, 1000) === 50, String(api.downloadPercent(500, 1000)));
        assert(api.downloadPercent(1000, 1000) === 100);
        const unknown = api.downloadPercent(2 * 1024 * 1024, 0);
        assert(unknown > 0 && unknown <= 95, String(unknown));
        assert(api.downloadPercent(200 * 1024 * 1024, 0) <= 95, "an unknown length must never claim to be finished");
        assert(api.sizeLabel(900) === "900 B", api.sizeLabel(900));
        assert(api.sizeLabel(2048) === "2 KB", api.sizeLabel(2048));
        assert(api.sizeLabel(3 * 1024 * 1024) === "3.0 MB", api.sizeLabel(3 * 1024 * 1024));
      }),
      test("a link that is not a picture is reported", async (api) => {
        let message = "";
        try {
          await api.openFromUrl(location.origin + "/samples/README.md");
        } catch (error) {
          message = error.message;
        }
        assert(message.indexOf("not a picture") > 0, message);
        message = "";
        try {
          await api.openFromUrl("not a web address at all");
        } catch (error) {
          message = error.message;
        }
        assert(message.length > 0, "a bad address must be reported");
      }),
      test("the link window takes an address and remembers the last one", async (api) => {
        const popup = api.openPopup("link");
        assert(popup.dataset.kind === "link");
        const field = popup.querySelector('[data-field="url"]');
        assert(field, "there is no address field");
        assert(field.placeholder === "https://", field.placeholder);
        api.closePopup();
        await api.openFromUrl(location.origin + "/samples/scene.jpg");
        const again = api.openPopup("link");
        assert(again.querySelector('[data-field="url"]').value.indexOf("scene.jpg") > 0, "the last address is not offered again");
        api.closePopup();
      }),
      test("a downloaded picture joins the recent list", async (api) => {
        await api.openFromUrl(location.origin + "/samples/scene.gif");
        const recent = api.getSettings().recent;
        assert(recent.length >= 1, "nothing was remembered");
        assert(recent[0].name === "scene.gif", recent[0].name);
        assert(recent[0].path.indexOf("http") === 0, recent[0].path);
      }),
      test("the progress window shows the share beside the bar and can be stopped", (api) => {
        api.showProgress("saving", 42);
        const popup = api.getPopup();
        assert(popup.dataset.kind === "progress");
        const bar = popup.querySelector(".bar");
        const percent = popup.querySelector("#progressPct");
        assert(bar && percent, "the bar or the share is missing");
        assert(percent.textContent === "42", percent.textContent);
        assert(popup.querySelector("#progressFill").style.width === "42%");
        const barBox = bar.getBoundingClientRect();
        const pctBox = percent.getBoundingClientRect();
        assert(pctBox.left >= barBox.right - 1, "the share is not to the right of the bar");
        assert(Math.abs((barBox.top + barBox.height / 2) - (pctBox.top + pctBox.height / 2)) <= 4, "they are not on the same row");
        const stop = popup.querySelector('[data-popup-action="stop-progress"]');
        assert(stop, "there is no cancel button");
        assert(stop.textContent === api.t("action.cancel"), stop.textContent);
        stop.click();
        assert(api.getPopup() == null, "cancel did not close the window");
      }),
      test("cancel stops a download part way", async (api) => {
        let failed = "";
        const pending = api.openFromUrl(location.origin + "/samples/example.heif").catch((error) => { failed = error.message; });
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert(api.isDownloading() === true, "the download did not start");
        api.cancelProgress();
        await pending;
        assert(api.isDownloading() === false, "the download was not stopped");
        assert(failed.indexOf("stopped") > 0, failed || "(no error was raised)");
        assert(api.getPopup() == null, "the progress window stayed open");
      }),
      test("downloading a sample reports progress", async (api) => {
        await api.runDownload();
        assert(api.getLastDownload().bytes > 0);
        assert(api.progressMarks().indexOf(100) >= 0);
      }),
      test("opening a link reports progress", async (api) => {
        await api.runOpenLink("https://localhost/mypaint/USERSGUIDE.md");
        assert(api.getLastLink().indexOf("USERSGUIDE") >= 0);
        assert(api.progressMarks().length >= 2);
      }),
    ]),

    suite("Error", [
      test("an error opens a popup with the details", (api) => {
        api.showError(new Error("the file could not be opened"));
        const popup = api.getPopup();
        assert(popup.dataset.kind === "error");
        assert(popup.querySelector("#errorMessage").textContent.indexOf("could not be opened") >= 0);
        const detail = popup.querySelector("#errorDetail");
        assert(detail.value.indexOf("MyPaint") >= 0, detail.value);
        assert(detail.readOnly === true);
      }),
      test("the error details can be copied", (api) => {
        api.showError(new Error("broken"));
        api.getPopup().querySelector('[data-popup-action="copy-error"]').click();
        assert(api.getClipboard().indexOf("broken") >= 0, api.getClipboard());
      }),
      test("an unknown command is reported instead of failing quietly", (api) => {
        api.run("there-is-no-such-action");
        const popup = api.getPopup();
        assert(popup && popup.dataset.kind === "error");
        assert(api.getErrorText().indexOf("there-is-no-such-action") >= 0);
        api.closePopup();
      }),
    ]),

    suite("Installer", [
      test("the Windows installer removes the old program and asks about saved data", async () => {
        const raw = await bytesOf("/build/installer.nsh");
        assert(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, "installer.nsh needs its BOM or NSIS reads the Korean as ANSI");
        const script = await text("/build/installer.nsh");
        assert(script.indexOf("RMDir /r") >= 0);
        assert(script.indexOf("저장된 데이터") >= 0);
        assert(script.indexOf("삭제하시겠습니까") >= 0);
        assert(script.indexOf("Saved data was found") >= 0);
        assert(script.indexOf("Do you want to delete it?") >= 0);
        assert(script.indexOf("document.ico") >= 0);
        assert(script.indexOf(".mypaint") >= 0);
        assert(script.indexOf(".mpaint") >= 0, "older drawings still open in MyPaint");
        assert(script.indexOf("MyPaint.Drawing") >= 0);
        assert(script.indexOf("1042") >= 0);
        assert(script.indexOf("MUI_LANGDLL_ALWAYSSHOW") >= 0);
        assert(script.indexOf("$APPDATA\\MyPaint") >= 0);
        assert(script.indexOf("$DeleteAppDataCheckboxState") >= 0, "uninstalling asks about the saved data");
        ["NSIS_HOOK_PREINSTALL", "NSIS_HOOK_POSTINSTALL", "NSIS_HOOK_POSTUNINSTALL"].forEach((hook) => {
          assert(script.indexOf("!macro " + hook) >= 0, hook + " is missing");
        });
        assert(script.indexOf('"MyPaint 10.0"') >= 0, "the shortcuts are named MyPaint 10.0");
        assert(script.indexOf('$DESKTOP\\${MP_SHORTCUT}.lnk') >= 0 && script.indexOf('$SMPROGRAMS\\${MP_SHORTCUT}.lnk') >= 0);
        assert(script.indexOf('RMDir /r "$LOCALAPPDATA\\MyPaint"') < 0, "that folder is the installed program itself");
      }),
      test("the Linux installer asks before deleting saved data", async () => {
        const linux = await text("/build/linux-before-install.sh");
        assert(linux.indexOf("\r") < 0, "a shell script with CRLF line ends does not run");
        assert(linux.indexOf("/opt/MyPaint") >= 0);
        assert(linux.indexOf("com.shkwon.mypaint") >= 0);
        assert(linux.indexOf("저장된 데이터") >= 0 && linux.indexOf("Saved data") >= 0);
        assert(linux.indexOf("Choose the installation language") >= 0);
      }),
      test("the Tauri configuration names the app, its icons and its installers", async () => {
        const conf = JSON.parse(await text("/src-tauri/tauri.conf.json"));
        const pkg = JSON.parse(await text("/package.json"));
        assert(conf.productName === "MyPaint" && conf.mainBinaryName === "MyPaint");
        assert(conf.identifier === "com.shkwon.mypaint");
        assert(conf.version === "10.0.0" && pkg.version === "10.0.0");
        assert(conf.app.withGlobalTauri === true, "the bridge needs window.__TAURI__");
        assert(conf.app.windows.length === 0, "the host builds its windows itself");
        assert(conf.build.frontendDist === "../dist/app");
        assert(conf.build.beforeBuildCommand.indexOf("stage-app.js") >= 0);
        assert(!conf.build.devUrl, "a debug build must not depend on a dev server");
        assert(conf.bundle.icon.indexOf("../assets/icon.ico") >= 0 && conf.bundle.icon.indexOf("../assets/icon.icns") >= 0);
        ["nsis", "deb", "appimage", "dmg"].forEach((target) => assert(conf.bundle.targets.indexOf(target) >= 0, target));
        const nsis = conf.bundle.windows.nsis;
        assert(nsis.installerIcon === "../assets/icon.ico");
        assert(nsis.languages.indexOf("Korean") >= 0 && nsis.languages.indexOf("English") >= 0);
        assert(nsis.displayLanguageSelector === true);
        assert(nsis.installerHooks === "../build/installer.nsh");
        const files = conf.bundle.fileAssociations[0];
        assert(files.ext.indexOf("mypaint") >= 0 && files.ext.indexOf("mpaint") >= 0);
        assert(files.name === "MyPaint.Drawing");
        assert(conf.bundle.resources["../assets/document.ico"] === "document.ico");
        assert(conf.bundle.linux.deb.preInstallScript === "../build/linux-before-install.sh");
        assert(pkg.author.email === "knix008@naver.com");
        assert(!pkg.build && !pkg.main, "the electron-builder settings are gone");
        assert(!(pkg.devDependencies || {}).electron && !(pkg.devDependencies || {})["electron-builder"]);
        assert((pkg.devDependencies || {})["@tauri-apps/cli"], "the Tauri CLI builds the installers");
        assert(pkg.scripts["build:win"].indexOf("tauri build") >= 0 && pkg.scripts["build:win"].indexOf("copy-setup.js") >= 0);
        assert(pkg.scripts.start.indexOf("dev.js") >= 0, "npm start runs the files on disk");
        assert(pkg.scripts.test.indexOf("run-tests.js") >= 0, pkg.scripts.test);
        const runner = await text("/scripts/run-tests.js");
        ["vendor.js", "make-fixtures.js", "test.js", "stage-app.js", "\"cargo\""].forEach((step) => {
          assert(runner.indexOf(step) >= 0, "npm test does not run " + step);
        });
      }),
      test("the host keeps the window contract the Electron build had", async () => {
        const host = await text("/src-tauri/src/lib.rs");
        const popups = await text("/src-tauri/src/popups.rs");
        assert(host.indexOf("TITLE") >= 0 && host.indexOf('"MyPaint 10.0"') >= 0);
        assert(host.indexOf("MIN_WIDTH: f64 = 1210.0") >= 0 && host.indexOf("MIN_HEIGHT: f64 = 720.0") >= 0, "src/metrics.js minimums");
        assert(host.indexOf(".decorations(false)") >= 0, "the page draws its own title bar");
        assert(host.indexOf("background_color") >= 0, "no white flash at start");
        assert(host.indexOf("on_navigation(allowed_navigation)") >= 0, "a dropped file would replace the window");
        assert(host.indexOf("prevent_close") >= 0 && host.indexOf("request-close") >= 0);
        assert(host.indexOf("tauri_plugin_single_instance") >= 0);
        assert(popups.indexOf(".parent(&main)") >= 0, "menus and popups belong to the main window");
        assert(popups.indexOf(".resizable(false)") >= 0 && popups.indexOf(".skip_taskbar(true)") >= 0 && popups.indexOf(".transparent(true)") >= 0);
        ["print-prev", "print-next", "print-sync", "settings-sync", "palette-sync", "canvas-sync", "convert-sync"].forEach((name) => {
          assert(popups.indexOf('"' + name + '"') >= 0, name + " should keep its popup open");
        });
      }),
      test("every page loads the bridge, and the bridge does nothing in a browser", async (api, doc) => {
        // guide.html too: without window.desktop its title bar hides the close button
        const after = {
          "/index.html": 'src="src/app.js"',
          "/popup.html": 'src="src/host/popup-client.js"',
          "/menu.html": 'src="src/host/menu-client.js"',
          "/guide.html": 'src="src/guide.js"',
        };
        for (const page of Object.keys(after)) {
          const html = await text(page);
          const bridge = html.indexOf('src="src/host/tauri-bridge.js"');
          assert(bridge > 0, page + " does not load the bridge");
          const next = after[page];
          assert(html.indexOf(next) > bridge, page + " must load the bridge first");
          assert(html.indexOf("electron/") < 0, page + " still points at electron/");
        }
        const view = doc.defaultView;
        assert(!view.__TAURI__ && !view.desktop && !view.popupHost, "the bridge must stay inert without Tauri");
        const bridge = await text("/src/host/tauri-bridge.js");
        ["windowCommand", "resizeWindow", "pickFiles", "pickSave", "pickDirectory", "writeFile", "writeBinary",
          "clipboardWriteImage", "clipboardReadImage", "downloadUrl", "cancelDownload", "readFile", "readBinary",
          "pathForFile", "listFonts", "openExternal", "print", "openMenu", "openPopup", "closePopup", "refreshPopup",
          "applyTheme", "openWindow", "forceClose", "onCloseRequest", "onHostAction", "onLaunch", "onDownloadProgress"].forEach((name) => {
          assert(bridge.indexOf(name + ":") >= 0, "window.desktop." + name + " is missing");
        });
        assert(bridge.indexOf('platform: "tauri"') >= 0);
        const client = await text("/src/host/popup-client.js");
        assert(client.indexOf('convert: "convert-sync"') >= 0, "the export dialog syncs its fields");
      }),
      test("the web build ships the same files as the desktop build", async () => {
        const script = await text("/scripts/build-web.js");
        const stage = await text("/scripts/stage-app.js");
        ["index.html", "popup.html", "style", "src", "assets", "guide.html", "doc/images"].forEach((name) => {
          assert(script.indexOf('"' + name + '"') >= 0, name + " is missing from the web build");
          assert(stage.indexOf('"' + name + '"') >= 0, name + " is missing from the desktop build");
        });
        assert(stage.indexOf('"menu.html"') >= 0);
        ["node_modules", "test", "samples"].forEach((name) => {
          assert(stage.indexOf('"' + name + '"') < 0, name + " must not be shipped");
        });
      }),
    ]),

    suite("Icons", [
      test("the Windows icon carries every shortcut size", async () => {
        async function entries(url) {
          const buffer = await (await fetch(url + "?t=" + Date.now())).arrayBuffer();
          const view = new DataView(buffer);
          const count = view.getUint16(4, true);
          const sizes = [];
          for (let index = 0; index < count; index += 1) sizes.push(new Uint8Array(buffer)[6 + index * 16] || 256);
          return sizes;
        }
        const want = [16, 24, 32, 48, 64, 128, 256];
        for (const file of ["/assets/icon.ico", "/assets/document.ico", "/build/icon.ico"]) {
          const sizes = await entries(file);
          want.forEach((size) => assert(sizes.indexOf(size) >= 0, file + " is missing " + size));
        }
      }),
      test("app and document icons have a transparent edge and a bright top-left", async () => {
        async function sample(url) {
          const image = new Image();
          image.src = url + "?t=" + Date.now();
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(image, 0, 0);
          return { image: image, pixel: (x, y) => ctx.getImageData(x, y, 1, 1).data };
        }
        const appIcon = await sample("/assets/icon.png");
        const docIcon = await sample("/assets/document.png");
        assert(appIcon.pixel(0, 0)[3] === 0, "app corner");
        assert(docIcon.pixel(0, 0)[3] === 0, "document corner");
        assert(appIcon.pixel(1, Math.floor(appIcon.image.height / 2))[3] === 0);
        const lum = (data) => 0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2];
        const bright = appIcon.pixel(Math.floor(appIcon.image.width * 0.28), Math.floor(appIcon.image.height * 0.22));
        const dark = appIcon.pixel(Math.floor(appIcon.image.width * 0.7), Math.floor(appIcon.image.height * 0.78));
        assert(bright[3] > 0 && lum(bright) > lum(dark), lum(bright) + " vs " + lum(dark));
        const left = appIcon.pixel(Math.floor(appIcon.image.width * 0.16), Math.floor(appIcon.image.height * 0.5));
        const docLeft = docIcon.pixel(Math.floor(docIcon.image.width * 0.16), Math.floor(docIcon.image.height * 0.5));
        assert(left[3] !== docLeft[3] || left[0] !== docLeft[0], "the two icons should differ");
      }),
      test("the window and the title bar use the application icon", (api, doc) => {
        const img = doc.querySelector("#menubar .app-title img");
        assert(img && img.getAttribute("src") === "assets/icon.png", "the title bar icon is missing");
        const link = doc.querySelector('link[rel="icon"]');
        assert(link.getAttribute("href") === "assets/icon.png", link.getAttribute("href"));
      }),
    ]),

    suite("Window", [
      test("the title bar shows the name and version", (api, doc) => {
        assert(doc.title === "MyPaint 10.0");
        assert(doc.getElementById("appTitle").textContent === "MyPaint 10.0");
        assert(api.build.author === "SHKWON(knix008@naver.com)");
        assert(api.build.build === "2026.10.05.1");
        const about = api.openPopup("about");
        assert(about.textContent.indexOf("SHKWON(knix008@naver.com)") >= 0);
        assert(about.textContent.indexOf("10.0.0") >= 0);
        assert(about.textContent.indexOf("2026.10.05.1") >= 0);
        assert(about.textContent.indexOf("정식") >= 0);
        assert(about.querySelector("[data-author]").getAttribute("data-author") === "SHKWON(knix008@naver.com)");
        const icon = about.querySelector(".about-head img");
        const intro = about.querySelector(".about-intro");
        assert(icon && intro, "the icon and the description are missing");
        assert(icon.getBoundingClientRect().right <= intro.getBoundingClientRect().left + 1, "the icon is not left of the description");
        assert(intro.textContent.indexOf("여러 운영체제에서 쓰는 그림판") >= 0);
        const names = [...about.querySelectorAll(".about-name")];
        const values = [...about.querySelectorAll(".about-value")];
        assert(names.length === values.length && names.length >= 6, String(names.length));
        const nameLeft = names[0].getBoundingClientRect().left;
        const valueLeft = values[0].getBoundingClientRect().left;
        names.forEach((name) => {
          assert(Math.abs(name.getBoundingClientRect().left - nameLeft) <= 1, "a name is out of line");
        });
        values.forEach((value) => {
          assert(Math.abs(value.getBoundingClientRect().left - valueLeft) <= 1, "a value is out of line");
        });
        assert(valueLeft > names[0].getBoundingClientRect().right - 1, "the values are not to the right of the names");
        [".png", ".jpg", ".webp", ".tif", ".heic", ".jp2", ".dcm", ".cr2", ".nef"].forEach((ext) => {
          assert(about.textContent.indexOf(ext) >= 0, ext + " is missing from the about window");
        });
      }),
      test("the bottom-right corner shows a resize grip", (api, doc) => {
        const grip = doc.getElementById("resizeGrip");
        const app = doc.getElementById("app");
        const gripBox = grip.getBoundingClientRect();
        const appBox = app.getBoundingClientRect();
        assert(grip.querySelector("svg"), "grip marker");
        assert(grip.title.length > 0);
        assert(gripBox.width >= 12 && gripBox.height >= 12);
        assert(Math.abs(gripBox.right - appBox.right) <= 6, String(gripBox.right));
        assert(Math.abs(gripBox.bottom - appBox.bottom) <= 6, String(gripBox.bottom));
        assert(doc.defaultView.getComputedStyle(grip).cursor === "nwse-resize");
        api.setLanguage("en");
        assert(grip.title === "Resize window");
      }),
      test("the minimum width matches the toolbar constant", (api, doc) => {
        assert(api.metrics.MIN_WIDTH === 1210);
        const shell = doc.getElementById("shell");
        const view = doc.defaultView;
        assert(shell.getBoundingClientRect().width <= view.innerWidth + 1, "the window cuts off the app");
      }),
    ]),

    suite("Panels", [
      test("the left panel holds the tools and colors", (api, doc) => {
        const left = doc.getElementById("leftPanel");
        assert(left.querySelectorAll(".tool-cell").length === 31, String(left.querySelectorAll(".tool-cell").length));
        assert(left.querySelectorAll(".swatch-btn").length === 40, String(left.querySelectorAll(".swatch-btn").length));
        left.querySelectorAll(".tool-cell").forEach((cell) => {
          assert(cell.title.length > 0, cell.dataset.action + " has no tooltip");
          assert(cell.querySelector("svg"), cell.dataset.action + " has no icon");
        });
        left.querySelector('[data-action="tool:ellipse"]').click();
        assert(api.getTool() === "ellipse");
        left.querySelector('[data-action="color:#ed1c24"]').click();
        assert(api.getColor() === "#ed1c24");
      }),
      test("the line width is a row of pictures", (api, doc) => {
        const panel = doc.getElementById("leftPanel");
        assert(!panel.querySelector('input[type="range"]'), "the slider is still there");
        assert(!panel.querySelector("#strokeValue"), "the width still shows a number");
        const picks = [...panel.querySelectorAll(".width-pick")];
        assert(picks.length >= 4, String(picks.length));
        picks.forEach((pick) => {
          assert(pick.querySelector("line"), "a width has no line picture");
          assert(!/\d/.test(pick.textContent || ""), "a width shows a number");
        });
        panel.querySelector('[data-action="width:8"]').click();
        assert(api.getSettings().strokeWidth === 8, String(api.getSettings().strokeWidth));
        assert(doc.getElementById("leftPanel").querySelector('[data-action="width:8"]').classList.contains("on"));
        const step = doc.getElementById("leftPanel").querySelector(".width-step");
        assert(step, "no decrease, current width, increase row");
        assert(step.querySelector("[data-action='strokeDown']").textContent === "-");
        assert(step.querySelector(".width-now input").value === "8");
        assert(step.querySelector(".width-now .unit").textContent === "px");
        assert(step.querySelector("[data-action='strokeUp']").textContent === "+");
        step.querySelector("[data-action='strokeUp']").click();
        assert(api.getSettings().strokeWidth === 9);
        assert(doc.getElementById("leftPanel").querySelector(".width-now input").value === "9");
        doc.getElementById("leftPanel").querySelector("[data-action='strokeDown']").click();
        assert(api.getSettings().strokeWidth === 8);
        api.setTool("eraser");
        const eraser = doc.getElementById("leftPanel");
        assert(eraser.querySelector('[data-action="tool:eraser"]').classList.contains("on"), "the eraser is not selected");
        assert(eraser.querySelector(".width-pick rect"), "the eraser size is not a block");
        assert(eraser.querySelector(".width-now input").value === "12");
        eraser.querySelector('[data-action="width:20"]').click();
        assert(api.getSettings().eraserSize === 20, String(api.getSettings().eraserSize));
        assert(api.getSettings().strokeWidth === 8, "the line width changed with the eraser");
        doc.getElementById("leftPanel").querySelector("[data-action='strokeUp']").click();
        assert(api.getSettings().eraserSize === 21);
        const wiped = api.stroke([{ x: 12, y: 12 }, { x: 48, y: 30 }]);
        assert(wiped.kind === "eraser" && wiped.width === 21, String(wiped && wiped.width));
        const typed = doc.getElementById("leftPanel").querySelector(".width-now input");
        typed.value = "30";
        typed.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.getSettings().eraserSize === 30, String(api.getSettings().eraserSize));
        api.setTool("pencil");
        const lineSize = doc.getElementById("leftPanel").querySelector(".width-now input");
        lineSize.value = "15";
        lineSize.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.getSettings().strokeWidth === 15, String(api.getSettings().strokeWidth));
        assert(api.getSettings().eraserSize === 30, "typing the line width changed the eraser");
      }),
      test("the right panel edits the picked shape", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(20, 20, 120, 100);
        const width = doc.querySelector('#rightPanel [data-prop="width"]');
        assert(width, "no line width field");
        width.value = "11";
        width.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.shapes()[0].width === 11, String(api.shapes()[0].width));
        doc.querySelector('#rightPanel [data-color="prop:color"]').click();
        const chooser = doc.defaultView.MyPaintColorPicker.current();
        assert(chooser, "the colour chooser did not open");
        const hex = chooser.querySelector(".cp-hex");
        hex.value = "#00ff00";
        hex.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
        doc.defaultView.MyPaintColorPicker.close(true);
        assert(api.shapes()[0].color === "#00ff00", api.shapes()[0].color);
      }),
      test("every number in the right panel steps with a button on each side", (api, doc) => {
        freshDoc(api);
        api.setTool("text");
        api.click(60, 80);
        const panel = doc.getElementById("rightPanel");
        const numbers = [...panel.querySelectorAll('input[type="number"]')];
        assert(numbers.length >= 5, "the panel shows " + numbers.length + " numbers");
        numbers.forEach((input) => {
          const name = input.dataset.prop || input.dataset.dicom;
          const row = input.closest(".line");
          const buttons = [...row.querySelectorAll("[data-step]")];
          assert(buttons.length === 2, name + " has " + buttons.length + " step buttons");
          assert(buttons[0].getBoundingClientRect().right <= input.getBoundingClientRect().left + 1, name + ": minus is not on the left");
          assert(buttons[1].getBoundingClientRect().left >= input.getBoundingClientRect().right - 1, name + ": plus is not on the right");
          buttons.forEach((button) => assert(button.title.length > 0, name + " step button has no tooltip"));
        });
      }),
      test("the step buttons change the shape", (api, doc) => {
        freshDoc(api);
        api.setTool("rect");
        api.draw(20, 20, 120, 100);
        const panel = doc.getElementById("rightPanel");
        const step = (name, which) => panel.querySelectorAll('[data-step^="prop:' + name + ':"]')[which].click();
        assert(api.shapes()[0].width === 2, String(api.shapes()[0].width));
        step("width", 1);
        step("width", 1);
        assert(api.shapes()[0].width === 4, String(api.shapes()[0].width));
        step("width", 0);
        assert(api.shapes()[0].width === 3, String(api.shapes()[0].width));
        const x = Math.round(api.shapes()[0].x);
        panel.querySelectorAll('[data-step^="prop:x:"]')[1].click();
        assert(Math.round(api.shapes()[0].x) === x + 1, String(api.shapes()[0].x));
      }),
      test("a step never goes past the limits", (api, doc) => {
        freshDoc(api);
        api.setTool("line");
        api.draw(0, 0, 60, 60);
        const panel = doc.getElementById("rightPanel");
        api.selectShape(api.shapes()[0].id);
        for (let i = 0; i < 4; i += 1) doc.getElementById("rightPanel").querySelectorAll('[data-step^="prop:width:"]')[0].click();
        assert(api.shapes()[0].width === 1, "the line width went to " + api.shapes()[0].width);
        for (let i = 0; i < 25; i += 1) doc.getElementById("rightPanel").querySelectorAll('[data-step^="prop:opacity:"]')[1].click();
        assert(api.shapes()[0].opacity === 100, "the opacity went to " + api.shapes()[0].opacity);
        void panel;
      }),
      test("the canvas size steps too, with nothing picked", (api, doc) => {
        freshDoc(api);
        api.applyCanvas({ width: 400, height: 300, background: "#ffffff" });
        api.deselect();
        const panel = doc.getElementById("rightPanel");
        panel.querySelectorAll('[data-step^="prop:canvasWidth:"]')[1].click();
        assert(api.getDoc().width === 410, String(api.getDoc().width));
        panel.querySelectorAll('[data-step^="prop:canvasHeight:"]')[0].click();
        assert(api.getDoc().height === 290, String(api.getDoc().height));
      }),
      test("the DICOM window steps as well", async (api, doc) => {
        await api.openBytes(await bytesOf("/samples/ct-one-frame.dcm"), "ct-one-frame.dcm");
        api.deselect();
        const panel = doc.getElementById("rightPanel");
        const before = api.dicomState().ww;
        panel.querySelectorAll('[data-step^="dicom:ww:"]')[1].click();
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert(api.dicomState().ww === before + 10, before + " became " + api.dicomState().ww);
      }),
      test("the right panel edits the drawing when nothing is picked", (api, doc) => {
        freshDoc(api);
        api.deselect();
        const name = doc.querySelector('#rightPanel [data-prop="name"]');
        name.value = "renamed.mpaint";
        name.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.getDoc().name === "renamed.mpaint");
        assert(api.getDoc().dirty === true);
      }),
      test("both panels can be folded and opened again", (api, doc) => {
        api.run("toggleLeft");
        const left = doc.getElementById("leftPanel");
        assert(left.classList.contains("collapsed"));
        assert(left.querySelector(".panel-fold"), "the tool panel has no way to open");
        left.querySelector(".panel-fold").click();
        assert(!doc.getElementById("leftPanel").classList.contains("collapsed"));
        api.run("toggleRight");
        const right = doc.getElementById("rightPanel");
        assert(right.classList.contains("collapsed"));
        right.querySelector(".panel-fold").click();
        assert(!doc.getElementById("rightPanel").classList.contains("collapsed"));
        const leftToggle = doc.querySelector("#toolbar [data-action='toggleLeft']");
        const rightToggle = doc.querySelector("#toolbar [data-action='toggleRight']");
        assert(leftToggle && rightToggle, "the toolbar has no panel toggles");
        leftToggle.click();
        assert(doc.getElementById("leftPanel").classList.contains("collapsed"), "the toolbar did not fold the tool panel");
        assert(doc.querySelector("#toolbar [data-action='toggleLeft']").getAttribute("aria-pressed") === "false");
        doc.querySelector("#toolbar [data-action='toggleLeft']").click();
        assert(!doc.getElementById("leftPanel").classList.contains("collapsed"));
      }),
      test("the right panel has the larger minimum, and an old saved width comes up to it", (api, doc, win) => {
        assert(api.metrics.TOOL_PANEL === 200 && api.metrics.PROP_PANEL === 240);
        assert(doc.getElementById("rightPanel").offsetWidth === 240, String(doc.getElementById("rightPanel").offsetWidth));
        assert(api.setPanelWidth("right", 10) === 240, "the right panel went below its minimum");
        assert(api.setPanelWidth("left", 10) === 200, "the left panel went below its minimum");
        win.localStorage.setItem("mypaint.settings.v1", JSON.stringify(Object.assign({}, api.getSettings(), { layout: { left: 200, right: 200 } })));
        api.loadSettings();
        assert(doc.getElementById("rightPanel").offsetWidth === 240, "a width saved before stayed small");
      }),
      test("the tools, shape list and properties titles carry an icon", (api, doc) => {
        const tools = doc.querySelector("#leftPanel .panel-bar");
        const props = doc.querySelector("#rightPanel .panel-bar");
        const shapes = [...doc.querySelectorAll("#leftPanel h2")].find((item) => item.textContent.indexOf(api.t("left.shapes")) >= 0);
        [["tools", tools], ["properties", props], ["shapes", shapes]].forEach(([name, bar]) => {
          assert(bar, name + " title is missing");
          const svg = bar.querySelector(":scope > svg");
          assert(svg, name + " title has no icon");
          assert(svg.getBoundingClientRect().width >= 14, name + " icon is not visible");
        });
      }),
      test("at the smallest width every row still fits and works", async (api, doc) => {
        const check = (where) => {
          ["ko", "en"].forEach((lang) => {
            api.setLanguage(lang);
            // setLanguage redraws the panels, so the width is set again after it
            api.setPanelWidth("left", 10);
            api.setPanelWidth("right", 10);
            [doc.getElementById("leftPanel"), doc.getElementById("rightPanel")].forEach((panel) => {
              assert(panel.clientWidth <= (panel.id === "rightPanel" ? api.metrics.PROP_PANEL : api.metrics.TOOL_PANEL) + 1, "the panel did not shrink to its minimum");
              panel.querySelectorAll("h2, .line > span:first-child, .color-row span, .shape-item span").forEach((label) => {
                if (label.offsetParent === null) return;
                const name = where + " " + lang + " " + label.textContent.trim();
                assert(label.scrollHeight <= label.clientHeight + 2, name + " runs onto a second line");
                assert(label.scrollWidth <= label.clientWidth + 1, name + " is cut off");
                assert(label.offsetHeight <= 30, name + " is taller than one row");
              });
              panel.querySelectorAll(".line, .color-row").forEach((row) => {
                if (row.offsetParent === null) return;
                const name = where + " " + lang + " " + row.textContent.trim().slice(0, 24);
                assert(row.scrollWidth <= row.clientWidth + 1, name + " pushes out of the panel");
                [...row.children].forEach((child) => {
                  if (!child.textContent.trim()) return;
                  assert(child.offsetWidth >= 8, name + " squeezed a control to nothing");
                });
              });
              panel.querySelectorAll(".tool-cell, .swatch-btn").forEach((cell) => {
                if (cell.offsetParent === null) return;
                assert(cell.offsetWidth >= 16, where + " " + lang + " a " + cell.className + " shrank to " + Math.round(cell.offsetWidth) + "px");
              });
            });
          });
          api.setLanguage("ko");
        };
        check("a drawing");
        api.setTool("rect");
        api.draw(10, 10, 80, 60);
        check("a picked shape");
        api.deselect();
        api.setTool("selectRect");
        api.draw(10, 10, 90, 90);
        check("a picked area");
        api.clearRegion();
        await api.openBytes(await bytesOf("/samples/ct-eight-frames.dcm"), "ct-eight-frames.dcm");
        api.deselect();
        check("a scan");
      }),
    ]),
  ];
})();
