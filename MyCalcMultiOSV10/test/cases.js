function flush(win) {
  win.document.documentElement.getBoundingClientRect();
}

function callWin(win, fn) {
  const script = win.document.createElement("script");
  script.textContent = `
    window.__testPayload = undefined;
    window.__testError = "";
    try {
      window.__testPayload = (${fn.toString()})();
    } catch (error) {
      window.__testError = error && error.message ? error.message : String(error);
    }
  `;
  win.document.documentElement.append(script);
  script.remove();
  if (win.__testError) throw new Error(win.__testError);
  return win.__testPayload;
}

function loadApp(query) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.src = `../index.html?${query}`;
    frame.title = "Feature check";
    frame.style.cssText = "width:960px;height:720px;border:0;visibility:hidden;";
    document.body.append(frame);
    const timer = setTimeout(() => {
      frame.remove();
      reject(new Error(`Timed out loading ${query}`));
    }, 8000);
    const ready = () => {
      const win = frame.contentWindow;
      if (!win || typeof win.setMode !== "function") return false;
      clearTimeout(timer);
      resolve({ frame, win });
      return true;
    };
    frame.addEventListener("load", () => {
      if (ready()) return;
      const poll = setInterval(() => {
        if (ready()) clearInterval(poll);
      }, 30);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bytesToBase64(bytes) {
  let binary = "";
  const size = 0x4000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + size, bytes.length)));
  }
  return btoa(binary);
}

suite("Expression engine", () => {
  test("Multiplication has precedence over addition", () => {
    appCall(() => {
      const value = new CalcEngine().evaluate("1+2*3");
      if (value !== 7) throw new Error(String(value));
    });
  });

  test("Parentheses change precedence", () => {
    appCall(() => {
      const value = new CalcEngine().evaluate("(1+2)*3");
      if (value !== 9) throw new Error(String(value));
    });
  });

  test("Exponentiation associates to the right", () => {
    appCall(() => {
      const value = new CalcEngine().evaluate("2^3^2");
      if (value !== 512) throw new Error(String(value));
    });
  });

  test("Unary minus is weaker than exponentiation", () => {
    appCall(() => {
      const value = new CalcEngine().evaluate("-2^2");
      if (value !== -4) throw new Error(String(value));
    });
  });

  test("Factorial binds tighter than exponentiation", () => {
    appCall(() => {
      const value = new CalcEngine().evaluate("2^3!");
      if (value !== 64) throw new Error(String(value));
    });
  });

  test("Percent divides by 100", () => {
    appCall(() => {
      const value = new CalcEngine().evaluate("50%");
      if (value !== 0.5) throw new Error(String(value));
    });
  });

  test("Juxtaposition is multiplication", () => {
    appCall(() => {
      const engine = new CalcEngine();
      const pi = engine.evaluate("2π");
      if (Math.abs(pi - 2 * Math.PI) > 1e-9) throw new Error(String(pi));
      const grouped = engine.evaluate("2(3+1)");
      if (grouped !== 8) throw new Error(String(grouped));
    });
  });

  test("sin(30) is 0.5 in DEG mode", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "deg";
      const value = engine.evaluate("sin(30)");
      if (Math.abs(value - 0.5) > 1e-9) throw new Error(String(value));
    });
  });

  test("sin(π/2) is 1 in RAD mode", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const value = engine.evaluate("sin(π/2)");
      if (Math.abs(value - 1) > 1e-9) throw new Error(String(value));
    });
  });

  test("Ans is the previous result", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.evaluate("3*4");
      const value = engine.evaluate("Ans+1");
      if (value !== 13) throw new Error(String(value));
    });
  });

  test("Division by zero is an error", () => {
    appCall(() => {
      let failed = false;
      try { new CalcEngine().evaluate("1/0"); } catch (error) { failed = /0으로/.test(error.message); }
      if (!failed) throw new Error("No error was thrown");
    });
  });

  test("Square root and cube root", () => {
    appCall(() => {
      const engine = new CalcEngine();
      if (engine.evaluate("sqrt(9)") !== 3) throw new Error("sqrt");
      let failed = false;
      try { engine.evaluate("sqrt(-1)"); } catch (error) { failed = error.message === "정의되지 않음"; }
      if (!failed) throw new Error("Negative square root");
      const cube = engine.evaluate("cbrt(-8)");
      if (Math.abs(cube + 2) > 1e-9) throw new Error(String(cube));
    });
  });

  test("Combinations and permutations", () => {
    appCall(() => {
      const engine = new CalcEngine();
      if (engine.evaluate("ncr(10,3)") !== 120) throw new Error("ncr");
      if (engine.evaluate("npr(5,2)") !== 20) throw new Error("npr");
    });
  });

  test("log is base 10 and ln is natural log", () => {
    appCall(() => {
      const engine = new CalcEngine();
      if (Math.abs(engine.evaluate("log(100)") - 2) > 1e-9) throw new Error("log");
      if (Math.abs(engine.evaluate("ln(e)") - 1) > 1e-9) throw new Error("ln");
    });
  });

  test("NORM, SCI, and ENG formatting", () => {
    appCall(() => {
      const norm = formatNumber(1234567, "norm");
      if (norm !== "1,234,567") throw new Error(norm);
      const sci = formatNumber(1234, "sci");
      if (!/e/i.test(sci)) throw new Error(sci);
      const eng = formatNumber(12345, "eng");
      if (!eng.includes("×10^")) throw new Error(eng);
    });
  });

  test("A negative result is parenthesized when chained", () => {
    appCall(() => {
      const text = formatForChain(-4);
      if (text !== "(-4)") throw new Error(text);
    });
  });
});

suite("Programmer", () => {
  test("FF+1 wraps to 0 in 8 bits", () => {
    appCall(() => {
      const value = evaluateInt("FF+1", 16, 8);
      if (value !== 0n) throw new Error(value.toString());
    });
  });

  test("NOT 0 is -1 in 8 bits", () => {
    appCall(() => {
      const value = formatInt(evaluateInt("~0", 16, 8), 10, 8);
      if (value !== "-1") throw new Error(value);
    });
  });

  test("All F in 64 bits is -1", () => {
    appCall(() => {
      const value = formatInt(evaluateInt("FFFFFFFFFFFFFFFF", 16, 64), 10, 64);
      if (value !== "-1") throw new Error(value);
    });
  });

  test("XOR and shift", () => {
    appCall(() => {
      const xor = evaluateInt("F0^0F", 16, 8);
      if (formatInt(xor, 16, 8).replace(/\s/g, "") !== "FF") throw new Error(formatInt(xor, 16, 8));
      const shifted = evaluateInt("1<<4", 10, 8);
      if (shifted !== 16n) throw new Error(shifted.toString());
    });
  });

  test("Binary groups nibbles and hex groups bytes", () => {
    appCall(() => {
      const bin = formatInt(255n, 2, 8);
      if (bin !== "1111 1111") throw new Error(bin);
      const hex = formatInt(0xABCDn, 16, 16);
      if (hex !== "AB CD") throw new Error(hex);
    });
  });

  test("The A key is disabled in decimal", () => {
    const doc = appWindow.document;
    appWindow.setMode("programmer");
    appWindow.setBase(10);
    const hexKey = [...doc.querySelectorAll("#keys button")].find((button) => button.textContent === "A");
    assert(hexKey && hexKey.disabled, "A key is still enabled");
    appWindow.setBase(16);
    const hexKey16 = [...doc.querySelectorAll("#keys button")].find((button) => button.textContent === "A");
    assert(hexKey16 && !hexKey16.disabled, "A key is locked in hexadecimal");
  });

  test("A leading zero is replaced by the next digit", () => {
    const doc = appWindow.document;
    appWindow.setMode("programmer");
    appWindow.setBase(16);
    doc.getElementById("progExpr").value = "0";
    appWindow.insertProg("F");
    assert(doc.getElementById("progExpr").value === "F", doc.getElementById("progExpr").value);
  });
});

suite("Screen and modes", () => {
  test("The toolbar flag switches Korean and English", () => {
    const doc = appWindow.document;
    const saved = localStorage.getItem("mycalc-lang");
    try {
      appWindow.applyLanguage("ko");
      const flag = doc.getElementById("langFlag");
      const settings = doc.getElementById("settingsBtn");
      assert(flag.getAttribute("src").includes("flag-uk"), flag.getAttribute("src"));
      assert(settings.getAttribute("aria-label") === "설정", settings.getAttribute("aria-label"));
      doc.getElementById("langBtn").click();
      assert(flag.getAttribute("src").includes("flag-kr"), flag.getAttribute("src"));
      assert(settings.getAttribute("aria-label") === "Settings", settings.getAttribute("aria-label"));
      assert(doc.documentElement.lang === "en", doc.documentElement.lang);
      doc.getElementById("langBtn").click();
      assert(flag.getAttribute("src").includes("flag-uk"), flag.getAttribute("src"));
      assert(settings.getAttribute("aria-label") === "설정", settings.getAttribute("aria-label"));
    } finally {
      appWindow.applyLanguage("ko");
      if (saved == null) localStorage.removeItem("mycalc-lang");
      else localStorage.setItem("mycalc-lang", saved);
    }
  });

  test("Title and info panel include version 10.0", () => {
    const doc = appWindow.document;
    assert(doc.title === "MyCalc 10.0", doc.title);
    assert(doc.querySelector("h1").textContent.includes("10.0"), "Heading");
    appWindow.openSheet(doc.getElementById("infoSheet"));
    assert(doc.querySelector(".info-name").textContent === "MyCalc 10.0", "Info panel");
    appWindow.closeSheets();
  });

  test("Each mode uses its own window size", () => {
    const win = appWindow;
    const doc = win.document;
    const app = doc.querySelector(".app");
    doc.documentElement.classList.remove("desktop");
    const size = () => {
      const rect = app.getBoundingClientRect();
      return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    };
    const keyShape = () => {
      const key = doc.querySelector("#keys .key");
      const keyRect = key.getBoundingClientRect();
      const appRect = app.getBoundingClientRect();
      const last = [...doc.querySelectorAll("#keys .key")].pop().getBoundingClientRect();
      return {
        wide: keyRect.width + 1 >= keyRect.height,
        inside: last.bottom <= appRect.bottom + 1 && last.right <= appRect.right + 1,
      };
    };
    win.setMode("basic");
    flush(win);
    assert(size() === "360x594", size());
    win.setMode("scientific");
    flush(win);
    assert(size() === "560x594", size());
    const scientific = keyShape();
    doc.querySelector('#keys .key').click();
    const inverse = [...doc.querySelectorAll("#keys .key")].find((button) => button.textContent.includes("⁻¹"));
    assert(scientific.wide && scientific.inside, "Scientific keys");
    assert(inverse && inverse.scrollWidth <= inverse.clientWidth + 1, inverse ? inverse.textContent : "Inverse label");
    win.setMode("programmer");
    flush(win);
    assert(size() === "480x700", size());
    const programmer = keyShape();
    assert(programmer.wide && programmer.inside, "Programmer keys");
    win.setMode("graph");
    flush(win);
    assert(size() === "360x560", size());
    win.setMode("basic");
  });

  test("1+2×3 is 7 in basic mode", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    appWindow.setAngle("deg");
    doc.getElementById("expr").value = "1+2*3";
    appWindow.equals();
    assert(doc.getElementById("result").textContent === "7", doc.getElementById("result").textContent);
  });

  test("An operator after equals continues from the result", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    doc.getElementById("expr").value = "5+4";
    appWindow.equals();
    appWindow.insertOperator("+");
    assert(doc.getElementById("expr").value === "9+", doc.getElementById("expr").value);
  });

  test("Info and settings open one at a time", () => {
    const doc = appWindow.document;
    const info = doc.getElementById("infoSheet");
    const settings = doc.getElementById("settingsSheet");
    appWindow.openSheet(info);
    assert(!info.hidden && settings.hidden, "Info");
    appWindow.openSheet(settings);
    assert(info.hidden && !settings.hidden, "Settings");
    appWindow.closeSheets();
    assert(info.hidden && settings.hidden, "Close");
  });

  test("The settings sheet does not scroll", () => {
    const doc = appWindow.document;
    const sheet = doc.getElementById("settingsSheet");
    appWindow.openSheet(sheet);
    const gap = sheet.scrollHeight - sheet.clientHeight;
    assert(gap === 0, String(gap));
    appWindow.closeSheets();
  });
});

suite("Scientific and memory", () => {
  test("DEG and RAD toggle", () => {
    const button = appWindow.document.getElementById("angleBtn");
    appWindow.setMode("scientific");
    appWindow.setAngle("deg");
    assert(button.textContent === "DEG", button.textContent);
    button.click();
    assert(button.textContent === "RAD" && button.getAttribute("aria-pressed") === "true", button.textContent);
    appWindow.setAngle("deg");
  });

  test("NORM, SCI, and ENG cycle", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    doc.getElementById("expr").value = "1234";
    appWindow.equals();
    appWindow.setNotation("sci");
    assert(/e/i.test(doc.getElementById("result").textContent), doc.getElementById("result").textContent);
    appWindow.setNotation("eng");
    assert(doc.getElementById("notationBtn").textContent === "ENG", "ENG");
    appWindow.setNotation("norm");
    assert(doc.getElementById("result").textContent === "1,234", doc.getElementById("result").textContent);
  });

  test("2nd switches keys to inverse functions", () => {
    const doc = appWindow.document;
    appWindow.setMode("scientific");
    const findSecond = () => [...doc.querySelectorAll("#keys button")].find((button) => button.textContent === "2nd");
    findSecond().click();
    const inverse = [...doc.querySelectorAll("#keys button")].some((button) => button.textContent === "sin⁻¹");
    assert(inverse, "Inverse key is missing");
    findSecond().click();
  });

  test("Memory add and clear", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    doc.getElementById("memClear").click();
    doc.getElementById("expr").value = "5";
    appWindow.equals();
    doc.getElementById("memAdd").click();
    assert(!doc.getElementById("memFlag").hidden, "M indicator");
    doc.getElementById("expr").value = "";
    doc.getElementById("memRecall").click();
    assert(doc.getElementById("expr").value === "5", doc.getElementById("expr").value);
    doc.getElementById("memClear").click();
    assert(doc.getElementById("memFlag").hidden, "MC");
  });
});

suite("Graph", () => {
  test("2D sin(x) is sampled in radians", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("2d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      engine.angleMode = "deg";
      const fn = board.addFunction("sin(x)");
      const sample = board.sample(fn.ast, Math.PI / 2);
      if (Math.abs(sample - 1) > 1e-6) throw new Error(String(sample));
      if (engine.angleMode !== "deg") throw new Error("Angle mode changed");
    });
  });

  test("2D axes show numbers and the curve stays connected", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("2d");
      board.resetView();
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("sin(x)");
      board.canvas.width = 640;
      board.canvas.height = 360;
      board.draw();
      const ticks = board.axisTicks(board.view.xMin, board.view.xMax, 8);
      if (!ticks.includes(0) || ticks.length < 4) throw new Error(ticks.join(","));
      const data = board.ctx.getImageData(0, 0, 640, 360).data;
      let columns = 0;
      for (let x = 0; x < 640; x += 2) {
        for (let y = 0; y < 360; y += 2) {
          const i = (y * 640 + x) * 4;
          if (data[i] > 190 && data[i + 1] > 90 && data[i + 1] < 190 && data[i + 2] < 130) {
            columns += 1;
            break;
          }
        }
      }
      if (columns < 80) throw new Error(String(columns));
    });
  });

  test("The graph opens in a separate window", () => {
    const doc = appWindow.document;
    const tab = doc.querySelector('.modes button[data-mode="graph"]');
    assert(tab, "Graph tab");
    assert(typeof appWindow.openGraphWindow === "function", "openGraphWindow");
    assert(!doc.getElementById("graphPopBtn"), "Graph stays out of the calculator");
    appWindow.setMode("graph");
    flush(appWindow);
    assert(doc.getElementById("dim2d").textContent === "2D" && doc.getElementById("dim3d").textContent === "3D", "2D/3D");
    appWindow.setMode("basic");
  });

  test("2D drag pans the view", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("2d");
      board.resetView();
      const rect = board.canvas.getBoundingClientRect();
      if (rect.width < 20) throw new Error("Canvas has no size");
      const before = board.view.xMin;
      board.onPointerDown({ pointerId: 1, clientX: rect.left + 80, clientY: rect.top + 40 });
      board.onPointerMove({ pointerId: 1, clientX: rect.left + 140, clientY: rect.top + 40 });
      board.onPointerUp({ pointerId: 1, type: "pointerup" });
      if (board.view.xMin === before) throw new Error("View did not pan");
    });
  });

  test("A 3D surface mesh is built", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("sin(x)*cos(y)");
      board.canvas.width = 640;
      board.canvas.height = 420;
      board.draw();
      const mesh = board.meshes[0];
      if (!mesh || mesh.n < 48 || mesh.z.length !== mesh.n * mesh.n) throw new Error("Mesh is missing");
      let finite = 0;
      for (const value of mesh.z) if (Number.isFinite(value)) finite += 1;
      if (finite < 1000) throw new Error(String(finite));
    });
  });

  test("3D grid and axis values can be switched", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    flush(appWindow);
    doc.getElementById("dim3d").click();
    const grid = doc.getElementById("gridToggle");
    const axes = doc.getElementById("axisToggle");
    assert(!grid.hidden && !axes.hidden, "Toggles are hidden");
    assert(grid.getAttribute("aria-pressed") === "true", "Grid starts off");
    assert(axes.getAttribute("aria-pressed") === "true", "Axis values start off");
    grid.click();
    assert(grid.getAttribute("aria-pressed") === "false", "Grid did not turn off");
    axes.click();
    assert(axes.getAttribute("aria-pressed") === "false", "Axis values did not turn off");
    appCall(() => {
      if (board.showGrid || board.showAxisValues) throw new Error("Flags stayed on");
      const ticks = board.axisTicks(-5, 5);
      if (!ticks.includes(0) || ticks.length < 3) throw new Error(ticks.join(","));
      board.canvas.width = 640;
      board.canvas.height = 420;
      board.draw();
    });
    grid.click();
    axes.click();
    doc.getElementById("dim2d").click();
    assert(!grid.hidden, "Grid toggle is hidden in 2D");
    assert(axes.hidden, "Axis value toggle stays in 3D");
    grid.click();
    assert(grid.getAttribute("aria-pressed") === "false", "2D grid did not turn off");
    appCall(() => {
      if (board.showGrid) throw new Error("2D grid stayed on");
    });
    grid.click();
  });

  test("3D drag rotates the camera", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      const rect = board.canvas.getBoundingClientRect();
      if (rect.width < 20) throw new Error("Canvas has no size");
      const yaw = board.camera.yaw;
      board.onPointerDown({ pointerId: 1, clientX: rect.left + 30, clientY: rect.top + 30 });
      board.onPointerMove({ pointerId: 1, clientX: rect.left + 120, clientY: rect.top + 30 });
      if (board.camera.yaw === yaw) throw new Error("Camera did not rotate");
      if (!board.hoverLabel.includes("좌우")) throw new Error(board.hoverLabel || "No angle label");
      board.onPointerUp({ pointerId: 1, type: "pointerup" });
    });
  });

  test("The wheel changes 2D range and 3D zoom", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("2d");
      board.resetView();
      const width = board.view.xMax - board.view.xMin;
      const rect = board.canvas.getBoundingClientRect();
      board.onWheel({ preventDefault() {}, deltaY: 120, clientX: rect.left + 40, clientY: rect.top + 40 });
      if (!(board.view.xMax - board.view.xMin > width)) throw new Error("2D zoom");
      board.setDimension("3d");
      board.resetView();
      const span = board.view.xMax - board.view.xMin;
      const zoom = board.camera.zoom;
      board.onWheel({ preventDefault() {}, deltaY: -120, clientX: rect.left + 40, clientY: rect.top + 40 });
      const next = board.view.xMax - board.view.xMin;
      if (next !== span) throw new Error("3D range changed");
      if (!(board.camera.zoom > zoom)) throw new Error("3D pose did not zoom");
      const scene = board.scene;
      const key = board.meshKey;
      board.camera.yaw += 0.4;
      board.draw();
      if (board.meshKey !== key || board.scene !== scene) throw new Error("Rotation rebuilt the surface");
      board.setView({ xMin: board.view.xMin - 1, xMax: board.view.xMax + 1, yMin: board.view.yMin, yMax: board.view.yMax });
      if (board.meshKey === key) throw new Error("Axis change reused the surface");
      const edge = board.meshes[0];
      if (edge && board.localGridPoint) {
        const first = board.localGridPoint(0, 0, edge.n, 0);
        const last = board.localGridPoint(edge.n - 1, edge.n - 1, edge.n, 0);
        if (Math.abs(first.x + 1) > 1e-9 || Math.abs(last.x - 1) > 1e-9) throw new Error("Surface no longer fills the view");
      }
    });
  });

  test("An invalid view range is rejected", () => {
    appCall(() => {
      let failed = false;
      try { board.setView({ xMin: 5, xMax: 1 }); } catch (error) { failed = /범위/.test(error.message); }
      if (!failed) throw new Error("No range error");
    });
  });

  test("At most 8 functions can be added", () => {
    appCall(() => {
      board.setDimension("2d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      for (let i = 0; i < 8; i++) board.addFunction(`x+${i}`);
      let failed = false;
      try { board.addFunction("x+9"); } catch (error) { failed = /8개/.test(error.message); }
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      if (!failed) throw new Error("No count limit");
    });
  });

  test("2D and 3D presets switch", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    flush(appWindow);
    doc.getElementById("dim2d").click();
    assert([...doc.querySelectorAll("#presets button")].some((button) => button.textContent === "sin(x)"), "2D");
    doc.getElementById("dim3d").click();
    assert([...doc.querySelectorAll("#presets button")].some((button) => button.textContent === "sin(x)*cos(y)"), "3D");
    doc.getElementById("dim2d").click();
  });

  test("Each graph can set its legend label and visibility", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    flush(appWindow);
    doc.getElementById("dim2d").click();
    appCall(() => {
      board.showLegend = true;
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x");
      board.addFunction("x+1");
      board.canvas.width = 640;
      board.canvas.height = 360;
      board.draw();
    });
    appWindow.renderFunctions();
    assert(!doc.querySelector(".fn-legend"), "Legend field stays in the list");
    assert(!doc.getElementById("legendAdd"), "Legend add button");
    const legendButton = doc.getElementById("legendToggle");
    assert(legendButton.dataset.tooltip === "범례 On/Off", legendButton.dataset.tooltip);
    assert(legendButton.getAttribute("aria-pressed") === "true", "Legend starts on");
    doc.querySelector("#fnList li").click();
    const selected = appCall(() => board.selectedId);
    assert(selected === appCall(() => board.functions[0].id), "Expression was not selected");
    assert(doc.querySelector("#fnList li").classList.contains("is-selected"), "Row selection");
    assert(appCall(() => board.legendHits.some((hit) => hit.id === board.selectedId)), "Legend selection");
    const firstHit = appCall(() => board.legendHits[0]);
    const plot = doc.getElementById("plot");
    const plotRect = plot.getBoundingClientRect();
    plot.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: plotRect.left + ((firstHit.x + firstHit.w / 2) / plot.width) * plotRect.width,
      clientY: plotRect.top + ((firstHit.y + firstHit.h / 2) / plot.height) * plotRect.height,
    }));
    const editor = doc.getElementById("legendEditor");
    assert(!editor.hidden, "Legend editor");
    editor.value = "일차";
    editor.dispatchEvent(new Event("blur"));
    assert(appCall(() => board.functions[0].legendText) === "일차", "Legend text");
    assert(appCall(() => board.legendHits.length) > 0, "Legend rows");
    doc.getElementById("legendToggle").click();
    assert(doc.getElementById("legendToggle").getAttribute("aria-pressed") === "false", "Legend button");
    assert(appCall(() => board.showLegend) === false, "Legend is still on");
    assert(appCall(() => board.legendHits.length) === 0, "Legend stayed visible");
    doc.getElementById("legendToggle").click();
    assert(appCall(() => board.legendHits.length) > 0, "Legend stayed hidden");
    const hit = appCall(() => {
      board.draw();
      return board.legendHits[0];
    });
    const canvas = doc.getElementById("plot");
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      clientX: rect.left + ((hit.x + hit.w / 2) / canvas.width) * rect.width,
      clientY: rect.top + ((hit.y + hit.h / 2) / canvas.height) * rect.height,
    }));
    assert(!editor.hidden, "Double-click editor");
    assert(appCall(() => board.selectedId) === hit.id, "Double-click selection");
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(editor.hidden, "Escape leaves the legend editor open");
    appCall(() => {
      board.showLegend = true;
      while (board.functions.length) board.removeFunction(board.functions[0].id);
    });
  });

  test("The range controls stay on one line in the graph window", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
    const doc = loaded.win.document;
    flush(loaded.win);
    doc.getElementById("dim2d").click();
    callWin(loaded.win, () => board.resetView());
    const square = callWin(loaded.win, () => {
      const across = board.canvas.width / (board.view.xMax - board.view.xMin);
      const down = board.canvas.height / (board.view.yMax - board.view.yMin);
      return { across, down, view: [board.view.xMin, board.view.xMax, board.view.yMin, board.view.yMax] };
    });
    assert(Math.abs(square.across - square.down) / square.across < 0.01, `2D units differ ${square.across} vs ${square.down}`);
    assert(square.view[0] <= -10 && square.view[1] >= 10 && square.view[2] <= -10 && square.view[3] >= 10, `2D default range ${square.view.join(",")}`);
    const row = doc.querySelector(".view-row");
    const label = row.querySelector("label");
    const rowStyle = getComputedStyle(row);
    const labelStyle = getComputedStyle(label);
    assert(rowStyle.flexWrap === "nowrap", rowStyle.flexWrap);
    assert(labelStyle.flexDirection === "row", labelStyle.flexDirection);
    assert(doc.getElementById("zMinField").hidden, "Z range is shown in 2D");
    for (const input of row.querySelectorAll("input")) {
      if (input.closest("label").hidden) continue;
      const wrap = input.closest(".num-step");
      const down = wrap.querySelector(".step-down").getBoundingClientRect();
      const up = wrap.querySelector(".step-up").getBoundingClientRect();
      const box = input.getBoundingClientRect();
      assert(down.width > 0 && down.right <= box.left + 1, `${input.id} decrease`);
      assert(up.width > 0 && up.left >= box.right - 1, `${input.id} increase`);
      assert(getComputedStyle(input).textAlign === "center", `${input.id} centered`);
    }
    const xMax = doc.getElementById("xMax");
    const before = Number(xMax.value);
    xMax.closest(".num-step").querySelector(".step-up").click();
    assert(Number(xMax.value) === before + 1, xMax.value);
    assert(callWin(loaded.win, () => board.view.xMax) === before + 1, "View did not increase by 1");
    const yMin = doc.getElementById("yMin");
    const yBefore = Number(yMin.value);
    yMin.closest(".num-step").querySelector(".step-down").click();
    assert(Number(yMin.value) === yBefore - 1, yMin.value);
    doc.getElementById("dim3d").click();
    flush(loaded.win);
    doc.getElementById("resetView").click();
    const resetRange = callWin(loaded.win, () => [board.view.xMin, board.view.xMax, board.view.yMin, board.view.yMax].join(","));
    assert(resetRange === "-10,10,-10,10", `3D default range ${resetRange}`);
    const zRange = callWin(loaded.win, () => [board.view.zMin, board.view.zMax]);
    assert(zRange[1] > 0 && Math.abs(zRange[0] + zRange[1]) < 1e-9, `3D height ${zRange.join(",")}`);
    assert(!doc.getElementById("zMinField").hidden && !doc.getElementById("zMaxField").hidden, "Z range is hidden in 3D");
    const zMax = doc.getElementById("zMax");
    const zBefore = Number(zMax.value);
    zMax.closest(".num-step").querySelector(".step-up").click();
    assert(callWin(loaded.win, () => board.view.zMax) === zBefore + 1, "Z range did not increase by 1");
    const centers = [...row.children].filter((child) => !child.hidden).map((child) => {
      const box = child.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    assert(Math.max(...centers) - Math.min(...centers) <= 4, centers.join(","));
    const colorBox = doc.getElementById("axisColorX").getBoundingClientRect();
    const rangeBox = doc.getElementById("xMin").getBoundingClientRect();
    assert(row.parentElement.id === "axisBar", "Range row left the axis bar");
    assert(doc.getElementById("axisColorX").closest(".graph-tool-row"), "Axis colors left the toolbar row");
    assert(rangeBox.top >= colorBox.bottom - 1, "Axis colors are not above the range row");
    doc.getElementById("dim2d").click();
    } finally {
      loaded.frame.remove();
    }
  });

  test("The plot uses the window background", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    const wrap = appWindow.document.querySelector(".canvas-wrap");
    const canvas = appWindow.document.getElementById("plot");
    const style = appWindow.getComputedStyle(wrap);
    const rect = wrap.getBoundingClientRect();
    assert(canvas.parentElement === wrap, "Canvas is outside the plot");
    assert(style.backgroundColor === "rgba(0, 0, 0, 0)", style.backgroundColor);
    assert(style.backgroundImage === "none", style.backgroundImage);
    assert(parseFloat(style.borderTopWidth) === 0, style.borderTopWidth);
    assert(rect.width > 40 && rect.height > 40, `${rect.width}x${rect.height}`);
  });

  test("The legend can be dragged", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x");
      board.showLegend = true;
      board.legendPos = null;
      board.canvas.width = 640;
      board.canvas.height = 360;
      board.draw();
      const rect = board.canvas.getBoundingClientRect();
      const box = board.legendBox;
      if (!box || rect.width < 20) throw new Error("Legend box is missing");
      const yaw = board.camera.yaw;
      const xMin = board.view.xMin;
      const clientX = rect.left + ((box.x + box.w / 2) / board.canvas.width) * rect.width;
      const clientY = rect.top + ((box.y + 8) / board.canvas.height) * rect.height;
      board.onPointerDown({ pointerId: 4, clientX, clientY });
      board.onPointerMove({ pointerId: 4, clientX: clientX - 80, clientY: clientY + 50 });
      board.draw();
      if (!(board.legendBox.x < box.x - 10)) throw new Error("Legend did not move");
      if (board.camera.yaw !== yaw) throw new Error("Legend drag rotated the camera");
      if (board.view.xMin !== xMin) throw new Error("Legend drag panned the view");
      board.onPointerUp({ pointerId: 4, type: "pointerup" });
      board.draw();
      const stillYaw = board.camera.yaw;
      const stillView = board.view.xMin;
      const stillPos = board.legendPos ? { ...board.legendPos } : null;
      const clickX = rect.left + ((board.legendBox.x + 8) / board.canvas.width) * rect.width;
      const clickY = rect.top + ((board.legendBox.y + 8) / board.canvas.height) * rect.height;
      board.onPointerDown({ pointerId: 8, detail: 1, clientX: clickX, clientY: clickY });
      board.onPointerMove({ pointerId: 8, clientX: clickX + 3, clientY: clickY + 2 });
      board.onPointerUp({ pointerId: 8, type: "pointerup" });
      board.onPointerDown({ pointerId: 8, detail: 2, clientX: clickX + 3, clientY: clickY + 2 });
      board.onPointerMove({ pointerId: 8, clientX: clickX + 5, clientY: clickY + 4 });
      board.onPointerUp({ pointerId: 8, type: "pointerup" });
      if (board.camera.yaw !== stillYaw) throw new Error("Double-click rotated the graph");
      if (board.view.xMin !== stillView) throw new Error("Double-click panned the graph");
      const after = board.legendPos;
      if (!stillPos || !after || Math.abs(after.x - stillPos.x) > 0.002 || Math.abs(after.y - stillPos.y) > 0.002) throw new Error("Double-click moved the legend");
      board.setDimension("2d");
    });
  });

  test("Moving the 3D surface keeps every face", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x");
      board.draw();
      const faces = () => board.projectScene().filter((item) => item.kind !== "line").length;
      const still = faces();
      if (still < 100) throw new Error(String(still));
      board.fastPaint = true;
      board.drag = { mode: "rotate", px: 0, py: 0, yaw: board.camera.yaw, pitch: board.camera.pitch };
      const moving = faces();
      const quick = board.projectScene(true).filter((item) => item.kind !== "line").length;
      board.fastPaint = false;
      board.drag = null;
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
      if (moving !== still) throw new Error(`${moving} vs ${still}`);
      if (quick !== still) throw new Error(`motion ${quick} vs ${still}`);
    });
  });

  test("The plot shows a hand pointer", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    const canvas = appWindow.document.getElementById("plot");
    const cursor = () => appWindow.getComputedStyle(canvas).cursor;
    appCall(() => board.setDimension("2d"));
    assert(cursor() === "pointer", cursor());
    appCall(() => board.setDimension("3d"));
    assert(cursor() === "pointer", cursor());
    canvas.classList.add("dragging");
    assert(cursor() === "grabbing", cursor());
    canvas.classList.remove("dragging");
  });
});

suite("Currency", () => {
  test("Rates convert both ways", () => {
    appCall(() => {
      const table = { base: "USD", live: true, stamp: "now", fetchedAt: Date.now(), rates: { USD: 1, KRW: 1300, EUR: 0.9 } };
      const won = convertRate(2, "USD", "KRW", table);
      if (Math.abs(won - 2600) > 1e-9) throw new Error(String(won));
      const back = convertRate(won, "KRW", "USD", table);
      if (Math.abs(back - 2) > 1e-9) throw new Error(String(back));
      const euro = convertRate(100, "KRW", "EUR", table);
      if (Math.abs(euro - (100 / 1300) * 0.9) > 1e-9) throw new Error(String(euro));
      if (Number.isFinite(convertRate(1, "USD", "XXX", table))) throw new Error("An unknown currency converted");
      if (rateCodes(table)[0] !== "KRW") throw new Error(rateCodes(table).join(","));
    });
  });

  test("The last rates are kept when the network is down", async () => {
    const saved = localStorage.getItem("mycalc-rates");
    localStorage.setItem("mycalc-rates", JSON.stringify({
      base: "USD",
      live: true,
      stamp: "earlier",
      fetchedAt: Date.now() - 1000 * 60 * 60 * 24,
      rates: { USD: 1, KRW: 1234, EUR: 0.9, JPY: 150 },
    }));
    const loaded = await loadApp("");
    try {
      loaded.win.fetch = () => Promise.reject(new Error("offline"));
      loaded.win.applyLanguage("ko");
      callWin(loaded.win, () => {
        setMode("currency");
        state.currency.amount = "1";
        state.currency.from = "USD";
        state.currency.to = "KRW";
        renderCurrency();
      });
      await wait(120);
      const shown = callWin(loaded.win, () => ({
        live: rateTable.live,
        krw: rateTable.rates.KRW,
        state: document.getElementById("rateState").textContent,
        result: document.getElementById("rateResult").textContent,
      }));
      assert(shown.krw === 1234, String(shown.krw));
      assert(shown.live === false, "The app still calls the rates live");
      assert(Number(shown.result.replace(/,/g, "")) === 1234, shown.result);
      assert(shown.state.includes("\uc624\ud504\ub77c\uc778"), shown.state);
    } finally {
      loaded.frame.remove();
      if (saved == null) localStorage.removeItem("mycalc-rates");
      else localStorage.setItem("mycalc-rates", saved);
    }
  });

  test("Coming back online brings fresh rates", async () => {
    const saved = localStorage.getItem("mycalc-rates");
    localStorage.removeItem("mycalc-rates");
    const loaded = await loadApp("");
    try {
      loaded.win.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          base_code: "USD",
          time_last_update_utc: "fresh",
          rates: { USD: 1, KRW: 1400, EUR: 0.88, JPY: 152 },
        }),
      });
      callWin(loaded.win, () => {
        setMode("currency");
        state.currency.from = "USD";
        state.currency.to = "KRW";
        state.currency.amount = "2";
      });
      await wait(140);
      const shown = callWin(loaded.win, () => {
        renderCurrency();
        return {
          live: rateTable.live,
          krw: rateTable.rates.KRW,
          result: document.getElementById("rateResult").textContent,
        };
      });
      assert(shown.live === true, "The fresh rates were ignored");
      assert(shown.krw === 1400, String(shown.krw));
      assert(Number(shown.result.replace(/,/g, "")) === 2800, shown.result);
      const stored = JSON.parse(localStorage.getItem("mycalc-rates"));
      assert(stored && stored.rates.KRW === 1400, "The rates were not kept for next time");
    } finally {
      loaded.frame.remove();
      if (saved == null) localStorage.removeItem("mycalc-rates");
      else localStorage.setItem("mycalc-rates", saved);
    }
  });

  test("The currency keypad types an amount and swaps", async () => {
    const loaded = await loadApp("");
    try {
      loaded.win.fetch = () => Promise.reject(new Error("offline"));
      const doc = loaded.win.document;
      callWin(loaded.win, () => {
        setMode("currency");
        state.currency.from = "USD";
        state.currency.to = "KRW";
        setCurrencyAmount("0");
      });
      await wait(60);
      assert(!doc.getElementById("screenRates").hidden, "The currency screen is hidden");
      const keys = [...doc.querySelectorAll("#keys .key")];
      const press = (label) => {
        const key = keys.find((button) => button.textContent === label);
        assert(key, `${label} key`);
        key.click();
      };
      press("1");
      press("2");
      press("00");
      const typed = callWin(loaded.win, () => state.currency.amount);
      assert(typed === "1200", typed);
      const before = callWin(loaded.win, () => [state.currency.from, state.currency.to].join(","));
      doc.getElementById("rateSwap").click();
      const after = callWin(loaded.win, () => [state.currency.from, state.currency.to].join(","));
      assert(after === before.split(",").reverse().join(","), `${before} -> ${after}`);
      press("AC");
      assert(callWin(loaded.win, () => state.currency.amount) === "0", "AC did not clear the amount");
      const grid = doc.querySelector("#keys .keygrid");
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      assert(columns === 4, `${columns} columns`);
    } finally {
      loaded.frame.remove();
    }
  });
});

suite("Themes and settings", () => {
  test("20 dark and 20 light themes are grouped", () => {
    const doc = appWindow.document;
    appCall(() => {
      const dark = THEMES.filter((theme) => theme.group === "dark");
      const light = THEMES.filter((theme) => theme.group === "light");
      if (dark.length !== 20 || light.length !== 20) throw new Error(`${dark.length}/${light.length}`);
      const ids = new Set(THEMES.map((theme) => theme.id));
      if (ids.size !== 40) throw new Error("Duplicate ids");
    });
    appWindow.openSheet(doc.getElementById("settingsSheet"));
    assert(doc.querySelectorAll("#darkThemes .theme-chip").length === 20, "Dark chips");
    assert(doc.querySelectorAll("#lightThemes .theme-chip").length === 20, "Light chips");
    appWindow.closeSheets();
  });

  test("A custom theme is applied", () => {
    const saved = localStorage.getItem("mycalc-theme");
    try {
      appCall(() => {
        const theme = themeFromCustom({
          bg: "#ffffff",
          card: "#f8fafc",
          screen: "#ffffff",
          ink: "#111111",
          key: "#e5e7eb",
          op: "#1d4ed8",
          eq: "#15803d",
        });
        if (theme.group !== "light") throw new Error(theme.group);
        applyTheme(theme);
        const bg = document.documentElement.style.getPropertyValue("--bg");
        if (bg !== "#ffffff") throw new Error(bg);
      });
    } finally {
      if (saved == null) localStorage.removeItem("mycalc-theme");
      else localStorage.setItem("mycalc-theme", saved);
      appWindow.loadTheme();
    }
  });

  test("The chosen theme is stored and reloaded", () => {
    const saved = localStorage.getItem("mycalc-theme");
    try {
      appCall(() => {
        storeTheme({ id: "light-1" });
        const loaded = loadTheme();
        if (loaded.id !== "light-1") throw new Error(loaded.id);
        if (document.documentElement.dataset.scheme !== "light") throw new Error("Light scheme");
      });
    } finally {
      if (saved == null) localStorage.removeItem("mycalc-theme");
      else localStorage.setItem("mycalc-theme", saved);
      appWindow.loadTheme();
    }
  });
});

suite("Product features", () => {
  test("The calculator card is 360 by 594", () => {
    const app = appWindow.document.querySelector(".app");
    appWindow.document.documentElement.classList.remove("desktop");
    appWindow.setMode("basic");
    flush(appWindow);
    const rect = app.getBoundingClientRect();
    assert(Math.round(rect.width) === 360 && Math.round(rect.height) === 594, `${rect.width}x${rect.height}`);
    assert(rect.height / rect.width > 1.5 && rect.height / rect.width < 1.7, `${rect.width}x${rect.height}`);
  });

  test("A result does not resize the keys", () => {
    const doc = appWindow.document;
    doc.documentElement.classList.remove("desktop");
    appWindow.setMode("basic");
    flush(appWindow);
    appCall(() => {
      state.history = [];
      renderHistory();
    });
    flush(appWindow);
    const before = doc.querySelector("#keys .key").getBoundingClientRect();
    doc.getElementById("expr").value = "123456789*987654321";
    appCall(() => equals());
    flush(appWindow);
    const after = doc.querySelector("#keys .key").getBoundingClientRect();
    assert(Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1, `${Math.round(before.width)}x${Math.round(before.height)} -> ${Math.round(after.width)}x${Math.round(after.height)}`);
    appWindow.setMode("scientific");
    flush(appWindow);
    const sciBefore = doc.querySelector("#keys .key").getBoundingClientRect();
    doc.getElementById("expr").value = "9*9";
    appCall(() => equals());
    flush(appWindow);
    const sciAfter = doc.querySelector("#keys .key").getBoundingClientRect();
    assert(Math.abs(sciAfter.width - sciBefore.width) < 1 && Math.abs(sciAfter.height - sciBefore.height) < 1, "Scientific keys");
    appWindow.setMode("basic");
  });

  test("An input error opens a popup without resizing the result", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    flush(appWindow);
    const result = doc.getElementById("result");
    const before = result.getBoundingClientRect().height;
    doc.getElementById("expr").value = "1/0";
    appCall(() => preview());
    assert(doc.getElementById("notice").hidden, "Typing opened an error");
    appCall(() => equals());
    const notice = doc.getElementById("notice");
    assert(!notice.hidden, "Popup stayed closed");
    assert(doc.getElementById("noticeTitle").textContent === "입력 오류", doc.getElementById("noticeTitle").textContent);
    assert(doc.getElementById("noticeFix").textContent.includes("0"), doc.getElementById("noticeFix").textContent);
    const spot = doc.getElementById("noticeSpot");
    assert(!spot.hidden && spot.textContent.includes("^") && spot.textContent.includes("/"), spot.textContent);
    assert(doc.getElementById("noticeCopyField").hidden, "Input error shows a copy box");
    assert(!result.classList.contains("error"), "Result changed style");
    const after = result.getBoundingClientRect().height;
    assert(Math.abs(after - before) < 1, `${before} -> ${after}`);
    const key = doc.querySelector("#keys button");
    const keyBox = key.getBoundingClientRect();
    appCall(() => reportProgram(new Error("internal")));
    assert(!doc.getElementById("noticeCopyField").hidden, "Program error is not copyable");
    assert(doc.getElementById("noticeText").value.includes("internal"), doc.getElementById("noticeText").value);
    const nextKey = key.getBoundingClientRect();
    assert(Math.abs(nextKey.width - keyBox.width) < 1 && Math.abs(nextKey.height - keyBox.height) < 1, "Button size changed");
    doc.getElementById("noticeClose").click();
    assert(notice.hidden, "Popup stayed open");
  });

  test("Instruction hints are not shown", () => {
    const doc = appWindow.document;
    assert(!doc.getElementById("hint") && !doc.getElementById("graphHint"), "Hint element");
    assert(!doc.body.textContent.includes("키보드로도"), "Keyboard hint");
    assert(!doc.body.textContent.includes("삼각함수는 라디안"), "Graph hint");
  });

  test("Header and graph actions are icon buttons with tooltips", () => {
    const doc = appWindow.document;
    for (const id of ["settingsBtn", "infoBtn"]) {
      const button = doc.getElementById(id);
      assert(button.querySelector(".icon"), id);
      assert(button.dataset.tooltip, `${id} tooltip`);
      assert(button.textContent.trim() === "", `${id} text`);
    }
    assert(doc.querySelector(".info-icon").getAttribute("src").includes("icon.png"), "Info icon");
    appWindow.setMode("graph");
    flush(appWindow);
    for (const id of ["addFn", "zoomIn", "zoomOut", "resetView", "gridToggle", "legendToggle", "applyView", "exportGraph", "printGraph"]) {
      const button = doc.getElementById(id);
      assert(button.querySelector(".icon"), id);
      assert(button.dataset.tooltip, `${id} tooltip`);
      assert(!button.hasAttribute("title"), `${id} title`);
    }
    assert(doc.getElementById("dim2d").textContent === "2D", "2D label");
    assert(doc.getElementById("printGraph").hidden, "Print stays in the graph window");
    assert(doc.getElementById("exportGraph").hidden, "Export stays in the graph window");
    assert(doc.getElementById("graphSettings").hidden, "Graph settings stays in the graph window");
    assert(doc.getElementById("graphMin").hidden && doc.getElementById("graphMax").hidden, "Window controls stay on the graph window");
    appWindow.setMode("basic");
  });

  test("A typed expression can be hidden and deleted", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    flush(appWindow);
    doc.getElementById("dim2d").click();
    appCall(() => {
      while (board.functions.length) board.removeFunction(board.functions[0].id);
    });
    doc.getElementById("graphExpr").value = "x+4";
    doc.getElementById("addFn").click();
    const expr = doc.querySelector(".fn-expr");
    assert(expr.textContent === "y = x+4", expr.textContent);
    assert(doc.getElementById("graphExpr").value === "", "Input was not cleared");
    assert(getComputedStyle(expr).whiteSpace === "normal", "Expression does not wrap");
    assert(appCall(() => board.functions.length) === 1, "Function count");
    assert(appCall(() => board.dimension) === "2d", "Dimension");
    assert(appCall(() => board.showGrid) === true, "Grid state");
    assert(!doc.getElementById("graphStatus"), "The status bar is still in the graph");
    doc.querySelector("#fnList .icon-btn").click();
    assert(appCall(() => board.functions[0].visible) === false, "Hide");
    assert(doc.querySelector(".fn-expr").style.opacity === "0.4", "Hidden expression");
    doc.querySelectorAll("#fnList .icon-btn")[1].click();
    assert(appCall(() => board.functions.length) === 0, "Delete");
    assert(doc.querySelector(".empty-note"), "Empty list");
  });

  test("An invalid expression is reported and not added", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    doc.getElementById("dim2d").click();
    appCall(() => {
      while (board.functions.length) board.removeFunction(board.functions[0].id);
    });
    doc.getElementById("graphExpr").value = "y=sin(x)";
    doc.getElementById("addFn").click();
    assert(!doc.getElementById("notice").hidden, "Error popup did not open");
    assert(doc.getElementById("noticeFix").textContent.length > 8, doc.getElementById("noticeFix").textContent);
    assert(doc.getElementById("graphExpr").value === "y=sin(x)", "Invalid input was cleared");
    assert(appCall(() => board.functions.length) === 0, "Invalid expression was added");
  });

  test("Axis color, axis visibility, and graph color can be chosen", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    flush(appWindow);
    doc.getElementById("dim2d").click();
    assert(doc.querySelector('.axis-field[data-axis="z"]').hidden, "Z axis is shown in 2D");
    doc.getElementById("dim3d").click();
    assert(!doc.querySelector('.axis-field[data-axis="z"]').hidden, "Z axis is hidden in 3D");
    assert(doc.querySelector("#axisToggle .icon").classList.contains("icon-axis-values"), "Axis value icon");
    assert(doc.querySelector("#axesToggle .icon").classList.contains("icon-axis"), "Axis icon");
    assert(!doc.querySelector("#axesToggle .icon").classList.contains("icon-axis-values"), "Axis icons match");
    doc.getElementById("axisShowY").click();
    assert(doc.getElementById("axisShowY").getAttribute("aria-pressed") === "false", "Y axis button");
    const painted = appCall(() => {
      const input = document.getElementById("axisColorX");
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setValue.call(input, "#123456");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x");
      const swatch = document.querySelector(".fn-color");
      setValue.call(swatch, "#abcdef");
      swatch.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        x: board.axes.x.color,
        y: board.axes.y.visible,
        fn: board.functions[0].color,
        swatch: swatch.value,
      };
    });
    assert(painted.x === "#123456", painted.x);
    assert(painted.y === false, "Y axis stayed visible");
    assert(painted.fn === "#abcdef", painted.fn);
    assert(painted.swatch === "#abcdef", painted.swatch);
    doc.getElementById("axisShowY").click();
    const axes = doc.getElementById("axesToggle");
    assert(!axes.hidden, "3D axis toggle is hidden");
    axes.click();
    assert(appCall(() => board.axes.x.visible || board.axes.y.visible || board.axes.z.visible) === false, "Axes stayed on");
    axes.click();
    assert(appCall(() => board.axes.z.visible) === true, "Axes stayed off");
    doc.getElementById("dim2d").click();
    assert(axes.hidden, "Axis toggle stays in 2D");
    appCall(() => {
      while (board.functions.length) board.removeFunction(board.functions[0].id);
    });
  });

  test("Zoom and reset change the graph view", () => {
    const doc = appWindow.document;
    appWindow.setMode("graph");
    doc.getElementById("dim2d").click();
    doc.getElementById("resetView").click();
    const before = appCall(() => board.view.xMax - board.view.xMin);
    doc.getElementById("zoomOut").click();
    const wider = appCall(() => board.view.xMax - board.view.xMin);
    assert(wider > before, `${before} -> ${wider}`);
    doc.getElementById("zoomIn").click();
    const narrower = appCall(() => board.view.xMax - board.view.xMin);
    assert(narrower < wider, `${wider} -> ${narrower}`);
    doc.getElementById("resetView").click();
    const reset = appCall(() => board.view.xMax - board.view.xMin);
    assert(Math.abs(reset - before) < 1e-9, String(reset));
  });

  test("Height is drawn on the same scale as width and depth", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      const unitX = board.worldToFloorX(1) - board.worldToFloorX(0);
      const unitY = board.worldToFloorY(1) - board.worldToFloorY(0);
      const unitZ = board.zToLocal(1) - board.zToLocal(0);
      if (Math.abs(unitX - unitY) > 1e-9) throw new Error(`${unitX} vs ${unitY}`);
      if (Math.abs(unitX - unitZ) > 1e-9) throw new Error(`x ${unitX} vs z ${unitZ}`);
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("One unit is the same length on both 2D axes", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("2d");
      board.canvas.width = 900;
      board.canvas.height = 450;
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
      board.draw();
      const unitX = board.xToPx(1) - board.xToPx(0);
      const unitY = board.yToPx(0) - board.yToPx(1);
      if (Math.abs(unitX - unitY) > 0.01) throw new Error(`${unitX} vs ${unitY}`);
      if (board.view.yMin > -10 || board.view.yMax < 10) throw new Error("The asked range was cropped");
      if (board.view.xMin > -10 || board.view.xMax < 10) throw new Error("The asked range was cropped");
      board.resetView();
    });
  });

  test("The light shines, moves and switches off", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x*y/10");
      board.canvas.width = 800;
      board.canvas.height = 600;
      board.draw();
      if (!board.lightHit) throw new Error("The light marker is missing");
      const lit = board.scene.surfaces[0].colors[0];
      board.light.azimuth += 1.3;
      board.draw();
      if (board.scene.surfaces[0].colors[0] === lit) throw new Error("The shading ignored the light");
      if (!board.lightAt(board.lightHit.sx, board.lightHit.sy)) throw new Error("The light cannot be grabbed");
      const aimed = board.lightFromScreen(board.lightHit.sx + 24, board.lightHit.sy - 10);
      if (!aimed) throw new Error("The light did not follow the pointer");
      if (Math.abs(aimed.azimuth - board.light.azimuth) < 1e-6 && Math.abs(aimed.elevation - board.light.elevation) < 1e-6) {
        throw new Error("The light stayed where it was");
      }
      board.toggleLight();
      board.draw();
      if (board.light.on) throw new Error("The light stayed on");
      if (board.lightHit) throw new Error("The marker is still drawn");
      const flat = board.scene.surfaces[0].colors[0];
      board.toggleLight();
      board.draw();
      if (board.scene.surfaces[0].colors[0] === flat) throw new Error("Switching the light back changed nothing");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
    });
  });

  test("Rotating keeps every face of the 3D surface", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x+y");
      board.draw();
      const still = board.projectScene().length;
      const mesh = board.scene.surfaces[0];
      board.drag = { mode: "rotate", px: 0, py: 0, yaw: board.camera.yaw, pitch: board.camera.pitch };
      board.camera.yaw += 0.3;
      board.draw();
      const moving = board.projectScene().length;
      board.drag = null;
      if (moving !== still) throw new Error(`${moving} vs ${still}`);
      if (board.scene.surfaces[0] !== mesh) throw new Error("Rotating rebuilt the surface");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
    });
  });

  test("The grid is spaced from zero", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      const onStep = (values, step) => values.every((value) => Math.abs(value / step - Math.round(value / step)) < 1e-6);
      board.setDimension("2d");
      board.setView({ xMin: -3.2, xMax: 8.7, yMin: -1.4, yMax: 6.1 });
      const step = board.gridStep2d();
      const xs = board.multiples(board.view.xMin, board.view.xMax, step);
      const ys = board.multiples(board.view.yMin, board.view.yMax, step);
      if (!xs.includes(0) || !ys.includes(0)) throw new Error("2D grid misses 0");
      if (!onStep(xs.concat(ys), step)) throw new Error("2D grid is not spaced from 0");
      board.setDimension("3d");
      board.setView({ xMin: -3.2, xMax: 8.7, yMin: -1.4, yMax: 6.1, zMin: -2.3, zMax: 4.8 });
      const lattice = board.floorLattice();
      if (!lattice.xs.includes(0) || !lattice.ys.includes(0)) throw new Error("The floor grid misses the origin");
      if (!onStep(lattice.xs.concat(lattice.ys), board.floorStep())) throw new Error("The floor grid is not spaced from 0");
      if (lattice.xs.length < 4 || lattice.xs.length > 7) throw new Error(`${lattice.xs.length} lines across`);
      if (Math.abs(board.floorStep() - Math.max(board.view.xMax - board.view.xMin, board.view.yMax - board.view.yMin) / 5) > 1e-9) {
        throw new Error("The floor is not five cells wide");
      }
      if (Math.abs(board.floorLevel() - board.zToLocal(0)) > 1e-9) throw new Error("The floor left z = 0");
      board.setFloorZ(1.5);
      if (Math.abs(board.floorLevel() - board.zToLocal(1.5)) > 1e-9) throw new Error("The floor did not move along z");
      board.setFloorZ(null);
      const zStep = niceStep(board.view.zMax - board.view.zMin, 5);
      const zs = board.multiples(board.view.zMin, board.view.zMax, zStep);
      if (!zs.includes(0) || !onStep(zs, zStep)) throw new Error("Z ticks are not spaced from 0");
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("3D coordinates share one mapping", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      board.resetView();
      board.setView({ xMin: -10, xMax: 10, yMin: -2, yMax: 2, zMin: 0, zMax: 8 });
      const n = 49;
      const i = Math.round(((5 - board.view.xMin) / (board.view.xMax - board.view.xMin)) * (n - 1));
      const onFive = board.localGridPoint(i, 0, n, 5);
      if (Math.abs(onFive.x - board.worldToFloorX(5)) > 1e-9) throw new Error("surface x");
      if (Math.abs(onFive.z - board.zToLocal(5)) > 1e-9) throw new Error("surface z");
      const yEnd = board.localGridPoint(0, n - 1, n, 0).y;
      if (!(Math.abs(yEnd) < 0.5)) throw new Error(String(yEnd));
      const origin = board.axisAnchor();
      if (Math.abs(origin.y) > 1e-9) throw new Error("y origin");
      if (Math.abs(origin.z - board.zToLocal(0)) > 1e-9) throw new Error("floor z");
      if (Math.abs(board.planeZ() - origin.z) > 1e-9) throw new Error("plane");
      board.setView({ xMin: 0, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      const shifted = board.axisAnchor();
      if (Math.abs(shifted.x - board.worldToFloorX(0)) > 1e-9) throw new Error("x origin");
      if (Math.abs(board.localGridPoint(0, 24, n, 0).x - shifted.x) > 1e-9) throw new Error("x=0 surface");
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("The 3D floor grid stays square when the camera zooms", () => {
    appWindow.setMode("graph");
    flush(appWindow);
    const spacing = appCall(() => {
      board.setDimension("3d");
      board.view = board.views["3d"];
      Object.assign(board.views["3d"], { xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -5, zMax: 5 });
      board.camera.yaw = -0.75;
      board.camera.zoom = 1.35;
      board.camera.pitch = -1.05;
      board.canvas.width = 800;
      board.canvas.height = 600;
      const measure = () => {
        const step = board.floorStep();
        const dx = board.worldToFloorX(1) - board.worldToFloorX(0);
        const dy = board.worldToFloorY(1) - board.worldToFloorY(0);
        const origin = board.projectLocal({ x: board.worldToFloorX(0), y: board.worldToFloorY(0), z: 0 });
        const east = board.projectLocal({ x: board.worldToFloorX(step), y: board.worldToFloorY(0), z: 0 });
        const north = board.projectLocal({ x: board.worldToFloorX(0), y: board.worldToFloorY(step), z: 0 });
        const px = Math.hypot(east.sx - origin.sx, east.sy - origin.sy);
        const py = Math.hypot(north.sx - origin.sx, north.sy - origin.sy);
        return { step, dx, dy, px, py };
      };
      const first = measure();
      board.camera.zoom = 2.6;
      const second = measure();
      board.setDimension("2d");
      return { first, second };
    });
    assert(Math.abs(spacing.first.dx - spacing.first.dy) < 1e-9, "Floor scale is not square");
    const even = (a, b) => Math.abs(a - b) / Math.max(a, b) < 0.12;
    assert(even(spacing.first.px, spacing.first.py), `${spacing.first.px} vs ${spacing.first.py}`);
    assert(spacing.first.px > 8, String(spacing.first.px));
    assert(even(spacing.second.px, spacing.second.py), "Zoomed cells are not square");
    const ratio = spacing.second.px / spacing.first.px;
    assert(ratio > 1.6 && ratio < 2.3, String(ratio));
  });

  test("Non-button areas drag a desktop window and buttons do not", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    flush(appWindow);
    const root = doc.documentElement;
    root.classList.add("desktop");
    flush(appWindow);
    const region = (selector) => getComputedStyle(doc.querySelector(selector)).webkitAppRegion;
    try {
      assert(region(".app") === "drag", region(".app"));
      assert(region("h1") === "drag", "Title");
      assert(region("#result") === "drag", region("#result"));
      assert(region("#keys button") === "no-drag", "Key");
      assert(region("#expr") === "no-drag", "Expression");
      appWindow.setMode("graph");
      flush(appWindow);
      assert(region("#plot") === "no-drag", "Canvas");
      assert(region("#fnList") === "drag", region("#fnList"));
      assert(region("#addFn") === "no-drag", "Add");
    } finally {
      root.classList.remove("desktop");
      appWindow.setMode("basic");
    }
  });

  test("The desktop calculator shows a close button", async () => {
    const loaded = await loadApp("desktop=1");
    try {
      const doc = loaded.win.document;
      const close = doc.getElementById("winClose");
      assert(close && !close.hidden, "Close button");
      assert(doc.documentElement.classList.contains("desktop"), "Desktop class");
      assert(callWin(loaded.win, () => pageKind) == null, "Main page");
      const rect = doc.querySelector(".app").getBoundingClientRect();
      assert(rect.width > 500 && rect.height > 400, `${rect.width}x${rect.height}`);
    } finally {
      loaded.frame.remove();
    }
  });

  test("A copied calculator expression fills the graph input", async () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    doc.getElementById("expr").value = "";
    doc.getElementById("copyExpr").click();
    assert(!doc.getElementById("notice").hidden, "Empty expression opens a notice");
    doc.getElementById("noticeClose").click();
    doc.getElementById("expr").value = "sin(x)+1";
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      doc.getElementById("copyExpr").click();
      await wait(120);
      const value = doc.getElementById("graphExpr").value;
      assert(value === "sin(x)+1", value || "empty");
    } finally {
      loaded.frame.remove();
      doc.getElementById("expr").value = "";
    }
  });

  test("Graph expressions stay in the main window and view controls stay with the plot", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      assert(doc.title === "MyCalc 10.0 Graph", doc.title);
      assert(!doc.getElementById("printGraph").hidden, "Print button");
      assert(!doc.getElementById("exportGraph").hidden, "Export button");
      const graphSettings = doc.getElementById("graphSettings");
      assert(graphSettings.hidden, "Settings stay on the main window");
      for (const id of ["zoomIn", "zoomOut", "resetView", "gridToggle", "legendToggle"]) {
        assert(getComputedStyle(doc.getElementById(id)).display !== "none", `${id} stays with the plot`);
      }
      assert(getComputedStyle(doc.getElementById("axisBar")).display !== "none", "Axis controls stay with the plot");
      assert(getComputedStyle(doc.getElementById("dim2d")).display === "none", "2D and 3D stay in the main window");
      assert(getComputedStyle(doc.getElementById("graphExpr")).display === "none", "Expression input stays in the main window");
      assert(getComputedStyle(doc.getElementById("addFn")).display === "none", "Function entry stays in the main window");
      assert(getComputedStyle(doc.getElementById("fnList")).display === "none", "Function list stays on the main window");
      assert(getComputedStyle(doc.querySelector(".canvas-wrap")).display !== "none", "Plot is visible");
      doc.getElementById("dim3d").click();
      assert(getComputedStyle(doc.getElementById("axisToggle")).display !== "none", "Axis values are available in 3D");
      assert(getComputedStyle(doc.getElementById("axesToggle")).display !== "none", "Axis visibility is available in 3D");
      const graphClose = doc.getElementById("graphClose");
      assert(!graphClose.hidden, "Close button");
      assert(graphClose.textContent === "x", graphClose.textContent);
      const closeStyle = getComputedStyle(graphClose);
      const minStyle = getComputedStyle(doc.getElementById("graphMin"));
      assert(closeStyle.borderTopWidth === "0px" && minStyle.borderTopWidth === "0px", "Window buttons have a border");
      assert(parseFloat(closeStyle.borderTopLeftRadius) > 8, closeStyle.borderTopLeftRadius);
      assert(parseFloat(getComputedStyle(doc.getElementById("dim2d")).borderTopLeftRadius) > 8, "2D button is square");
      assert(parseFloat(getComputedStyle(doc.getElementById("addFn")).borderTopLeftRadius) > 8, "Toolbar button is square");
      assert(parseFloat(getComputedStyle(doc.getElementById("axisShowX")).borderTopLeftRadius) > 8, "Axis button is square");
      assert(parseFloat(getComputedStyle(doc.querySelector(".num-step")).borderTopLeftRadius) > 8, "Range stepper is square");
      assert(parseFloat(getComputedStyle(doc.querySelector(".step-down")).borderTopLeftRadius) > 8, "Decrease button is square");
      assert(parseFloat(getComputedStyle(doc.querySelector(".step-up")).borderTopRightRadius) > 8, "Increase button is square");
      assert(parseFloat(closeStyle.fontSize) <= 16, closeStyle.fontSize);
      const appStyle = getComputedStyle(doc.querySelector(".app"));
      const plotStyle = getComputedStyle(doc.querySelector(".canvas-wrap"));
      const screenStyle = getComputedStyle(doc.getElementById("screenGraph"));
      assert(parseFloat(appStyle.borderTopLeftRadius) >= 20, appStyle.borderTopLeftRadius);
      assert(appStyle.backgroundImage.includes("linear-gradient"), appStyle.backgroundImage);
      assert(appStyle.boxShadow !== "none", appStyle.boxShadow);
      assert(plotStyle.backgroundColor === "rgba(0, 0, 0, 0)", plotStyle.backgroundColor);
      assert(screenStyle.backgroundColor === "rgba(0, 0, 0, 0)", screenStyle.backgroundColor);
      assert(!doc.getElementById("graphMin").hidden, "Minimize");
      assert(!doc.getElementById("graphMax").hidden, "Maximize");
      const minBox = doc.getElementById("graphMin").getBoundingClientRect();
      const maxBox = doc.getElementById("graphMax").getBoundingClientRect();
      const closeBox = doc.getElementById("graphClose").getBoundingClientRect();
      assert(minBox.width > 0 && minBox.right <= maxBox.left + 1 && maxBox.right <= closeBox.left + 1, "Minimize, maximize, close");
      const titleBox = doc.getElementById("graphTitle").getBoundingClientRect();
      assert(titleBox.width > 0, "Graph title is visible");
      assert(Math.abs(minBox.top - titleBox.top) < 12, "Window buttons stay with the title");
      assert(!doc.getElementById("graphResize").hidden, "Resize grip");
      for (const [id, cursor] of [["graphEdgeN", "ns-resize"], ["graphEdgeS", "ns-resize"], ["graphEdgeW", "ew-resize"], ["graphEdgeE", "ew-resize"]]) {
        const edge = doc.getElementById(id);
        assert(edge && !edge.hidden, id);
        assert(getComputedStyle(edge).cursor === cursor, `${id} ${getComputedStyle(edge).cursor}`);
      }
      assert(getComputedStyle(doc.getElementById("keys")).display === "none", "Calculator keys");
      appWindow.setMode("graph");
      flush(appWindow);
      for (const id of ["graphExpr", "addFn", "fnList", "dim2d", "dim3d"]) {
        assert(getComputedStyle(appWindow.document.getElementById(id)).display !== "none", `${id} stays on the main window`);
      }
      for (const id of ["axisBar", "gridToggle", "legendToggle", "axesToggle", "axisToggle", "lightToggle"]) {
        assert(getComputedStyle(appWindow.document.getElementById(id)).display === "none", `${id} stays with the plot`);
      }
      assert(appWindow.document.querySelector(".app").getBoundingClientRect().width <= 560, "Main graph window is not compact");
      appCall(() => {
        board.setDimension("2d");
        while (board.fns2d.length) board.removeFunction(board.fns2d[0].id);
        while (board.fns3d.length) board.removeFunction(board.fns3d[0].id);
        addGraph("x+3");
      });
      await wait(80);
      const mainList = appCall(() => board.fns2d.map((fn) => fn.expr));
      assert(mainList.includes("x+3"), mainList.join(","));
      const popupList = callWin(loaded.win, () => board.fns2d.map((fn) => fn.expr));
      assert(popupList.includes("x+3"), popupList.join(","));
      appCall(() => {
        board.resize();
        graphChannel.postMessage({
          type: "state",
          id: "stale-main",
          state: {
            dimension: "2d",
            showGrid: true,
            showAxisValues: true,
            views: {
              "2d": { xMin: -10, xMax: 10, yMin: -6, yMax: 6 },
              "3d": { xMin: -5, xMax: 5, yMin: -5, yMax: 5 },
            },
            camera: { yaw: -0.75, pitch: -1.05, zoom: 1.35 },
            axes: {
              x: { color: "#fb923c", visible: true },
              y: { color: "#4ade80", visible: true },
              z: { color: "#7dd3fc", visible: true },
            },
            fns2d: [],
            fns3d: [],
          },
        });
      });
      await wait(80);
      const kept = callWin(loaded.win, () => board.functions.map((fn) => fn.expr));
      assert(kept.join(",") === "x+3", kept.join(",") || "empty");
    } finally {
      loaded.frame.remove();
    }
  });

  test("The graph exports PNG, GIF, JPG, TIFF, and WEBP", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      const button = doc.getElementById("exportGraph");
      assert(button.querySelector(".icon") && !button.hidden, "Export button");
      button.click();
      const sheet = doc.getElementById("exportSheet");
      assert(!sheet.hidden, "Export sheet");
      const format = doc.getElementById("exportFormat");
      assert([...format.options].map((option) => option.value).join(",") === "png,gif,jpg,tiff,webp", "Formats");
      format.value = "jpg";
      format.dispatchEvent(new Event("change", { bubbles: true }));
      assert(doc.getElementById("exportAlphaField").hidden, "JPEG transparency");
      format.value = "png";
      format.dispatchEvent(new Event("change", { bubbles: true }));
      assert(!doc.getElementById("exportAlphaField").hidden, "PNG transparency");
      const headers = await callWin(loaded.win, () => {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 4, 4);
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(2, 2, 1, 1);
        return Promise.all(["png", "gif", "jpg", "tiff", "webp"].map(async (kind) => {
          const blob = await encodeCanvas(canvas, kind, kind !== "jpg");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          return { kind, n: bytes.length, b0: bytes[0], b1: bytes[1] };
        }));
      });
      const by = Object.fromEntries(headers.map((item) => [item.kind, item]));
      assert(by.png.b0 === 0x89 && by.png.b1 === 0x50 && by.png.n > 16, "PNG");
      assert(by.gif.b0 === 0x47 && by.gif.b1 === 0x49 && by.gif.n > 16, "GIF");
      assert(by.jpg.b0 === 0xff && by.jpg.b1 === 0xd8 && by.jpg.n > 16, "JPG");
      assert(by.tiff.b0 === 0x49 && by.tiff.b1 === 0x49 && by.tiff.n > 80, "TIFF");
      assert(by.webp.b0 === 0x52 && by.webp.b1 === 0x49 && by.webp.n > 16, "WEBP");
      const alpha = await callWin(loaded.win, async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 4, 4);
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(2, 2, 1, 1);
        const blob = await encodeCanvas(canvas, "png", true);
        const bitmap = await createImageBitmap(blob);
        const view = document.createElement("canvas");
        view.width = 4;
        view.height = 4;
        const out = view.getContext("2d");
        out.drawImage(bitmap, 0, 0);
        const gif = new Uint8Array(await (await encodeCanvas(canvas, "gif", true)).arrayBuffer());
        return {
          clear: out.getImageData(0, 0, 1, 1).data[3],
          red: out.getImageData(2, 2, 1, 1).data[0],
          gifTrans: gif.indexOf(0xf9) >= 0,
        };
      });
      assert(alpha.clear === 0 && alpha.red > 200, `PNG alpha ${alpha.clear}/${alpha.red}`);
      assert(alpha.gifTrans, "GIF transparency");
    } finally {
      loaded.frame.remove();
    }
  });

  test("The print window previews page setup", async () => {
    const loaded = await loadApp("pop=print");
    try {
      loaded.win.applyLanguage("ko");
      const doc = loaded.win.document;
      assert(doc.title === "인쇄 — MyCalc 10.0", doc.title);
      assert(doc.querySelector("#printSetup h2").textContent === "페이지 설정", doc.querySelector("#printSetup h2").textContent);
      assert(doc.getElementById("printMarginLeft") && doc.getElementById("printMarginRight") && doc.getElementById("printMarginBottom"), "Page margins");
      for (const input of doc.querySelectorAll("#printSetup input[type='number']")) {
        const wrap = input.closest(".num-step");
        const down = wrap.querySelector(".step-down").getBoundingClientRect();
        const up = wrap.querySelector(".step-up").getBoundingClientRect();
        const box = input.getBoundingClientRect();
        assert(down.width > 0 && down.right <= box.left + 1, `${input.id} decrease`);
        assert(up.width > 0 && up.left >= box.right - 1, `${input.id} increase`);
        assert(getComputedStyle(input).textAlign === "center", `${input.id} centered`);
      }
      const margin = doc.getElementById("printMargin");
      const before = Number(margin.value);
      margin.closest(".num-step").querySelector(".step-up").click();
      assert(Number(margin.value) === before + 1, margin.value);
      assert(getComputedStyle(doc.getElementById("printSheet")).display === "grid", "Print sheet");
      assert(doc.getElementById("printPaper").value === "A4", "Paper");
      assert(doc.getElementById("printNow").disabled, "Print starts disabled");
      callWin(loaded.win, () => {
        showPrintImage("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
      });
      flush(loaded.win);
      assert(!doc.getElementById("printNow").disabled, "Print stays disabled");
      const page = doc.getElementById("printPage");
      const portrait = page.getBoundingClientRect();
      assert(portrait.height > portrait.width, `${portrait.width}x${portrait.height}`);
      const orient = doc.getElementById("printOrient");
      orient.value = "landscape";
      orient.dispatchEvent(new Event("input", { bubbles: true }));
      const landscape = page.getBoundingClientRect();
      assert(landscape.width > landscape.height, `${landscape.width}x${landscape.height}`);
      assert(doc.getElementById("printPageStyle").textContent.includes("297mm 210mm"), doc.getElementById("printPageStyle").textContent);
      const pad = Number.parseFloat(getComputedStyle(page).paddingTop);
      doc.getElementById("printMargin").value = "30";
      doc.getElementById("printMargin").dispatchEvent(new Event("input", { bubbles: true }));
      const wider = Number.parseFloat(getComputedStyle(page).paddingTop);
      assert(wider > pad, `${pad} -> ${wider}`);
      doc.getElementById("printMarginLeft").value = "4";
      doc.getElementById("printMarginLeft").dispatchEvent(new Event("input", { bubbles: true }));
      const side = Number.parseFloat(getComputedStyle(page).paddingLeft);
      assert(side < wider, `${side} vs ${wider}`);
      const heading = doc.getElementById("printHeadingText");
      heading.value = "분기 그래프";
      heading.dispatchEvent(new Event("input", { bubbles: true }));
      const shown = doc.getElementById("printHeading");
      assert(shown.textContent === "분기 그래프", shown.textContent);
      assert(!shown.hidden, "Heading is hidden");
      assert(getComputedStyle(shown).textAlign === "center", getComputedStyle(shown).textAlign);
      const font = doc.getElementById("printHeadingFont");
      const size = doc.getElementById("printHeadingSize");
      assert(font.value === "malgun" && size.value === "13", "Heading defaults");
      const previousSize = Number.parseFloat(shown.style.fontSize);
      font.value = "batang";
      font.dispatchEvent(new Event("input", { bubbles: true }));
      size.value = "24";
      size.dispatchEvent(new Event("input", { bubbles: true }));
      assert(shown.style.fontFamily.includes("Batang"), shown.style.fontFamily);
      assert(Number.parseFloat(shown.style.fontSize) > previousSize, `${previousSize} -> ${shown.style.fontSize}`);
      assert(doc.getElementById("printPageStyle").textContent.includes("8.47mm"), doc.getElementById("printPageStyle").textContent);
      const frame = doc.getElementById("printFrame");
      assert(getComputedStyle(frame).borderTopStyle === "none", "Border starts off");
      doc.getElementById("printBorder").click();
      assert(getComputedStyle(frame).borderTopStyle === "solid", getComputedStyle(frame).borderTopStyle);
      const border = doc.getElementById("printBorderStyle");
      border.value = "dashed";
      border.dispatchEvent(new Event("input", { bubbles: true }));
      assert(getComputedStyle(frame).borderTopStyle === "dashed", getComputedStyle(frame).borderTopStyle);
      doc.getElementById("printScale").value = "50";
      doc.getElementById("printScale").dispatchEvent(new Event("input", { bubbles: true }));
      assert(doc.getElementById("printImage").style.getPropertyValue("--graph-scale") === "50%", "Scale");
      doc.getElementById("printColor").value = "gray";
      doc.getElementById("printColor").dispatchEvent(new Event("input", { bubbles: true }));
      assert(doc.getElementById("printImage").style.filter.includes("grayscale"), "Grayscale");
      doc.getElementById("printPageNumber").click();
      doc.getElementById("printDate").click();
      const footer = doc.getElementById("printFooter");
      assert(!footer.hidden && footer.textContent.includes("1페이지"), footer.textContent);
    } finally {
      loaded.frame.remove();
    }
  });

  test("The programmer keypad fills every row", () => {
    const doc = appWindow.document;
    appWindow.setMode("programmer");
    flush(appWindow);
    const grid = doc.querySelector("#keys .keygrid");
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
    assert(columns === 6, `${columns} columns`);
    const keys = [...grid.querySelectorAll(".key")];
    const span = (key) => (key.style.gridColumn ? Number(key.style.gridColumn.replace("span ", "")) : 1);
    const cells = keys.reduce((sum, key) => sum + span(key), 0);
    assert(cells % columns === 0, `${cells} cells in ${columns} columns`);
    const ops = ["\u00f7", "\u00d7", "\u2212", "+"].map((label) => keys.find((key) => key.textContent === label));
    assert(ops.every(Boolean), "The arithmetic keys are missing");
    const lefts = new Set(ops.map((key) => Math.round(key.getBoundingClientRect().left)));
    assert(lefts.size === 1, `The arithmetic keys sit in ${lefts.size} columns`);
    appWindow.setMode("basic");
  });

  test("Every window wears the calculator chrome", async () => {
    const settings = await loadApp("pop=settings");
    const info = await loadApp("pop=info");
    const print = await loadApp("pop=print");
    try {
      for (const [name, loaded] of [["settings", settings], ["info", info], ["print", print]]) {
        const style = getComputedStyle(loaded.win.document.querySelector(".app"));
        assert(parseFloat(style.borderTopLeftRadius) >= 20, `${name} corners ${style.borderTopLeftRadius}`);
        assert(style.boxShadow !== "none", `${name} shadow`);
      }
      const settingsDoc = settings.win.document;
      assert(!settingsDoc.getElementById("settingsMin").hidden, "Settings minimise");
      assert(!settingsDoc.getElementById("settingsMax").hidden, "Settings maximise");
      const foot = settingsDoc.querySelector(".sheet-foot");
      assert(foot && foot.children.length === 2, "The settings footer is missing");
      const reset = settingsDoc.getElementById("resetSettings").getBoundingClientRect();
      const apply = settingsDoc.getElementById("applyCustom").getBoundingClientRect();
      assert(Math.abs(reset.top - apply.top) < 2, "The footer buttons are not on one line");
      const custom = settingsDoc.querySelector(".custom-theme").getBoundingClientRect();
      assert(reset.top >= custom.bottom - 1, "The footer is not below the colours");
      assert(!info.win.document.getElementById("closeInfo").hidden, "The info window has no close button");
      const printDoc = print.win.document;
      assert(!printDoc.getElementById("printClose").hidden, "The print window has no close button");
      const chrome = printDoc.getElementById("printChrome").getBoundingClientRect();
      const preview = printDoc.getElementById("printPreview").getBoundingClientRect();
      assert(preview.top >= chrome.bottom - 1, "The preview hides behind the window buttons");
    } finally {
      settings.frame.remove();
      info.frame.remove();
      print.frame.remove();
    }
  });

  test("Settings and info open as their own pages", async () => {
    const settings = await loadApp("pop=settings");
    const info = await loadApp("pop=info");
    try {
      settings.win.applyLanguage("ko");
      info.win.applyLanguage("ko");
      const settingsDoc = settings.win.document;
      const infoDoc = info.win.document;
      assert(settingsDoc.title === "설정 — MyCalc 10.0", settingsDoc.title);
      assert(!settingsDoc.getElementById("settingsSheet").hidden, "Settings sheet");
      const closeSettings = settingsDoc.getElementById("closeSettings");
      assert(closeSettings.textContent === "×", closeSettings.textContent);
      assert(getComputedStyle(closeSettings).display !== "none", "Close button");
      callWin(settings.win, () => selectPreset(themeById("light-1")));
      settingsDoc.getElementById("resetSettings").click();
      assert(settingsDoc.documentElement.dataset.theme === "dark-1", settingsDoc.documentElement.dataset.theme);
      assert(getComputedStyle(settingsDoc.querySelector(".stage")).display === "none", "Calculator stays in settings");
      assert(settingsDoc.getElementById("settingsSheet").scrollHeight - settingsDoc.getElementById("settingsSheet").clientHeight === 0, "Settings scrolls");
      assert(settingsDoc.querySelectorAll("#darkThemes .theme-chip").length === 20, "Dark themes");
      assert(infoDoc.title === "프로그램 정보 — MyCalc 10.0", infoDoc.title);
      assert(infoDoc.querySelector(".info-name").textContent === "MyCalc 10.0", "Info name");
      assert(infoDoc.querySelector(".info-icon"), "Info icon");
      const brand = infoDoc.querySelector(".info-brand");
      const icon = brand.querySelector(".info-icon").getBoundingClientRect();
      const lead = brand.querySelector(".info-lead").getBoundingClientRect();
      assert(lead.left >= icon.right - 1, "Description is beside the icon");
      assert(infoDoc.querySelector(".info-list").textContent.includes("빌드 정보"), "Build info");
      assert(infoDoc.querySelector(".info-author").textContent === "SHKWON(knix008@naver.com)", "Author");
      assert(!infoDoc.querySelector("#infoSheet .sheet-head"), "Info title row");
      assert(getComputedStyle(infoDoc.querySelector(".stage")).display === "none", "Calculator stays in info");
    } finally {
      settings.frame.remove();
      info.frame.remove();
    }
  });
});
