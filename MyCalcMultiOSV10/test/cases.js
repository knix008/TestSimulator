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
    win.setMode("currency");
    flush(win);
    assert(size() === "380x594", size());
    win.setMode("unit");
    flush(win);
    assert(size() === "400x594", size());
    const unit = keyShape();
    assert(unit.wide && unit.inside, "Unit keys");
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

  test("The history keeps ten entries and can be pruned", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    appCall(() => {
      state.history = [];
      renderHistory();
    });
    for (let step = 1; step <= 12; step++) {
      doc.getElementById("expr").value = `${step}+1`;
      appWindow.equals();
    }
    assert(appCall(() => state.history.length) === 10, String(appCall(() => state.history.length)));
    const chips = () => [...doc.querySelectorAll("#history .history-chip")];
    assert(chips().length === 10, `${chips().length} chips`);
    assert(chips()[0].querySelector(".history-recall").textContent.startsWith("12+1"), chips()[0].textContent);
    chips()[0].querySelector(".history-drop").click();
    assert(chips().length === 9, `${chips().length} chips after a delete`);
    assert(!chips()[0].querySelector(".history-recall").textContent.startsWith("12+1"), "The entry stayed");
    chips()[0].querySelector(".history-recall").click();
    assert(doc.getElementById("expr").value === "11+1", doc.getElementById("expr").value);
    doc.querySelector("#history .history-clear").click();
    assert(chips().length === 0, "The history did not clear");
    assert(!doc.querySelector("#history .history-clear"), "The clear button stayed");
    appCall(() => {
      state.history = [];
      renderHistory();
    });
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appWindow.setMode("basic");
    flush(appWindow);
    appWindow.setMode("graph");
    flush(appWindow);
    assert(appCall(() => state.mode) === "basic", "The calculator switched to a graph screen");
    assert(tab.getAttribute("aria-selected") === "false", "The graph tab took the selection");
    assert(doc.querySelector('.modes button[data-mode="basic"]').getAttribute("aria-selected") === "true", "The calculator tab lost the selection");
    assert(!doc.getElementById("screenCalc").hidden, "The calculator screen closed");
    assert(doc.getElementById("dim2d").textContent === "2D" && doc.getElementById("dim3d").textContent === "3D", "2D/3D");
  });

  test("2D drag pans the view", () => {
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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

  test("The wheel changes the 2D and the 3D range", () => {
    appCall(() => board.resize());
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
      const height = board.view.zMax - board.view.zMin;
      board.onWheel({ preventDefault() {}, deltaY: 120, clientX: rect.left + 40, clientY: rect.top + 40 });
      const next = board.view.xMax - board.view.xMin;
      if (!(next > span)) throw new Error("Zooming out left the axes as they were");
      if (!(board.view.zMax - board.view.zMin > height)) throw new Error("The height axis stayed short");
      board.onWheel({ preventDefault() {}, deltaY: -120, clientX: rect.left + 40, clientY: rect.top + 40 });
      if (Math.abs(board.view.xMax - board.view.xMin - span) / span > 0.01) throw new Error("Zooming back in missed the start");
      board.draw();
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
        // The surface covers the range the axes measure, and stops there.
        if (!(first.x <= -1 + 1e-9) || !(last.x >= 1 - 1e-9)) throw new Error("The surface no longer covers the view");
        if (first.x < -1 - 1e-6 || last.x > 1 + 1e-6) throw new Error("The surface runs past the view edge");
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
    appCall(() => board.resize());
    flush(appWindow);
    doc.getElementById("dim2d").click();
    assert([...doc.querySelectorAll("#presets button")].some((button) => button.textContent === "sin(x)"), "2D");
    doc.getElementById("dim3d").click();
    const spatial = [...doc.querySelectorAll("#presets button")].map((button) => button.textContent);
    assert(spatial.includes("sin(x)*cos(y)"), spatial.join(","));
    assert(spatial.includes("x^2+y^2"), spatial.join(","));
    doc.getElementById("dim2d").click();
  });

  test("Each graph can set its legend label and visibility", () => {
    const doc = appWindow.document;
    appCall(() => board.resize());
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

  test("The graph window keeps the plot controls and an axis row of its own", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
    const doc = loaded.win.document;
    loaded.frame.style.width = "1200px";
    flush(loaded.win);
    doc.getElementById("dim2d").click();
    callWin(loaded.win, () => board.resetView());
    const square = callWin(loaded.win, () => {
      board.draw();
      const across = board.canvas.width / (board.drawn.xMax - board.drawn.xMin);
      const down = board.canvas.height / (board.drawn.yMax - board.drawn.yMin);
      return { across, down, view: [board.drawn.xMin, board.drawn.xMax, board.drawn.yMin, board.drawn.yMax] };
    });
    assert(Math.abs(square.across - square.down) / square.across < 0.01, `2D units differ ${square.across} vs ${square.down}`);
    assert(square.view[0] <= -10 && square.view[1] >= 10 && square.view[2] <= -10 && square.view[3] >= 10, `2D default range ${square.view.join(",")}`);
    for (const id of ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"]) {
      assert(!doc.getElementById(id), `${id} is still on the window`);
    }
    for (const id of ["axisBar", "gridZField", "gridZ", "applyView", "sideGridZ"]) {
      assert(!doc.getElementById(id), `${id} is still on the window`);
    }
    doc.getElementById("dim3d").click();
    flush(loaded.win);
    const axisRow = doc.getElementById("axisRow");
    assert(doc.getElementById("axisColorX").closest(".graph-axis-row") === axisRow, "Axis colours are not on their own row");
    assert(!axisRow.querySelector(".graph-tool-row"), "The axis row sits inside the toolbar row");
    const tools = doc.querySelector(".graph-tool-row").getBoundingClientRect();
    assert(axisRow.getBoundingClientRect().top >= tools.bottom - 1, "The axis row did not move below the toolbar");
    for (const axis of ["X", "Y", "Z"]) {
      const toggle = doc.getElementById(`axisShow${axis}`);
      assert(toggle.textContent.trim() === axis, `${axis} toggle shows ${toggle.textContent}`);
      assert(!toggle.querySelector(".icon"), `${axis} toggle still carries an icon`);
      assert(toggle.getAttribute("aria-pressed") === "true", `${axis} starts off`);
    }
    assert(!doc.querySelector('.axis-field[data-axis="x"] span'), "The axis letter is written twice");
    doc.getElementById("axisShowX").click();
    assert(doc.getElementById("axisShowX").getAttribute("aria-pressed") === "false", "The X button did not switch off");
    assert(callWin(loaded.win, () => board.axes.x.visible) === false, "The X axis stayed on");
    doc.getElementById("axisShowX").click();
    const floor = callWin(loaded.win, () => board.floorLevel() - board.zToLocal(0));
    assert(Math.abs(floor) < 1e-9, `The floor sits ${floor} away from z = 0`);
    doc.getElementById("dim2d").click();
    } finally {
      loaded.frame.remove();
    }
  });

  test("The plot uses the window background", () => {
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
    flush(appWindow);
    for (const id of ["addFn", "zoomIn", "zoomOut", "resetView", "gridToggle", "legendToggle", "exportGraph", "printGraph"]) {
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
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
    appCall(() => board.resize());
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x*y/10");
      board.canvas.width = 800;
      board.canvas.height = 600;
      board.draw();
      if (!board.lightHit) throw new Error("The light marker is missing");
      const painted = board.scene.surfaces[0].colors.findIndex((colour) => !!colour);
      if (painted < 0) throw new Error("Nothing was shaded");
      const lit = board.scene.surfaces[0].colors[painted];
      board.light.azimuth += 1.3;
      board.draw();
      if (board.scene.surfaces[0].colors[painted] === lit) throw new Error("The shading ignored the light");
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
      const flat = board.scene.surfaces[0].colors[painted];
      board.toggleLight();
      board.draw();
      if (board.scene.surfaces[0].colors[painted] === flat) throw new Error("Switching the light back changed nothing");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
    });
  });

  test("Rotating keeps every face of the 3D surface", () => {
    appCall(() => board.resize());
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

  test("The legend swatch changes the graph colour", () => {
    appCall(() => board.resize());
    flush(appWindow);
    const doc = appWindow.document;
    appCall(() => {
      board.setDimension("2d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("sin(x)");
      board.canvas.width = 800;
      board.canvas.height = 500;
      board.draw();
    });
    const hit = appCall(() => {
      const spot = board.legendHits[0];
      return spot ? { x: spot.chip.x, y: spot.chip.y, w: spot.chip.w, h: spot.chip.h, id: spot.id } : null;
    });
    assert(hit, "The legend has no colour swatch");
    const canvas = doc.getElementById("plot");
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + ((hit.x + hit.w / 2) / canvas.width) * rect.width;
    const cy = rect.top + ((hit.y + hit.h / 2) / canvas.height) * rect.height;
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: cx, clientY: cy, detail: 1 }));
    const picker = doc.getElementById("legendColor");
    assert(!picker.hidden, "The colour picker stayed hidden");
    assert(Number(picker.dataset.fn) === hit.id, "The picker is bound to another function");
    picker.value = "#22d3ee";
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    assert(appCall(() => board.functions[0].color) === "#22d3ee", "The colour did not change");
    picker.dispatchEvent(new Event("blur"));
    assert(picker.hidden, "The picker stayed open");
    appCall(() => {
      while (board.functions.length) board.removeFunction(board.functions[0].id);
    });
  });

  test("The floor grid also shows through the surface", () => {
    appCall(() => board.resize());
    flush(appWindow);
    const counts = appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      board.draw();
      const lines = board.floorLines();
      const major = lines.filter((line) => (line.width || 1) >= 1.2).length;
      const passes = [];
      const original = board.drawFloor.bind(board);
      board.drawFloor = (ctx, dpr, ghost) => {
        passes.push(!!ghost);
        return original(ctx, dpr, ghost);
      };
      board.draw();
      board.drawFloor = original;
      board.setDimension("2d");
      return { major, passes };
    });
    assert(counts.major >= 10, `${counts.major} cell lines`);
    assert(counts.passes.filter((ghost) => ghost).length === 1, `ghost passes ${counts.passes.join(",")}`);
    assert(counts.passes.filter((ghost) => !ghost).length === 1, `solid passes ${counts.passes.join(",")}`);
  });

  test("The floor grid is one shade and stops at the range", () => {
    appCall(() => board.resize());
    flush(appWindow);
    const shades = appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      board.draw();
      // With the range square and centred, the drawn square is -1..1 across.
      const outside = (point) => Math.abs(point.x) > 1 + 1e-6 || Math.abs(point.y) > 1 + 1e-6;
      const cellInk = new Set();
      const fineInk = new Set();
      const beyond = [];
      let cells = 0;
      for (const line of board.floorLines()) {
        const [a, b] = line.p;
        if (outside(a) || outside(b)) beyond.push(`${a.x.toFixed(2)},${a.y.toFixed(2)}`);
        if ((line.width || 1) >= 1.2) {
          cells += 1;
          cellInk.add(Number(line.fade.toFixed(6)));
        } else fineInk.add(Number(line.fade.toFixed(6)));
      }
      return { cells, cellInk: [...cellInk], fineInk: [...fineInk], beyond: beyond.slice(0, 4) };
    });
    appCall(() => board.setDimension("2d"));
    assert(shades.cells >= 10, `${shades.cells} cell lines`);
    assert(shades.beyond.length === 0, `grid runs past the range at ${shades.beyond.join(" ")}`);
    assert(shades.cellInk.length === 1, `the cell lines are drawn in ${shades.cellInk.length} shades`);
    for (const ink of shades.fineInk) {
      assert(ink < shades.cellInk[0], `a finer line (${ink}) is no lighter than a cell line (${shades.cellInk[0]})`);
    }
  });

  test("Ctrl with the wheel scales the picture only", () => {
    appCall(() => board.resize());
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      board.camera.zoom = 1.35;
      board.canvas.width = 800;
      board.canvas.height = 600;
      board.draw();
      const before = { focal: board.proj.focal, span: board.view.xMax - board.view.xMin, cells: board.floorLattice().xs.length };
      board.onWheel({ preventDefault() {}, ctrlKey: true, deltaY: -120, clientX: 0, clientY: 0 });
      board.draw();
      const after = { focal: board.proj.focal, span: board.view.xMax - board.view.xMin, cells: board.floorLattice().xs.length };
      if (!(after.focal > before.focal * 1.1)) throw new Error(`focal ${before.focal} -> ${after.focal}`);
      if (Math.abs(after.span - before.span) > 1e-9) throw new Error("The axis numbers moved");
      if (after.cells !== before.cells) throw new Error("The grid changed its count");
      board.camera.zoom = 1.35;
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("A surface is cut at the height limit, not capped", () => {
    appCall(() => board.resize());
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x^2+y^2");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      board.canvas.width = 800;
      board.canvas.height = 600;
      board.draw();
      const surface = board.scene.surfaces[0];
      if (!surface.edges.length) throw new Error("Nothing was cut at the limit");
      const ceiling = board.zToLocal(10);
      let highest = -Infinity;
      for (const edge of surface.edges) {
        for (let vertex = 0; vertex < edge.count; vertex++) {
          highest = Math.max(highest, edge.shape[vertex * 3 + 2]);
        }
      }
      if (Math.abs(highest - ceiling) > 1e-9) throw new Error(`The rim sits at ${highest}, not ${ceiling}`);
      const whole = (surface.n - 1) * (surface.n - 1);
      const painted = surface.colors.filter(Boolean).length;
      if (!(painted < whole * 0.5)) throw new Error("The area past the limit was filled in");
      if (!(painted > 50)) throw new Error(`Only ${painted} cells were drawn`);
      const faces = board.projectScene();
      if (!(faces.length > painted)) throw new Error("The rim pieces are not drawn");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("The grid is spaced from zero", () => {
    appCall(() => board.resize());
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
      const zStep = niceStep(board.view.zMax - board.view.zMin, 5);
      const zs = board.multiples(board.view.zMin, board.view.zMax, zStep);
      if (!zs.includes(0) || !onStep(zs, zStep)) throw new Error("Z ticks are not spaced from 0");
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("3D coordinates share one mapping", () => {
    appCall(() => board.resize());
    flush(appWindow);
    appCall(() => {
      board.setDimension("3d");
      board.resetView();
      board.setView({ xMin: -10, xMax: 10, yMin: -2, yMax: 2, zMin: 0, zMax: 8 });
      const n = 49;
      const ground = board.meshDomain();
      const i = Math.round(((5 - ground.x0) / (ground.x1 - ground.x0)) * (n - 1));
      const onFive = board.localGridPoint(i, 0, n, 5);
      const sampled = ground.x0 + (i / (n - 1)) * (ground.x1 - ground.x0);
      if (Math.abs(onFive.x - board.worldToFloorX(sampled)) > 1e-9) throw new Error("surface x");
      if (Math.abs(sampled - 5) > (ground.x1 - ground.x0) / (n - 1)) throw new Error("the sample is far from x = 5");
      if (Math.abs(onFive.z - board.zToLocal(5)) > 1e-9) throw new Error("surface z");
      const yEnd = board.localGridPoint(0, n - 1, n, 0).y;
      if (!(Math.abs(yEnd) < 1.5)) throw new Error(String(yEnd));
      const origin = board.axisAnchor();
      if (Math.abs(origin.y) > 1e-9) throw new Error("y origin");
      if (Math.abs(origin.z - board.zToLocal(0)) > 1e-9) throw new Error("floor z");
      if (Math.abs(board.planeZ() - origin.z) > 1e-9) throw new Error("plane");
      board.setView({ xMin: 0, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      const shifted = board.axisAnchor();
      if (Math.abs(shifted.x - board.worldToFloorX(0)) > 1e-9) throw new Error("x origin");
      const middle = board.meshDomain();
      const atZero = Math.round(((0 - middle.x0) / (middle.x1 - middle.x0)) * (n - 1));
      if (Math.abs(board.localGridPoint(atZero, 24, n, 0).x - shifted.x) > 0.02) throw new Error("x=0 surface");
      board.resetView();
      board.setDimension("2d");
    });
  });

  test("The 3D floor grid stays square when the camera zooms", () => {
    appCall(() => board.resize());
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
      appCall(() => board.resize());
      flush(appWindow);
      assert(region("#plot") === "no-drag", "Canvas");
      assert(region("#presets") === "drag", region("#presets"));
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
      await wait(140);
      const value = loaded.win.document.getElementById("graphExpr").value;
      assert(value === "sin(x)+1", value || "empty");
    } finally {
      loaded.frame.remove();
      doc.getElementById("expr").value = "";
    }
  });

  test("Every graph control lives in the graph window", async () => {
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
      for (const id of ["dim2d", "dim3d", "graphExpr", "addFn"]) {
        const node = doc.getElementById(id);
        assert(getComputedStyle(node).display !== "none", `${id} is missing from the graph window`);
        assert(node.getBoundingClientRect().width > 0, `${id} has no room in the toolbar`);
      }
      const toolRow = doc.querySelector(".graph-tool-row").getBoundingClientRect();
      for (const id of ["dim2d", "graphExpr", "addFn", "zoomIn", "resetView"]) {
        const box = doc.getElementById(id).getBoundingClientRect();
        assert(box.left >= toolRow.left - 1 && box.right <= toolRow.right + 1, `${id} is cut off the toolbar`);
      }
      assert(getComputedStyle(doc.querySelector(".presets")).display !== "none", "The preset chips are missing");
      assert(getComputedStyle(doc.getElementById("fnList")).display !== "none", "The function list stays with the plot");
      assert(getComputedStyle(doc.querySelector(".canvas-wrap")).display !== "none", "Plot is visible");
      doc.getElementById("dim3d").click();
      assert(getComputedStyle(doc.querySelector(".axis-field[data-axis=\"z\"]")).display !== "none", "Axis controls stay with the plot");
      assert(getComputedStyle(doc.getElementById("axisToggle")).display !== "none", "Axis values are available in 3D");
      assert(getComputedStyle(doc.getElementById("axesToggle")).display !== "none", "Axis visibility is available in 3D");
      const graphClose = doc.getElementById("graphClose");
      assert(!graphClose.hidden, "Close button");
      assert(graphClose.textContent === "×", graphClose.textContent);
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
      assert(parseFloat(appStyle.borderTopLeftRadius) >= 12, appStyle.borderTopLeftRadius);
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
      appWindow.setMode("basic");
      flush(appWindow);
      const mainDoc = appWindow.document;
      const screen = mainDoc.getElementById("screenGraph");
      assert(getComputedStyle(screen).visibility === "hidden", "The calculator window shows a graph screen");
      assert(screen.getBoundingClientRect().right <= 0, "The graph screen sits inside the calculator window");
      for (const id of ["graphExpr", "addFn", "dim2d", "dim3d", "fnList", "gridToggle"]) {
        assert(mainDoc.getElementById(id).getBoundingClientRect().right <= 0, `${id} shows on the calculator window`);
      }
      assert(!mainDoc.getElementById("screenCalc").hidden, "The calculator screen is hidden");
      assert(getComputedStyle(mainDoc.getElementById("keys")).display !== "none", "The calculator keys are hidden");
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
      const head = doc.querySelector(".print-head");
      assert(head.querySelector("h2").textContent === "인쇄", head.querySelector("h2").textContent);
      assert(head.querySelector(".icon-print"), "The print window has no print icon");
      assert(doc.querySelector("#printSetup .print-group").textContent === "페이지 설정", "The page setup group lost its name");
      const stage = doc.querySelector(".print-stage");
      const actions = doc.querySelector(".print-actions");
      assert(stage.contains(actions), "The print actions are not under the preview");
      assert(actions.getBoundingClientRect().top >= doc.getElementById("printPreview").getBoundingClientRect().bottom - 1, "The actions sit over the preview");
      assert(doc.getElementById("printCancel"), "The close button is missing");
      assert(doc.querySelectorAll("#printClose").length === 1, "Two elements answer to printClose");
      const setup = doc.getElementById("printSetup");
      const headTop = head.getBoundingClientRect().top;
      setup.scrollTop = setup.scrollHeight;
      flush(loaded.win);
      assert(Math.abs(head.getBoundingClientRect().top - headTop) < 1, "The window name scrolls away with the settings");
      setup.scrollTop = 0;
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

  test("The graph window opens and closes its panels", async () => {
    localStorage.removeItem("mycalc-panel-left");
    localStorage.removeItem("mycalc-panel-right");
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      loaded.frame.style.width = "1200px";
      flush(loaded.win);
      const doc = loaded.win.document;
      const list = doc.getElementById("fnList");
      const side = doc.getElementById("graphSide");
      const left = doc.getElementById("panelLeft");
      const right = doc.getElementById("panelRight");
      assert(!left.hidden && !right.hidden, "The panel buttons are missing");
      assert(!list.hidden, "The expression panel starts closed");
      assert(side.hidden, "The settings panel starts open");
      right.click();
      flush(loaded.win);
      assert(!side.hidden, "The settings panel did not open");
      assert(right.getAttribute("aria-pressed") === "true", "The button does not show its state");
      const columns = getComputedStyle(doc.querySelector(".graph-body")).gridTemplateColumns.split(" ");
      assert(columns.length === 4, columns.join(" "));
      left.click();
      flush(loaded.win);
      assert(list.hidden, "The expression panel did not close");
      assert(doc.getElementById("graphSplit").hidden, "The splitter stayed behind");
      const turn = doc.getElementById("sideLightTurn");
      turn.value = "90";
      turn.dispatchEvent(new Event("input", { bubbles: true }));
      const azimuth = callWin(loaded.win, () => board.light.azimuth);
      assert(Math.abs(azimuth - Math.PI / 2) < 1e-9, String(azimuth));
      const far = doc.getElementById("sideLightFar");
      far.value = "500";
      far.dispatchEvent(new Event("input", { bubbles: true }));
      assert(Math.abs(callWin(loaded.win, () => board.lightReach()) - 5) < 1e-9, "The distance did not follow");
      const lit = doc.getElementById("sideLightOn");
      lit.checked = false;
      lit.dispatchEvent(new Event("change", { bubbles: true }));
      assert(callWin(loaded.win, () => board.light.on) === false, "The light stayed on");
      left.click();
      right.click();
      flush(loaded.win);
      assert(!list.hidden && side.hidden, "The panels did not go back");
    } finally {
      loaded.frame.remove();
      localStorage.removeItem("mycalc-panel-left");
      localStorage.removeItem("mycalc-panel-right");
    }
  });

  test("The expression panel can be resized", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      loaded.frame.style.width = "1200px";
      flush(loaded.win);
      const split = doc.getElementById("graphSplit");
      assert(split && getComputedStyle(split).display !== "none", "The panel has no splitter");
      assert(getComputedStyle(split).cursor === "col-resize", getComputedStyle(split).cursor);
      const list = doc.getElementById("fnList");
      const before = Math.round(list.getBoundingClientRect().width);
      const edge = split.getBoundingClientRect().left + 5;
      const fire = (type, x) => split.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: 200 }));
      fire("pointerdown", edge);
      fire("pointermove", edge + 90);
      fire("pointerup", edge + 90);
      flush(loaded.win);
      const after = Math.round(list.getBoundingClientRect().width);
      assert(after > before + 40, `panel ${before} -> ${after}`);
      assert(doc.querySelector(".canvas-wrap").getBoundingClientRect().width > 300, "The plot lost its room");
    } finally {
      loaded.frame.remove();
    }
  });

  test("The smallest graph window still shows every range control", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      loaded.frame.style.width = "1120px";
      loaded.frame.style.height = "540px";
      flush(loaded.win);
      const doc = loaded.win.document;
      doc.getElementById("dim3d").click();
      flush(loaded.win);
      const app = doc.querySelector(".app").getBoundingClientRect();
      const tools = doc.querySelector(".graph-tool-row");
      const toolBox = tools.getBoundingClientRect();
      for (const id of ["dim2d", "graphExpr", "addFn", "zoomIn", "resetView", "axisColorX", "printGraph"]) {
        const box = doc.getElementById(id).getBoundingClientRect();
        assert(box.width > 0, `${id} has no room`);
        assert(box.right <= app.right - 6, `${id} is clipped at ${Math.round(box.right)} of ${Math.round(app.right)}`);
      }
      assert(tools.scrollWidth <= Math.ceil(toolBox.width) + 1, "The toolbar is clipped");
      assert(doc.querySelector(".canvas-wrap").getBoundingClientRect().height > 100, "The plot has no room left");
    } finally {
      loaded.frame.remove();
    }
  });

  test("A hidden plot leaves the range alone", async () => {
    const loaded = await loadApp("desktop=1");
    try {
      const outcome = callWin(loaded.win, () => {
        setMode("graph");
        board.setDimension("2d");
        board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
        const first = [board.view.xMin, board.view.xMax, board.view.yMin, board.view.yMax].join(",");
        for (let round = 0; round < 5; round++) board.draw();
        return { auto: board.autoSquare, first, now: [board.view.xMin, board.view.xMax, board.view.yMin, board.view.yMax].join(",") };
      });
      assert(outcome.auto === false, "The hidden board still squares the range");
      assert(outcome.first === outcome.now, `${outcome.first} -> ${outcome.now}`);
      const shown = await loadApp("pop=graph&desktop=1");
      try {
        assert(callWin(shown.win, () => board.autoSquare) === true, "The graph window does not square its units");
      } finally {
        shown.frame.remove();
      }
    } finally {
      loaded.frame.remove();
    }
  });

  test("A window shares a change once", async () => {
    const loaded = await loadApp("");
    try {
      const heard = [];
      const channel = new BroadcastChannel("mycalc-graph");
      channel.onmessage = (event) => {
        if (event.data && event.data.type === "state") heard.push(event.data);
      };
      callWin(loaded.win, () => {
        setMode("graph");
        board.setDimension("2d");
        while (board.functions.length) board.removeFunction(board.functions[0].id);
        addGraph("x+1");
      });
      await wait(120);
      const spoken = heard.length;
      callWin(loaded.win, () => {
        publishGraph();
        publishGraph();
        board.draw();
      });
      await wait(120);
      assert(heard.length === spoken, `${heard.length - spoken} repeats`);
      callWin(loaded.win, () => addGraph("x+2"));
      await wait(120);
      assert(heard.length === spoken + 1, "A real change went unshared");
      channel.close();
    } finally {
      loaded.frame.remove();
    }
  });

  test("Deleting a 3D graph sticks in both windows", async () => {
    const main = await loadApp("");
    const pop = await loadApp("pop=graph&desktop=1");
    try {
      // Let the greeting between the windows settle before changing anything.
      await wait(200);
      callWin(main.win, () => {
        setMode("graph");
        board.setDimension("3d");
        while (board.fns3d.length) board.removeFunction(board.fns3d[0].id);
        addGraph("x*y/10");
        addGraph("x+y");
      });
      await wait(250);
      const seen = callWin(pop.win, () => board.functions.map((fn) => fn.expr));
      assert(seen.length === 2, seen.join(",") || "nothing arrived");
      const row = pop.win.document.querySelectorAll("#fnList li")[0];
      assert(row, "The panel has no rows");
      row.querySelectorAll(".icon-btn")[1].click();
      await wait(300);
      const left = callWin(pop.win, () => board.functions.map((fn) => fn.expr));
      const mirrored = callWin(main.win, () => board.fns3d.map((fn) => fn.expr));
      assert(left.length === 1, left.join(",") || "empty");
      assert(mirrored.join(",") === left.join(","), `${mirrored.join(",")} vs ${left.join(",")}`);
      callWin(main.win, () => {
        while (board.fns3d.length) board.removeFunction(board.fns3d[0].id);
      });
      await wait(150);
    } finally {
      pop.frame.remove();
      main.frame.remove();
    }
  });

  test("Every window wears the calculator chrome", async () => {
    const settings = await loadApp("pop=settings");
    const info = await loadApp("pop=info");
    const print = await loadApp("pop=print");
    try {
      for (const [name, loaded] of [["settings", settings], ["info", info], ["print", print]]) {
        const style = getComputedStyle(loaded.win.document.querySelector(".app"));
        assert(parseFloat(style.borderTopLeftRadius) >= 12, `${name} corners ${style.borderTopLeftRadius}`);
        assert(style.boxShadow !== "none", `${name} shadow`);
      }
      const settingsDoc = settings.win.document;
      assert(!settingsDoc.getElementById("settingsMin").hidden, "Settings minimise");
      assert(!settingsDoc.getElementById("settingsMax").hidden, "Settings maximise");
      const foot = settingsDoc.querySelector("#settingsSheet .sheet-foot");
      assert(foot && foot.children.length === 2, "The settings footer is missing");
      const reset = settingsDoc.getElementById("resetSettings").getBoundingClientRect();
      const apply = settingsDoc.getElementById("applyCustom").getBoundingClientRect();
      assert(Math.abs(reset.top - apply.top) < 2, "The footer buttons are not on one line");
      const custom = settingsDoc.querySelector(".custom-theme").getBoundingClientRect();
      assert(reset.top >= custom.bottom - 1, "The footer is not below the colours");
      assert(!info.win.document.getElementById("closeInfo").hidden, "The info window has no close button");
      const infoOk = info.win.document.getElementById("infoOk");
      assert(infoOk && getComputedStyle(infoOk).display !== "none", "The info window has no confirm button");
      assert(infoOk.getBoundingClientRect().bottom <= info.win.document.querySelector(".app").getBoundingClientRect().bottom, "The confirm button is off the window");
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

suite("Function coverage", () => {
  test("Every one-argument function returns its known value", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const table = [
        ["sin(0)", 0], ["cos(0)", 1], ["tan(0)", 0],
        ["asin(1)", Math.PI / 2], ["acos(1)", 0], ["atan(1)", Math.PI / 4],
        ["sinh(0)", 0], ["cosh(0)", 1], ["tanh(0)", 0],
        ["asinh(0)", 0], ["acosh(1)", 0], ["atanh(0)", 0],
        ["log(1000)", 3], ["ln(1)", 0], ["log2(8)", 3], ["log10(100)", 2],
        ["sqrt(16)", 4], ["cbrt(27)", 3], ["abs(-3)", 3], ["exp(0)", 1],
        ["fact(5)", 120], ["floor(2.7)", 2], ["ceil(2.1)", 3], ["round(2.5)", 3],
      ];
      for (const [expr, want] of table) {
        const got = engine.evaluate(expr);
        if (!Number.isFinite(got) || Math.abs(got - want) > 1e-9) throw new Error(`${expr} = ${got}, not ${want}`);
      }
    });
  });

  test("Every two-argument function returns its known value", () => {
    appCall(() => {
      const engine = new CalcEngine();
      const table = [
        // mod follows the sign of the divisor, as a floored remainder does.
        ["mod(7,3)", 1], ["mod(-7,3)", 2], ["mod(7,-3)", -2],
        ["ncr(6,2)", 15], ["ncr(6,0)", 1], ["npr(6,2)", 30],
        ["min(2,5)", 2], ["max(2,5)", 5],
      ];
      for (const [expr, want] of table) {
        const got = engine.evaluate(expr);
        if (!Number.isFinite(got) || Math.abs(got - want) > 1e-9) throw new Error(`${expr} = ${got}, not ${want}`);
      }
    });
  });

  test("Every name in the function table can be called", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const safe = { asin: "0.5", acos: "0.5", atanh: "0.5", acosh: "2", log: "10", ln: "2", log2: "8", log10: "10", sqrt: "4", fact: "4" };
      const missed = [];
      for (const [name, shape] of Object.entries(FUNCTIONS)) {
        // A counted function names its counter first, so it is written out.
        const args = shape.counts ? "k, 1, 4, k" : shape.args === 2 ? "5,2" : safe[name] || "0.5";
        let value;
        try {
          value = engine.evaluate(`${name}(${args})`);
        } catch (error) {
          missed.push(`${name}: ${error.message}`);
          continue;
        }
        if (!Number.isFinite(value)) missed.push(`${name} gave ${value}`);
      }
      if (missed.length) throw new Error(missed.join(" | "));
    });
  });

  test("Inverse trigonometry follows DEG and RAD", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "deg";
      const degrees = [["asin(1)", 90], ["acos(0)", 90], ["atan(1)", 45], ["cos(60)", 0.5], ["tan(45)", 1]];
      for (const [expr, want] of degrees) {
        const got = engine.evaluate(expr);
        if (Math.abs(got - want) > 1e-9) throw new Error(`deg ${expr} = ${got}`);
      }
      engine.angleMode = "rad";
      const radians = [["asin(1)", Math.PI / 2], ["atan(1)", Math.PI / 4]];
      for (const [expr, want] of radians) {
        const got = engine.evaluate(expr);
        if (Math.abs(got - want) > 1e-9) throw new Error(`rad ${expr} = ${got}`);
      }
    });
  });

  test("Hyperbolic functions ignore the angle unit", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "deg";
      const inDegrees = engine.evaluate("sinh(1)");
      engine.angleMode = "rad";
      const inRadians = engine.evaluate("sinh(1)");
      if (Math.abs(inDegrees - inRadians) > 1e-12) throw new Error(`${inDegrees} vs ${inRadians}`);
      if (Math.abs(inRadians - Math.sinh(1)) > 1e-12) throw new Error(String(inRadians));
    });
  });

  test("Arguments out of range are reported, not guessed", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const bad = ["asin(2)", "acos(2)", "acosh(0)", "atanh(1)", "ln(0)", "ln(-1)", "log(0)", "sqrt(-1)", "fact(-1)", "fact(1.5)", "mod(1,0)", "ncr(2,5)", "npr(2,5)", "1/0"];
      const quiet = [];
      for (const expr of bad) {
        try {
          const value = engine.evaluate(expr);
          quiet.push(`${expr} = ${value}`);
        } catch {
          /* An error is what this test wants. */
        }
      }
      if (quiet.length) throw new Error(quiet.join(" | "));
    });
  });

  test("Constants, Ans and implicit multiplication work together", () => {
    appCall(() => {
      const engine = new CalcEngine();
      if (Math.abs(engine.evaluate("π") - Math.PI) > 1e-12) throw new Error("pi");
      if (Math.abs(engine.evaluate("e") - Math.E) > 1e-12) throw new Error("e");
      engine.evaluate("6");
      if (engine.evaluate("2Ans") !== 12) throw new Error("Ans");
      if (Math.abs(engine.evaluate("2π") - 2 * Math.PI) > 1e-12) throw new Error("2pi");
      if (engine.evaluate("(1+2)(3+4)") !== 21) throw new Error("groups");
    });
  });

  test("Every scientific key types the function it shows", () => {
    const doc = appWindow.document;
    appWindow.setMode("scientific");
    const keys = appCall(() => sciKeys().flat().map((key) => ({ label: key.label, value: key.value === undefined ? "" : String(key.value), type: key.type })));
    const missed = [];
    for (const key of keys) {
      if (key.type === "second") continue;
      appWindow.clearCalc();
      const button = [...doc.querySelectorAll("#keys .key")].find((item) => item.textContent === key.label);
      if (!button) {
        missed.push(`${key.label} is missing`);
        continue;
      }
      button.click();
      const typed = doc.getElementById("expr").value;
      const wanted = key.type === "fn" ? key.value : key.value.replace(/\(\s*\)?$/, "(");
      if (!typed.includes(wanted)) missed.push(`${key.label} typed ${typed}`);
    }
    appWindow.clearCalc();
    appWindow.setMode("basic");
    if (missed.length) throw new Error(missed.join(" | "));
  });

  test("2nd swaps every key that has a second face", () => {
    const doc = appWindow.document;
    appWindow.setMode("scientific");
    const pairs = appCall(() => sciKeys().flat().filter((key) => key.altLabel).map((key) => [key.label, key.altLabel]));
    const second = () => [...doc.querySelectorAll("#keys .key")].find((button) => button.textContent === "2nd");
    second().click();
    const shown = [...doc.querySelectorAll("#keys .key")].map((button) => button.textContent);
    const missed = pairs.filter(([, alt]) => !shown.includes(alt)).map(([label, alt]) => `${label} -> ${alt}`);
    second().click();
    const back = [...doc.querySelectorAll("#keys .key")].map((button) => button.textContent);
    const stuck = pairs.filter(([label]) => !back.includes(label)).map(([label]) => label);
    appWindow.setMode("basic");
    assert(pairs.length >= 6, `${pairs.length} second faces`);
    assert(!missed.length, missed.join(" | "));
    assert(!stuck.length, stuck.join(" | "));
  });

  test("Every basic key does the job its label promises", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    appWindow.clearCalc();
    const press = (label) => {
      const button = [...doc.querySelectorAll("#keys .key")].find((item) => item.textContent === label);
      assert(button, `${label} key`);
      button.click();
    };
    const expr = doc.getElementById("expr");
    for (const digit of ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"]) press(digit);
    assert(expr.value === "7894561230", expr.value);
    press("⌫");
    assert(expr.value === "789456123", expr.value);
    press("AC");
    assert(expr.value === "" && doc.getElementById("result").textContent === "0", expr.value);
    press("8");
    press(".");
    press(".");
    press("5");
    assert(expr.value === "8.5", expr.value);
    press("±");
    assert(expr.value === "(-8.5)", expr.value);
    assert(doc.getElementById("result").textContent === "-8.5", doc.getElementById("result").textContent);
    press("AC");
    for (const [label, want] of [["÷", "/"], ["×", "*"], ["−", "-"], ["+", "+"]]) {
      appWindow.clearCalc();
      press("8");
      press(label);
      press("2");
      press("=");
      const result = doc.getElementById("result").textContent;
      const expected = appCall((text) => String(new CalcEngine().evaluate(text)), `8${want}2`);
      assert(result.replace(/,/g, "") === expected, `8 ${label} 2 = ${result}, not ${expected}`);
    }
    appWindow.clearCalc();
    press("5");
    press("0");
    press("%");
    assert(doc.getElementById("result").textContent === "0.5", doc.getElementById("result").textContent);
    appWindow.clearCalc();
  });

  test("Memory keys add, subtract, recall and clear", () => {
    const doc = appWindow.document;
    appWindow.setMode("basic");
    doc.getElementById("memClear").click();
    assert(doc.getElementById("memFlag").hidden, "M stayed on after MC");
    doc.getElementById("expr").value = "7";
    appWindow.equals();
    doc.getElementById("memAdd").click();
    doc.getElementById("expr").value = "3";
    appWindow.equals();
    doc.getElementById("memAdd").click();
    assert(appCall(() => state.memory) === 10, String(appCall(() => state.memory)));
    doc.getElementById("expr").value = "4";
    appWindow.equals();
    doc.getElementById("memSub").click();
    assert(appCall(() => state.memory) === 6, String(appCall(() => state.memory)));
    appWindow.clearCalc();
    doc.getElementById("memRecall").click();
    assert(doc.getElementById("expr").value === "6", doc.getElementById("expr").value);
    doc.getElementById("memClear").click();
    assert(appCall(() => state.memory) === 0 && doc.getElementById("memFlag").hidden, "MC");
    appWindow.clearCalc();
  });
});

suite("Keypad layout", () => {
  const padLabels = (win) => [...win.document.querySelectorAll("#keys .key")].map((key) => key.textContent);
  const digitTriples = (labels) => {
    const rows = [];
    for (const trio of [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]]) {
      rows.push([labels.indexOf(trio[0]), trio.join("")]);
    }
    return rows.sort((a, b) => a[0] - b[0]).map((row) => row[1]);
  };

  test("The digit rows start at 7 by default", () => {
    const saved = localStorage.getItem("mycalc-keypad");
    try {
      appWindow.setKeypad("789");
      appWindow.setMode("basic");
      assert(appCall(() => state.keypad) === "789", "Stored order");
      assert(digitTriples(padLabels(appWindow)).join("|") === "789|456|123", padLabels(appWindow).join(" "));
    } finally {
      if (saved == null) localStorage.removeItem("mycalc-keypad");
      else localStorage.setItem("mycalc-keypad", saved);
      appWindow.setKeypad("789");
    }
  });

  test("The 1-2-3 arrangement flips the three digit rows", () => {
    try {
      appWindow.setMode("basic");
      appWindow.setKeypad("123");
      assert(digitTriples(padLabels(appWindow)).join("|") === "123|456|789", padLabels(appWindow).join(" "));
      appWindow.setKeypad("789");
      assert(digitTriples(padLabels(appWindow)).join("|") === "789|456|123", padLabels(appWindow).join(" "));
    } finally {
      appWindow.setKeypad("789");
    }
  });

  test("Zero sits in the middle digit column in every keypad", () => {
    const doc = appWindow.document;
    doc.documentElement.classList.remove("desktop");
    const centres = () => {
      const keys = [...doc.querySelectorAll("#keys .key")];
      const zero = keys.find((key) => key.textContent === "0");
      const middle = keys.find((key) => key.textContent === "5");
      assert(zero && middle, "0 and 5 keys");
      const a = zero.getBoundingClientRect();
      const b = middle.getBoundingClientRect();
      return Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2);
    };
    try {
      for (const order of ["789", "123"]) {
        appWindow.setKeypad(order);
        for (const mode of ["basic", "scientific", "programmer", "currency", "unit"]) {
          appWindow.setMode(mode);
          flush(appWindow);
          const gap = centres();
          assert(gap < 1.5, `${mode} (${order}) is off by ${gap.toFixed(1)}px`);
        }
      }
    } finally {
      appWindow.setKeypad("789");
      appWindow.setMode("basic");
    }
  });

  test("Flipping the programmer pad leaves hex, bit and operator keys alone", () => {
    const doc = appWindow.document;
    try {
      appWindow.setMode("programmer");
      for (const order of ["789", "123"]) {
        appWindow.setKeypad(order);
        flush(appWindow);
        const keys = [...doc.querySelectorAll("#keys .key")];
        const hex = keys.filter((key) => /^[A-F]$/.test(key.textContent)).map((key) => key.textContent);
        assert(hex.join("") === "ABCDEF", `${order}: ${hex.join("")}`);
        const ops = ["÷", "×", "−", "+"].map((label) => keys.find((key) => key.textContent === label));
        assert(ops.every(Boolean), `${order}: an operator key is missing`);
        const lefts = new Set(ops.map((key) => Math.round(key.getBoundingClientRect().left)));
        assert(lefts.size === 1, `${order}: operators sit in ${lefts.size} columns`);
        for (const label of ["NOT", "AND", "OR", "XOR", "≪", "≫"]) {
          assert(keys.some((key) => key.textContent === label), `${order}: ${label} is missing`);
        }
      }
    } finally {
      appWindow.setKeypad("789");
      appWindow.setMode("basic");
    }
  });

  test("A new window opens with the stored arrangement", async () => {
    const saved = localStorage.getItem("mycalc-keypad");
    localStorage.setItem("mycalc-keypad", "123");
    const loaded = await loadApp("");
    try {
      const labels = padLabels(loaded.win);
      assert(callWin(loaded.win, () => state.keypad) === "123", "The stored order was ignored");
      assert(digitTriples(labels).join("|") === "123|456|789", labels.join(" "));
    } finally {
      loaded.frame.remove();
      if (saved == null) localStorage.removeItem("mycalc-keypad");
      else localStorage.setItem("mycalc-keypad", saved);
      appWindow.setKeypad("789");
    }
  });

  test("The settings sheet switches the arrangement", () => {
    const doc = appWindow.document;
    try {
      appWindow.setMode("basic");
      appWindow.setKeypad("789");
      appWindow.openSheet(doc.getElementById("settingsSheet"));
      const chips = () => [...doc.querySelectorAll("#padChoices .pad-chip")];
      assert(chips().length === 2, `${chips().length} choices`);
      assert(chips().find((chip) => chip.dataset.order === "789").getAttribute("aria-pressed") === "true", "789 is not marked");
      const preview = chips()[0].querySelectorAll(".pad-view i");
      assert(preview.length === 12, `${preview.length} preview cells`);
      assert(preview[9].classList.contains("pad-blank") && preview[10].textContent === "0" && preview[11].classList.contains("pad-blank"), "The preview does not centre 0");
      chips().find((chip) => chip.dataset.order === "123").click();
      assert(appCall(() => state.keypad) === "123", "The click did not take");
      assert(chips().find((chip) => chip.dataset.order === "123").getAttribute("aria-pressed") === "true", "123 is not marked");
      assert(digitTriples(padLabels(appWindow)).join("|") === "123|456|789", "The keypad did not follow");
      chips().find((chip) => chip.dataset.order === "789").click();
      assert(digitTriples(padLabels(appWindow)).join("|") === "789|456|123", "The keypad did not come back");
    } finally {
      appWindow.closeSheets();
      appWindow.setKeypad("789");
    }
  });

  test("Default settings put the arrangement back", () => {
    const savedTheme = localStorage.getItem("mycalc-theme");
    const savedPad = localStorage.getItem("mycalc-keypad");
    try {
      appWindow.setKeypad("123");
      assert(appCall(() => state.keypad) === "123", "Setup");
      appWindow.document.getElementById("resetSettings").click();
      assert(appCall(() => state.keypad) === "789", appCall(() => state.keypad));
      assert(localStorage.getItem("mycalc-keypad") === "789", String(localStorage.getItem("mycalc-keypad")));
    } finally {
      if (savedTheme == null) localStorage.removeItem("mycalc-theme");
      else localStorage.setItem("mycalc-theme", savedTheme);
      if (savedPad == null) localStorage.removeItem("mycalc-keypad");
      else localStorage.setItem("mycalc-keypad", savedPad);
      appWindow.loadTheme();
      appWindow.setKeypad("789");
    }
  });

  test("Keys still type their digit after the arrangement changes", () => {
    const doc = appWindow.document;
    try {
      appWindow.setMode("basic");
      appWindow.setKeypad("123");
      appWindow.clearCalc();
      for (const digit of ["7", "0", "9"]) {
        [...doc.querySelectorAll("#keys .key")].find((key) => key.textContent === digit).click();
      }
      assert(doc.getElementById("expr").value === "709", doc.getElementById("expr").value);
    } finally {
      appWindow.clearCalc();
      appWindow.setKeypad("789");
    }
  });
});

suite("Units", () => {
  test("Every unit converts to itself and back through the base", () => {
    appCall(() => {
      const trouble = [];
      for (const group of UNIT_GROUPS) {
        for (const unit of group.units) {
          const same = convertUnit(7, group.id, unit.id, unit.id);
          if (Math.abs(same - 7) > 1e-9) trouble.push(`${group.id}/${unit.id} self ${same}`);
          const out = convertUnit(1, group.id, group.base, unit.id);
          const back = convertUnit(out, group.id, unit.id, group.base);
          if (!Number.isFinite(out) || !Number.isFinite(back) || Math.abs(back - 1) > 1e-9) {
            trouble.push(`${group.id}/${unit.id} round trip ${back}`);
          }
        }
      }
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });

  test("Known conversions land on their published value", () => {
    appCall(() => {
      const table = [
        ["length", "in", "mm", 25.4],
        ["length", "mi", "m", 1609.344],
        ["length", "nmi", "km", 1.852],
        ["area", "ha", "m2", 10000],
        ["area", "pyeong", "m2", 400 / 121],
        ["volume", "gal", "L", 3.785411784],
        ["volume", "m3", "L", 1000],
        ["mass", "kg", "lb", 1 / 0.45359237],
        ["mass", "geun", "g", 600],
        ["speed", "kn", "kmh", 1.852],
        ["speed", "kmh", "mps", 1 / 3.6],
        ["time", "yr", "d", 31556952 / 86400],
        ["data", "MiB", "B", 1048576],
        ["data", "bit", "B", 0.125],
        ["pressure", "atm", "Pa", 101325],
        ["energy", "kWh", "J", 3.6e6],
        ["energy", "kcal", "cal", 1000],
        ["power", "hp", "W", 745.69987158227],
        ["angle", "rev", "deg", 360],
        ["angle", "rad", "deg", 180 / Math.PI],
      ];
      const wrong = [];
      for (const [group, from, to, want] of table) {
        const got = convertUnit(1, group, from, to);
        if (!Number.isFinite(got) || Math.abs(got - want) > Math.abs(want) * 1e-9 + 1e-12) {
          wrong.push(`1 ${from} -> ${to} = ${got}, not ${want}`);
        }
      }
      if (wrong.length) throw new Error(wrong.join(" | "));
    });
  });

  test("Temperature crosses its four scales", () => {
    appCall(() => {
      const table = [
        [0, "C", "F", 32],
        [100, "C", "F", 212],
        [-40, "C", "F", -40],
        [0, "C", "K", 273.15],
        [0, "K", "C", -273.15],
        [491.67, "R", "F", 32],
        [0, "C", "R", 491.67],
        [98.6, "F", "C", 37],
      ];
      const wrong = [];
      for (const [amount, from, to, want] of table) {
        const got = convertUnit(amount, "temperature", from, to);
        if (!Number.isFinite(got) || Math.abs(got - want) > 1e-9) wrong.push(`${amount} ${from} -> ${to} = ${got}, not ${want}`);
      }
      if (wrong.length) throw new Error(wrong.join(" | "));
    });
  });

  test("Unknown groups, units and amounts give no number", () => {
    appCall(() => {
      const bad = [
        convertUnit(1, "nothing", "m", "cm"),
        convertUnit(1, "length", "m", "kg"),
        convertUnit(1, "length", "kg", "m"),
        convertUnit(Number.NaN, "length", "m", "cm"),
        convertUnit(Number.POSITIVE_INFINITY, "length", "m", "cm"),
      ];
      const leaked = bad.filter((value) => Number.isFinite(value));
      if (leaked.length) throw new Error(leaked.join(","));
      if (unitGroupById("nothing") !== null) throw new Error("Unknown group");
      if (unitById(unitGroupById("length"), "kg") !== null) throw new Error("Unknown unit");
      if (validUnitPick({ group: "length", from: "m", to: "kg" }) !== null) throw new Error("A bad pick was accepted");
      const pick = validUnitPick({ group: "length", from: "m", to: "cm" });
      if (!pick || pick.amount !== "1") throw new Error("A good pick was refused");
    });
  });

  test("Unit values are formatted for reading", () => {
    appCall(() => {
      const table = [
        [0, "0"],
        [25.4, "25.4"],
        [1234.5, "1,234.5"],
        [1 / 3, "0.33333333"],
        [Number.NaN, String.fromCharCode(8212)],
        [Number.POSITIVE_INFINITY, String.fromCharCode(8212)],
      ];
      for (const [value, want] of table) {
        const got = formatUnit(value);
        if (got !== want) throw new Error(`${value} -> ${got}, not ${want}`);
      }
      if (!/e[+]?13/.test(formatUnit(1e13))) throw new Error(formatUnit(1e13));
      if (!/e-9/.test(formatUnit(1e-9))) throw new Error(formatUnit(1e-9));
    });
  });

  test("Every group carries a base, a default pair and names in both languages", () => {
    appCall(() => {
      const trouble = [];
      if (UNIT_GROUPS.length < 10) trouble.push(`${UNIT_GROUPS.length} groups`);
      const groupIds = new Set();
      for (const group of UNIT_GROUPS) {
        if (groupIds.has(group.id)) trouble.push(`${group.id} is listed twice`);
        groupIds.add(group.id);
        if (!Array.isArray(group.name) || !group.name[0] || !group.name[1]) trouble.push(`${group.id} name`);
        if (unitGroupLabel(group, "ko") !== group.name[0] || unitGroupLabel(group, "en") !== group.name[1]) trouble.push(`${group.id} label`);
        if (group.units.length < 4) trouble.push(`${group.id} has ${group.units.length} units`);
        const base = unitById(group, group.base);
        if (!base) trouble.push(`${group.id} has no base unit`);
        else if (Math.abs(unitToBase(base, 1) - 1) > 1e-12) trouble.push(`${group.id} base is not 1`);
        const ids = new Set();
        for (const unit of group.units) {
          if (ids.has(unit.id)) trouble.push(`${group.id}/${unit.id} is listed twice`);
          ids.add(unit.id);
          if (!unit.symbol) trouble.push(`${group.id}/${unit.id} symbol`);
          if (!unit.name || !unit.name[0] || !unit.name[1]) trouble.push(`${group.id}/${unit.id} name`);
          if (unitLabel(unit, "en") !== unit.name[1]) trouble.push(`${group.id}/${unit.id} label`);
          const affine = typeof unit.toBase === "function";
          if (!affine && !(unit.factor > 0)) trouble.push(`${group.id}/${unit.id} factor`);
        }
        const [from, to] = unitDefaultPair(group.id);
        if (!unitById(group, from) || !unitById(group, to) || from === to) trouble.push(`${group.id} default pair ${from}/${to}`);
      }
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });

  test("The unit screen converts what the keypad types", async () => {
    const saved = localStorage.getItem("mycalc-unit");
    localStorage.removeItem("mycalc-unit");
    const loaded = await loadApp("");
    try {
      const doc = loaded.win.document;
      callWin(loaded.win, () => {
        setMode("unit");
        setUnitGroup("length");
        state.unit.from = "m";
        state.unit.to = "cm";
        setUnitAmount("0");
        renderUnitOptions();
        renderUnit();
      });
      await wait(60);
      assert(!doc.getElementById("screenUnit").hidden, "The unit screen is hidden");
      assert(doc.getElementById("screenCalc").hidden, "The calculator screen stayed open");
      const keys = () => [...doc.querySelectorAll("#keys .key")];
      const press = (label) => {
        const key = keys().find((button) => button.textContent === label);
        assert(key, `${label} key`);
        key.click();
      };
      const grid = doc.querySelector("#keys .keygrid");
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      assert(columns === 4, `${columns} columns`);
      press("1");
      press("2");
      press(".");
      press(".");
      press("5");
      assert(callWin(loaded.win, () => state.unit.amount) === "12.5", callWin(loaded.win, () => state.unit.amount));
      assert(doc.getElementById("unitResult").textContent === "1,250", doc.getElementById("unitResult").textContent);
      assert(doc.getElementById("unitNote").textContent === "1 m = 100 cm", doc.getElementById("unitNote").textContent);
      press("±");
      assert(callWin(loaded.win, () => state.unit.amount) === "-12.5", "The sign key did nothing");
      assert(doc.getElementById("unitResult").textContent === "-1,250", doc.getElementById("unitResult").textContent);
      press("±");
      press("⌫");
      assert(callWin(loaded.win, () => state.unit.amount) === "12.", callWin(loaded.win, () => state.unit.amount));
      press("AC");
      assert(callWin(loaded.win, () => state.unit.amount) === "0", "AC did not clear the value");
      press("9");
      press("00");
      assert(callWin(loaded.win, () => state.unit.amount) === "900", callWin(loaded.win, () => state.unit.amount));
      press("000");
      assert(callWin(loaded.win, () => state.unit.amount) === "900000", callWin(loaded.win, () => state.unit.amount));
    } finally {
      loaded.frame.remove();
      if (saved == null) localStorage.removeItem("mycalc-unit");
      else localStorage.setItem("mycalc-unit", saved);
    }
  });

  test("Swapping and changing the category keep the screen in step", async () => {
    const saved = localStorage.getItem("mycalc-unit");
    localStorage.removeItem("mycalc-unit");
    const loaded = await loadApp("");
    try {
      const doc = loaded.win.document;
      callWin(loaded.win, () => {
        setMode("unit");
        setUnitGroup("length");
        state.unit.from = "km";
        state.unit.to = "m";
        setUnitAmount("2");
        renderUnitOptions();
        renderUnit();
      });
      await wait(60);
      assert(doc.getElementById("unitResult").textContent === "2,000", doc.getElementById("unitResult").textContent);
      doc.getElementById("unitSwap").click();
      assert(doc.getElementById("unitFrom").value === "m" && doc.getElementById("unitTo").value === "km", "The selects did not swap");
      assert(doc.getElementById("unitResult").textContent === "0.002", doc.getElementById("unitResult").textContent);
      const pick = doc.getElementById("unitGroup");
      pick.value = "temperature";
      pick.dispatchEvent(new loaded.win.Event("change"));
      const pair = callWin(loaded.win, () => [state.unit.group, state.unit.from, state.unit.to].join(","));
      assert(pair === "temperature,C,F", pair);
      assert([...doc.getElementById("unitFrom").options].length === 4, "The unit list did not follow the category");
      callWin(loaded.win, () => setUnitAmount("100"));
      assert(doc.getElementById("unitResult").textContent === "212", doc.getElementById("unitResult").textContent);
      assert(doc.getElementById("unitNote").textContent === "100 °C = 212 °F", doc.getElementById("unitNote").textContent);
      const typed = doc.getElementById("unitAmount");
      typed.value = "37";
      typed.dispatchEvent(new loaded.win.Event("input"));
      assert(doc.getElementById("unitResult").textContent === "98.6", doc.getElementById("unitResult").textContent);
    } finally {
      loaded.frame.remove();
      if (saved == null) localStorage.removeItem("mycalc-unit");
      else localStorage.setItem("mycalc-unit", saved);
    }
  });

  test("The unit choice is remembered for next time", async () => {
    const saved = localStorage.getItem("mycalc-unit");
    localStorage.setItem("mycalc-unit", JSON.stringify({ group: "mass", from: "kg", to: "lb", amount: "3" }));
    const loaded = await loadApp("");
    try {
      const doc = loaded.win.document;
      callWin(loaded.win, () => setMode("unit"));
      await wait(60);
      const pick = callWin(loaded.win, () => [state.unit.group, state.unit.from, state.unit.to, state.unit.amount].join(","));
      assert(pick === "mass,kg,lb,3", pick);
      assert(doc.getElementById("unitGroup").value === "mass", doc.getElementById("unitGroup").value);
      assert(doc.getElementById("unitAmount").value === "3", doc.getElementById("unitAmount").value);
      callWin(loaded.win, () => setUnitGroup("data"));
      const stored = JSON.parse(localStorage.getItem("mycalc-unit"));
      assert(stored.group === "data" && stored.from === "MB" && stored.to === "MiB", JSON.stringify(stored));
    } finally {
      loaded.frame.remove();
      if (saved == null) localStorage.removeItem("mycalc-unit");
      else localStorage.setItem("mycalc-unit", saved);
    }
  });

  test("The keyboard types into the amount on the converter screens", async () => {
    const savedUnit = localStorage.getItem("mycalc-unit");
    localStorage.removeItem("mycalc-unit");
    const loaded = await loadApp("");
    try {
      const press = (key) => callWin(loaded.win, new Function(`
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
        return state.mode === "unit" ? state.unit.amount : state.currency.amount;
      `));
      callWin(loaded.win, () => {
        setMode("unit");
        setUnitGroup("length");
        setUnitAmount("0");
      });
      await wait(60);
      press("4");
      press("2");
      assert(callWin(loaded.win, () => state.unit.amount) === "42", callWin(loaded.win, () => state.unit.amount));
      press("-");
      assert(callWin(loaded.win, () => state.unit.amount) === "-42", callWin(loaded.win, () => state.unit.amount));
      press("Backspace");
      assert(callWin(loaded.win, () => state.unit.amount) === "-4", callWin(loaded.win, () => state.unit.amount));
      press("Escape");
      assert(callWin(loaded.win, () => state.unit.amount) === "0", callWin(loaded.win, () => state.unit.amount));
      assert(callWin(loaded.win, () => document.getElementById("expr").value) === "", "The keys leaked into the calculator");
      callWin(loaded.win, () => {
        setMode("currency");
        setCurrencyAmount("0");
      });
      press("7");
      assert(callWin(loaded.win, () => state.currency.amount) === "7", callWin(loaded.win, () => state.currency.amount));
    } finally {
      loaded.frame.remove();
      if (savedUnit == null) localStorage.removeItem("mycalc-unit");
      else localStorage.setItem("mycalc-unit", savedUnit);
    }
  });

  test("The unit screen speaks Korean and English", () => {
    const doc = appWindow.document;
    const savedLang = localStorage.getItem("mycalc-lang");
    try {
      appWindow.setMode("unit");
      appWindow.applyLanguage("ko");
      const koGroup = [...doc.getElementById("unitGroup").options].find((option) => option.value === "length");
      assert(koGroup.textContent === "길이", koGroup.textContent);
      assert(doc.querySelector('.modes button[data-mode="unit"] span:last-child').textContent === "단위", "Korean tab");
      appWindow.applyLanguage("en");
      const enGroup = [...doc.getElementById("unitGroup").options].find((option) => option.value === "length");
      assert(enGroup.textContent === "Length", enGroup.textContent);
      assert(doc.querySelector('.modes button[data-mode="unit"] span:last-child').textContent === "Units", "English tab");
      const first = doc.getElementById("unitFrom").options[0];
      assert(first.textContent.includes("·"), first.textContent);
      assert(doc.getElementById("unitGroup").value === appCall(() => state.unit.group), "The category reset when the language changed");
    } finally {
      appWindow.applyLanguage("ko");
      if (savedLang == null) localStorage.removeItem("mycalc-lang");
      else localStorage.setItem("mycalc-lang", savedLang);
      appWindow.setMode("basic");
    }
  });

  test("Unit mode has its own window size", () => {
    const doc = appWindow.document;
    doc.documentElement.classList.remove("desktop");
    const app = doc.querySelector(".app");
    try {
      appWindow.setMode("unit");
      flush(appWindow);
      const rect = app.getBoundingClientRect();
      assert(`${Math.round(rect.width)}x${Math.round(rect.height)}` === "400x594", `${rect.width}x${rect.height}`);
      const last = [...doc.querySelectorAll("#keys .key")].pop().getBoundingClientRect();
      assert(last.bottom <= rect.bottom + 1 && last.right <= rect.right + 1, "The keypad spills out of the card");
      assert(app.scrollHeight - app.clientHeight === 0, `${app.scrollHeight - app.clientHeight}px of overflow`);
      const tabs = [...doc.querySelectorAll(".modes button")];
      assert(tabs.length === 6, `${tabs.length} tabs`);
      assert(tabs.find((tab) => tab.dataset.mode === "unit").getAttribute("aria-selected") === "true", "The unit tab is not selected");
    } finally {
      appWindow.setMode("basic");
    }
  });
});

suite("Programmer coverage", () => {
  test("Every integer operator gives its known value", () => {
    appCall(() => {
      const table = [
        ["7+5", 12n], ["7-5", 2n], ["7*5", 35n], ["7/2", 3n], ["7%5", 2n],
        ["12&10", 8n], ["12|3", 15n], ["12^10", 6n], ["1<<8", 256n], ["256>>4", 16n],
        ["(2+3)*4", 20n], ["2+3*4", 14n],
      ];
      const wrong = [];
      for (const [expr, want] of table) {
        const got = evaluateInt(expr, 10, 32);
        if (got !== want) wrong.push(`${expr} = ${got}, not ${want}`);
      }
      if (formatInt(evaluateInt("~0", 10, 32), 10, 32) !== "-1") wrong.push("~0");
      if (wrong.length) throw new Error(wrong.join(" | "));
    });
  });

  test("Every bit width keeps its own range", () => {
    appCall(() => {
      const table = [
        ["80", 16, 8, "-128"],
        ["7F", 16, 8, "127"],
        ["8000", 16, 16, "-32768"],
        ["FFFF", 16, 16, "-1"],
        ["80000000", 16, 32, "-2147483648"],
        ["FFFFFFFF", 16, 32, "-1"],
        ["8000000000000000", 16, 64, "-9223372036854775808"],
        ["FFFFFFFFFFFFFFFF", 16, 64, "-1"],
      ];
      const wrong = [];
      for (const [expr, base, bits, want] of table) {
        const got = formatInt(evaluateInt(expr, base, bits), 10, bits);
        if (got !== want) wrong.push(`${expr}/${bits} = ${got}, not ${want}`);
      }
      for (const bits of [8, 16, 32, 64]) {
        const wrapped = evaluateInt("1<<" + bits, 10, bits);
        if (wrapped !== 0n) wrong.push(`1<<${bits} = ${wrapped}`);
      }
      if (wrong.length) throw new Error(wrong.join(" | "));
    });
  });

  test("One value reads the same in all four bases", () => {
    appCall(() => {
      const value = evaluateInt("AB", 16, 16);
      const shown = [16, 10, 8, 2].map((base) => formatInt(value, base, 16).replace(/\s/g, ""));
      const want = ["AB", "171", "253", "10101011"];
      if (shown.join("|") !== want.join("|")) throw new Error(shown.join("|"));
    });
  });

  test("Every programmer bit key does the job its label promises", () => {
    const doc = appWindow.document;
    appWindow.setMode("programmer");
    appWindow.setBase(16);
    appWindow.setBits(8);
    const press = (label) => {
      const button = [...doc.querySelectorAll("#keys .key")].find((item) => item.textContent === label);
      assert(button, `${label} key`);
      assert(!button.disabled, `${label} key is disabled`);
      button.click();
    };
    const expr = doc.getElementById("progExpr");
    const run = (labels) => {
      press("AC");
      for (const label of labels) press(label);
      press("=");
      return expr.value;
    };
    assert(run(["F", "F"]) === "FF", expr.value);
    assert(doc.getElementById("val10").textContent === "-1", doc.getElementById("val10").textContent);
    assert(doc.getElementById("val2").textContent === "1111 1111", doc.getElementById("val2").textContent);
    assert(run(["NOT", "0"]) === "FF", `NOT: ${expr.value}`);
    assert(run(["F", "0", "AND", "3", "C"]) === "30", `AND: ${expr.value}`);
    assert(run(["F", "0", "OR", "0", "F"]) === "FF", `OR: ${expr.value}`);
    assert(run(["F", "0", "XOR", "F", "F"]) === "F", `XOR: ${expr.value}`);
    assert(run(["1", "≪", "4"]) === "10", `shift left: ${expr.value}`);
    assert(run(["7", "0", "≫", "4"]) === "7", `shift right: ${expr.value}`);
    // The right shift keeps the sign, so F0 in 8 bits is -16 and stays negative.
    assert(run(["F", "0", "≫", "4"]) === "FF", `signed shift right: ${expr.value}`);
    assert(run(["(", "1", "+", "2", ")", "×", "3"]) === "9", `brackets: ${expr.value}`);
    press("AC");
    press("A");
    press("=");
    press("±");
    assert(expr.value === "F6", `sign: ${expr.value}`);
    press("⌫");
    assert(expr.value === "F", `backspace: ${expr.value}`);
    press("AC");
    assert(expr.value === "", `AC: ${expr.value}`);
    appWindow.setBase(10);
    appWindow.setBits(32);
    assert(run(["7", "+", "5"]) === "12", `plus: ${expr.value}`);
    assert(run(["7", "−", "5"]) === "2", `minus: ${expr.value}`);
    assert(run(["7", "×", "5"]) === "35", `times: ${expr.value}`);
    assert(run(["7", "÷", "2"]) === "3", `divide: ${expr.value}`);
    assert(run(["7", "%", "5"]) === "2", `percent: ${expr.value}`);
    press("AC");
    appWindow.setMode("basic");
  });

  test("Changing the base rewrites the value in that base", () => {
    const doc = appWindow.document;
    appWindow.setMode("programmer");
    appWindow.setBits(16);
    appWindow.setBase(16);
    doc.getElementById("progExpr").value = "FF";
    appWindow.updateProg();
    appWindow.setBase(10);
    assert(doc.getElementById("progExpr").value === "255", doc.getElementById("progExpr").value);
    appWindow.setBase(8);
    assert(doc.getElementById("progExpr").value === "377", doc.getElementById("progExpr").value);
    appWindow.setBase(2);
    assert(doc.getElementById("progExpr").value === "11111111", doc.getElementById("progExpr").value);
    appWindow.setBase(16);
    assert(doc.getElementById("progExpr").value === "FF", doc.getElementById("progExpr").value);
    const pressable = [...doc.querySelectorAll("#keys .key")].filter((key) => /^[0-9A-F]$/.test(key.textContent));
    assert(pressable.every((key) => !key.disabled), "A digit key is locked in hexadecimal");
    appWindow.setBase(2);
    const locked = [...doc.querySelectorAll("#keys .key")].filter((key) => /^[2-9A-F]$/.test(key.textContent));
    assert(locked.length && locked.every((key) => key.disabled), "A digit key is open in binary");
    appWindow.setBase(10);
    appWindow.setBits(32);
    doc.getElementById("progExpr").value = "";
    appWindow.updateProg();
    appWindow.setMode("basic");
  });
});

suite("Graph colours and axes", () => {
  test("No curve takes an axis colour", () => {
    appCall(() => {
      const distance = (a, b) => {
        const one = hexToRgb(a);
        const two = hexToRgb(b);
        return Math.hypot(one[0] - two[0], one[1] - two[1], one[2] - two[2]);
      };
      const axes = Object.values(AXIS_COLORS);
      const clashes = [];
      for (const colour of PALETTE) {
        for (const axis of axes) {
          const gap = distance(colour, axis);
          if (gap < 60) clashes.push(`${colour} is ${Math.round(gap)} from ${axis}`);
        }
      }
      if (PALETTE.length !== 8) clashes.push(`${PALETTE.length} colours`);
      if (new Set(PALETTE).size !== PALETTE.length) clashes.push("A colour is listed twice");
      if (clashes.length) throw new Error(clashes.join(" | "));
    });
  });

  test("The first graphs drawn keep clear of the axes", () => {
    appCall(() => {
      board.setDimension("2d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      const picked = [];
      for (const expr of ["x", "x+1", "x+2"]) picked.push(board.addFunction(expr).color);
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      const axes = Object.values(AXIS_COLORS);
      const taken = picked.filter((colour) => axes.includes(colour));
      if (taken.length) throw new Error(taken.join(","));
    });
  });

  test("A 3D surface keeps the one colour it was given", () => {
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      const fn = board.addFunction("x^2+y^2");
      board.setLight({ on: true });
      board.resize();
      board.draw();
      const base = hexToRgb(fn.color);
      const shades = [];
      for (const surface of board.scene.surfaces) {
        for (const colour of surface.colors) if (colour) shades.push(colour);
        for (const edge of surface.edges) shades.push(edge.color);
      }
      if (shades.length < 50) throw new Error(`${shades.length} shaded cells`);
      // Every cell is the base colour at some brightness: the ratios hold.
      const off = [];
      for (const shade of shades) {
        const parts = shade.match(/\d+/g).map(Number);
        const scale = parts[0] / (base[0] || 1);
        if (!(scale > 0.4 && scale <= 1.01)) {
          off.push(`${shade} is ${scale.toFixed(2)} of the base`);
          continue;
        }
        for (const channel of [1, 2]) {
          if (Math.abs(parts[channel] - base[channel] * scale) > 2.5) off.push(`${shade} drifts from ${fn.color}`);
        }
      }
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
      if (off.length) throw new Error(off.slice(0, 3).join(" | "));
    });
  });

  test("The cut at the height limit is shaded like the surface around it", () => {
    appCall(() => {
      board.setDimension("3d");
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("x^2+y^2");
      board.setView({ xMin: -3, xMax: 3, yMin: -3, yMax: 3, zMin: -1, zMax: 5 });
      board.setLight({ on: true });
      board.resize();
      board.draw();
      const surface = board.scene.surfaces[0];
      if (!surface.edges.length) throw new Error("Nothing was cut at the limit");
      const brightness = (colour) => {
        const parts = colour.match(/\d+/g).map(Number);
        return (parts[0] + parts[1] + parts[2]) / 3;
      };
      const rim = surface.edges.map((edge) => brightness(edge.color));
      const body = surface.colors.filter(Boolean).map(brightness);
      const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
      const gap = Math.abs(mean(rim) - mean(body));
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
      board.resetView();
      // A flat lid on the cut cells used to leave a row of bright teeth.
      if (gap > 18) throw new Error(`The cut is ${gap.toFixed(1)} brighter than the surface`);
    });
  });

  test("Each 3D axis spans the range that is drawn", () => {
    appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -4, xMax: 4, yMin: -4, yMax: 4, zMin: -2, zMax: 6 });
      const trouble = [];
      if (Math.abs(board.zToLocal(board.view.zMax) - board.zToLocalFree(board.view.zMax)) > 1e-9) {
        trouble.push("The height limit is clamped away");
      }
      // The height has its own scale: the ground is eight across and the box
      // is eight tall, so reading one off the other would be a coincidence.
      if (Math.abs(board.heightScale() - 4) > 1e-9) trouble.push(`The height scale is ${board.heightScale()}`);
      if (Math.abs(board.zToLocalFree(12) - (12 - 2) / board.heightScale()) > 1e-9) trouble.push("The free mapping is wrong");
      if (board.zToLocal(12) !== board.zToLocal(6)) trouble.push("The drawn mapping does not stop at the limit");
      board.setView({ zMin: -2, zMax: 38 });
      if (Math.abs(board.zToLocal(38) - 1) > 1e-9) trouble.push("A taller range does not fill the box");
      if (Math.abs(board.heightScale() - 20) > 1e-9) trouble.push("The height scale ignored the taller range");
      board.setDimension("2d");
      board.resetView();
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });

  test("The axis letters are X, Y and Z and stay out of the numbers", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      loaded.frame.style.width = "1100px";
      loaded.frame.style.height = "700px";
      flush(loaded.win);
      const spots = callWin(loaded.win, () => {
        board.setDimension("3d");
        board.resize();
        board.showAxisValues = true;
        const drawn = [];
        const ctx = board.canvas.getContext("2d");
        const text = ctx.fillText.bind(ctx);
        ctx.fillText = (value, x, y) => {
          drawn.push({ value: String(value), x, y });
          return text(value, x, y);
        };
        board.draw();
        ctx.fillText = text;
        return drawn;
      });
      const letters = spots.filter((spot) => ["X", "Y", "Z"].includes(spot.value));
      assert(letters.length === 3, `${letters.length} letters: ${spots.map((s) => s.value).join(",")}`);
      const numbers = spots.filter((spot) => !["X", "Y", "Z"].includes(spot.value));
      assert(numbers.length > 3, `${numbers.length} tick numbers`);
      for (const letter of letters) {
        const near = numbers.filter((spot) => Math.hypot(spot.x - letter.x, spot.y - letter.y) < 18);
        assert(!near.length, `${letter.value} shares its spot with ${near.map((s) => s.value).join(",")}`);
      }
      assert(!spots.some((spot) => ["x", "y", "z"].includes(spot.value)), "A lower case axis letter is still drawn");
    } finally {
      loaded.frame.remove();
    }
  });
});

suite("Converter keypads", () => {
  const padLook = (win) => [...win.document.querySelectorAll("#keys .key")].map((key) => ({
    label: key.textContent,
    className: key.className.replace("key ", "").trim(),
    span: key.style.gridColumn ? Number(key.style.gridColumn.replace("span ", "")) : 1,
  }));

  test("Both converter pads wear the calculator colours and fill every cell", async () => {
    const loaded = await loadApp("");
    try {
      loaded.win.fetch = () => Promise.reject(new Error("offline"));
      for (const mode of ["currency", "unit"]) {
        callWin(loaded.win, new Function(`setMode(${JSON.stringify(mode)}); return 1;`));
        await wait(60);
        const keys = padLook(loaded.win);
        const cells = keys.reduce((sum, key) => sum + key.span, 0);
        assert(cells % 4 === 0, `${mode}: ${cells} cells in 4 columns`);
        assert(cells === 20, `${mode}: ${cells} cells, so a slot is empty`);
        const swap = keys.find((key) => key.label === "⇅");
        assert(swap && swap.className === "op", `${mode}: the swap key is ${swap ? swap.className : "missing"}`);
        const copy = keys.find((key) => key.className === "eq");
        assert(copy, `${mode}: no key carries the accent colour`);
        assert(copy.label.length > 0, `${mode}: the accent key has no label`);
        const utils = keys.filter((key) => key.className === "util").map((key) => key.label);
        assert(utils.includes("AC") && utils.includes("⌫"), `${mode}: ${utils.join(",")}`);
      }
    } finally {
      loaded.frame.remove();
    }
  });

  test("The copy key hands over the converted value", async () => {
    const loaded = await loadApp("");
    try {
      loaded.win.fetch = () => Promise.reject(new Error("offline"));
      const taken = [];
      callWin(loaded.win, () => {
        window.__copied = [];
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: (text) => { window.__copied.push(text); return Promise.resolve(); } },
        });
        setMode("unit");
        setUnitGroup("length");
        state.unit.from = "m";
        state.unit.to = "cm";
        setUnitAmount("3");
        renderUnitOptions();
        renderUnit();
        return 1;
      });
      await wait(60);
      const doc = loaded.win.document;
      const copy = [...doc.querySelectorAll("#keys .key")].find((key) => key.className.includes("eq"));
      assert(copy, "The copy key is missing");
      copy.click();
      await wait(40);
      taken.push(...callWin(loaded.win, () => window.__copied.slice()));
      assert(taken[0] === "300", taken.join(",") || "nothing was copied");
      callWin(loaded.win, () => {
        setMode("currency");
        state.currency.amount = "1";
        renderCurrency();
        return 1;
      });
      await wait(60);
      const rateCopy = [...doc.querySelectorAll("#keys .key")].find((key) => key.className.includes("eq"));
      rateCopy.click();
      await wait(40);
      const all = callWin(loaded.win, () => window.__copied.slice());
      assert(all.length === 2 && all[1] === doc.getElementById("rateResult").textContent, all.join(" | "));
    } finally {
      loaded.frame.remove();
    }
  });
});

suite("Graph window size", () => {
  test("At its smallest the toolbar still fits on one line", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const least = callWin(loaded.win, () => [GRAPH_MIN_WIDTH, GRAPH_MIN_HEIGHT]);
      assert(least[0] >= 700 && least[1] >= 400, least.join("x"));
      loaded.frame.style.width = `${least[0]}px`;
      loaded.frame.style.height = `${least[1]}px`;
      flush(loaded.win);
      const doc = loaded.win.document;
      for (const dimension of ["dim2d", "dim3d"]) {
        doc.getElementById(dimension).click();
        flush(loaded.win);
        const row = doc.querySelector(".graph-tool-row");
        const shown = [...row.children].filter((node) => node.getBoundingClientRect().width > 0);
        // One line means the row is no taller than its tallest control.
        const tallest = Math.max(...shown.map((node) => node.getBoundingClientRect().height));
        const rowHeight = row.getBoundingClientRect().height;
        assert(rowHeight <= tallest + 1, `${dimension}: the toolbar is ${Math.round(rowHeight)} tall for a ${Math.round(tallest)} control, so it folded`);
        const box = row.getBoundingClientRect();
        for (const node of shown) {
          const child = node.getBoundingClientRect();
          assert(child.left >= box.left - 1 && child.right <= box.right + 1, `${dimension}: ${node.id || node.className} is cut off`);
        }
        assert(doc.querySelector(".canvas-wrap").getBoundingClientRect().height > 80, `${dimension}: the plot has no room`);
      }
      doc.getElementById("dim2d").click();
    } finally {
      loaded.frame.remove();
    }
  });
});

suite("Sums with sigma", () => {

  test("A sum adds up what it counts", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const wrong = [];
      const same = (expr, want) => {
        const got = engine.evaluate(expr, {});
        if (Math.abs(got - want) > 1e-9) wrong.push(`${expr} gave ${got}, not ${want}`);
      };
      same("sum(k, 1, 10, k)", 55);
      same("sum(k, 1, 5, k^2)", 55);
      same("sum(n, 0, 4, 2^n)", 31);
      same("sum(k, 1, 3, k) + 1", 7);
      same("2*sum(k, 1, 3, k)", 12);
      same("sum(k, 1, 4, 1)", 4);
      // Counting down is the empty sum.
      same("sum(k, 3, 1, k)", 0);
      same("sum(i, 1, 3, sum(j, 1, 3, i*j))", 36);
      if (wrong.length) throw new Error(wrong.join(" | "));
    });
  });

  test("The sigma sign is the same as writing sum", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const wrong = [];
      for (const sign of ["\u03a3", "\u2211", "\u03c3"]) {
        const got = engine.evaluate(`${sign}(k, 1, 10, k)`, {});
        if (Math.abs(got - 55) > 1e-9) wrong.push(`${sign} gave ${got}`);
      }
      if (wrong.length) throw new Error(wrong.join(" | "));
    });
  });

  test("A sum carries the variables around it, and lends out none of its own", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const trouble = [];
      const scope = { x: 2 };
      if (Math.abs(engine.evaluate("sum(k, 1, 3, k*x)", scope) - 12) > 1e-9) trouble.push("the outer x did not reach the body");
      if (Object.prototype.hasOwnProperty.call(scope, "k")) trouble.push("the counter was left in the scope outside");
      // The counter belongs to its own brackets and nowhere else.
      let leaked = false;
      try {
        engine.evaluate("sum(k, 1, 3, k) + k", scope);
        leaked = true;
      } catch {
        /* Reading the counter outside is the error we want. */
      }
      if (leaked) trouble.push("the counter could be read outside the sum");
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });

  test("A sum that cannot be counted is refused", () => {
    appCall(() => {
      const engine = new CalcEngine();
      engine.angleMode = "rad";
      const took = [];
      for (const expr of [
        "sum(k, 1.5, 3, k)",
        "sum(k, 1, 1e9, k)",
        "sum(1, 1, 3, 1)",
        "sum(pi, 1, 3, pi)",
        "sum(k, 1, 3)",
        "sum(k, 1, 3, k, k)",
      ]) {
        try {
          engine.evaluate(expr, {});
          took.push(expr);
        } catch (error) {
          if (!error.message) took.push(`${expr} failed without a reason`);
        }
      }
      if (took.length) throw new Error(`taken anyway: ${took.join(", ")}`);
    });
  });

  test("A sum can be drawn in 2D and in 3D", () => {
    appCall(() => {
      const trouble = [];
      board.setDimension("2d");
      board.resetView();
      board.addFunction("\u03a3(k, 1, 4, sin(k*x)/k)");
      const flat = board.functions[board.functions.length - 1];
      for (const x of [-3, -0.5, 0, 1.25, 4]) {
        const value = board.evalScope(flat.ast, { x });
        if (!Number.isFinite(value)) trouble.push(`2D gave ${value} at x = ${x}`);
      }
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("3d");
      board.addFunction("sum(k, 1, 3, sin(k*x)*cos(k*y)/k)");
      const solid = board.functions[board.functions.length - 1];
      for (const [x, y] of [[-2, 1], [0, 0], [3, -4]]) {
        const value = board.evalScope(solid.ast, { x, y });
        if (!Number.isFinite(value)) trouble.push(`3D gave ${value} at ${x}, ${y}`);
      }
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
      board.resetView();
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });
});

suite("The 3D box", () => {
  test("The box stays a cube however tall the range is", () => {
    appCall(() => {
      board.setDimension("3d");
      const trouble = [];
      for (const [zMin, zMax] of [[-10, 10], [-20, 200], [0, 1], [-5000, -4000]]) {
        board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin, zMax });
        const top = board.zToLocal(zMax);
        const foot = board.zToLocal(zMin);
        if (Math.abs(top - 1) > 1e-9 || Math.abs(foot + 1) > 1e-9) {
          trouble.push(`z ${zMin}..${zMax} draws ${foot.toFixed(3)}..${top.toFixed(3)}`);
        }
        // The ground is the same two units across, so the box is a cube.
        const wide = board.worldToFloorX(board.view.xMax) - board.worldToFloorX(board.view.xMin);
        if (Math.abs(wide - 2) > 1e-9) trouble.push(`the ground is ${wide.toFixed(3)} across`);
        if (Math.abs(board.heightStep() * 5 - (zMax - zMin)) > 1e-9) trouble.push("the height step does not divide the range");
      }
      board.setDimension("2d");
      board.resetView();
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });

  test("The height ticks are counted off the height, not the ground", () => {
    const drawn = appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -100, zMax: 100 });
      const ctx = board.canvas.getContext("2d");
      const text = ctx.fillText.bind(ctx);
      const labels = [];
      ctx.fillText = (value, x, y) => {
        labels.push(String(value));
        return text(value, x, y);
      };
      board.draw();
      ctx.fillText = text;
      board.setDimension("2d");
      board.resetView();
      return labels;
    });
    const numbers = drawn.map(Number).filter((value) => Number.isFinite(value));
    const tall = numbers.filter((value) => Math.abs(value) > 20);
    // With z at a hundred and the ground at ten, the height has its own step.
    assert(tall.length >= 2, `height ticks: ${drawn.join(",")}`);
    assert(drawn.length < 40, `${drawn.length} tick labels is a crowd`);
  });

  test("An axis runs further than the face of the box", () => {
    appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      const reach = board.axisSpan();
      const trouble = [];
      // The box is two units across; an axis has to leave it to read as an axis.
      if (!(reach.x > 1.05)) trouble.push(`x stops at ${reach.x}`);
      if (!(reach.y > 1.05)) trouble.push(`y stops at ${reach.y}`);
      if (!(reach.z > 1.05)) trouble.push(`z stops at ${reach.z}`);
      // And it must not run away from the drawing either.
      if (reach.x > 1.6 || reach.y > 1.6 || reach.z > 1.6) trouble.push("an axis runs away from the box");
      board.setView({ xMin: -50, xMax: 50, yMin: -50, yMax: 50, zMin: -50, zMax: 50 });
      const wider = board.axisSpan();
      // The reach is measured in the units of the box, so a wider range does
      // not make the axis shoot off the canvas.
      if (Math.abs(wider.x - reach.x) > 1e-9) trouble.push("the reach changed with the numbers on the axis");
      board.setDimension("2d");
      board.resetView();
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });
});

suite("Axis ranges and the lamp", () => {
  test("Typing a range draws that range", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      doc.getElementById("dim3d").click();
      flush(loaded.win);
      const typed = callWin(loaded.win, () => {
        const put = (id, value) => {
          const input = document.getElementById(id);
          input.focus();
          input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.blur();
        };
        put("axisMinX", -3);
        put("axisMaxX", 7);
        put("axisMinZ", -40);
        put("axisMaxZ", 60);
        const ground = board.meshDomain();
        return {
          view: { ...board.view },
          ground,
          fields: ["axisMinX", "axisMaxX", "axisMinZ", "axisMaxZ"].map((id) => document.getElementById(id).value),
        };
      });
      assert(typed.view.xMin === -3 && typed.view.xMax === 7, `x is ${typed.view.xMin}..${typed.view.xMax}`);
      assert(typed.view.zMin === -40 && typed.view.zMax === 60, `z is ${typed.view.zMin}..${typed.view.zMax}`);
      // What is drawn is what was asked for, with nothing beyond it.
      assert(typed.ground.x0 === -3 && typed.ground.x1 === 7, `the ground is ${typed.ground.x0}..${typed.ground.x1}`);
      assert(typed.fields.join(",") === "-3,7,-40,60", `the boxes read ${typed.fields.join(",")}`);
    } finally {
      loaded.frame.remove();
    }
  });

  test("A range that cannot be drawn is refused and put back", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      doc.getElementById("dim3d").click();
      flush(loaded.win);
      const after = callWin(loaded.win, () => {
        const input = document.getElementById("axisMaxX");
        const before = { ...board.view };
        input.focus();
        input.value = "-50";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        const marked = input.classList.contains("is-wrong");
        input.blur();
        const blank = document.getElementById("axisMinY");
        blank.focus();
        blank.value = "";
        blank.dispatchEvent(new Event("change", { bubbles: true }));
        blank.blur();
        return { before, view: { ...board.view }, marked, box: input.value, yBox: blank.value };
      });
      assert(after.marked, "the box was never marked wrong");
      assert(after.view.xMax === after.before.xMax, `the range moved to ${after.view.xMax}`);
      assert(after.box === String(after.before.xMax), `the box kept ${after.box}`);
      assert(after.yBox === String(after.before.yMin), `the empty box kept ${after.yBox}`);
    } finally {
      loaded.frame.remove();
    }
  });

  test("The height and the lamp belong to 3D only", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      // A window can open onto the state another one left behind, so the
      // dimension under test is the one asked for here, not the one restored.
      doc.getElementById("dim2d").click();
      flush(loaded.win);
      const hiddenIn2d = {
        z: doc.querySelector('.axis-span[data-axis="z"]').hidden,
        lamp: doc.getElementById("lightSpan").hidden,
        rule: doc.getElementById("lightSep").hidden,
      };
      doc.getElementById("dim3d").click();
      flush(loaded.win);
      const shownIn3d = {
        z: doc.querySelector('.axis-span[data-axis="z"]').hidden,
        lamp: doc.getElementById("lightSpan").hidden,
        rule: doc.getElementById("lightSep").hidden,
      };
      assert(hiddenIn2d.z && hiddenIn2d.lamp && hiddenIn2d.rule, "the height or the lamp showed in 2D");
      assert(!shownIn3d.z && !shownIn3d.lamp && !shownIn3d.rule, "the height or the lamp stayed away in 3D");
      // The groups are kept apart by a rule, and the lamp sits last.
      const row = doc.getElementById("axisRow");
      const order = [...row.children].map((node) => node.className.split(" ")[0]);
      assert(order.filter((name) => name === "axis-sep").length === 2, `rules: ${order.join(",")}`);
      assert(order[order.length - 1] === "axis-span", `the row ends with ${order[order.length - 1]}`);
      assert(row.lastElementChild.id === "lightSpan", "the lamp is not the last group");
    } finally {
      loaded.frame.remove();
    }
  });

  test("The lamp can be placed by its x, y and z", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      doc.getElementById("dim3d").click();
      flush(loaded.win);
      const moved = callWin(loaded.win, () => {
        board.setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
        const put = (id, value) => {
          const input = document.getElementById(id);
          input.focus();
          input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.blur();
        };
        put("lightAtX", 6);
        put("lightAtY", -4);
        put("lightAtZ", 8);
        return {
          place: board.lightPlace(),
          boxes: ["lightAtX", "lightAtY", "lightAtZ"].map((id) => Number(document.getElementById(id).value)),
          light: { ...board.light },
        };
      });
      // The lamp is kept as a turn and a rise, so the place comes back in the
      // same direction even if the distance was pulled into its limits.
      const asked = { x: 6, y: -4, z: 8 };
      const size = Math.hypot(moved.place.x, moved.place.y, moved.place.z) || 1;
      const want = Math.hypot(asked.x, asked.y, asked.z) || 1;
      const dot = (moved.place.x * asked.x + moved.place.y * asked.y + moved.place.z * asked.z) / (size * want);
      assert(dot > 0.999, `the lamp points elsewhere (${dot.toFixed(4)})`);
      assert(moved.boxes.every((value) => Number.isFinite(value)), `the boxes read ${moved.boxes.join(",")}`);
      assert(Number.isFinite(moved.light.azimuth) && Number.isFinite(moved.light.elevation), "the lamp lost its direction");
    } finally {
      loaded.frame.remove();
    }
  });

  test("Reset puts the range, the angle and the lamp back", () => {
    appCall(() => {
      board.setDimension("3d");
      board.setView({ xMin: -3, xMax: 9, yMin: -2, yMax: 4, zMin: -40, zMax: 90 });
      board.camera.yaw += 1.1;
      board.setLightPlace({ x: -9, y: 9, z: 2 });
      board.setFloorZ(3);
      board.resetView();
      const trouble = [];
      const view = board.view;
      if (view.xMin !== -10 || view.xMax !== 10 || view.zMin !== -10 || view.zMax !== 10) trouble.push("the range stayed where it was");
      if (Math.abs(board.camera.yaw + 0.75) > 1e-9) trouble.push("the angle stayed where it was");
      if (Math.abs(board.light.azimuth + 0.95) > 1e-9 || Math.abs(board.light.elevation - 0.9) > 1e-9) {
        trouble.push("the lamp stayed where it was");
      }
      if (board.floorZ !== null) trouble.push("the floor stayed where it was");
      board.setDimension("2d");
      board.resetView();
      if (trouble.length) throw new Error(trouble.join(" | "));
    });
  });
});

suite("Graph help", () => {
  test("The help window lists every part, in both languages", async () => {
    const loaded = await loadApp("pop=help");
    try {
      const doc = loaded.win.document;
      flush(loaded.win);
      assert(!doc.getElementById("helpSheet").hidden, "the help did not open");
      const read = () => callWin(loaded.win, () => {
        const doc2 = document.getElementById("helpDoc");
        return {
          titles: [...doc2.querySelectorAll("h3")].map((node) => node.textContent),
          typed: [...doc2.querySelectorAll(".help-rows dt")].map((node) => node.textContent),
          notes: [...doc2.querySelectorAll(".help-note")].map((node) => node.textContent),
        };
      });
      const ko = read();
      assert(ko.titles.length >= 5, `${ko.titles.length} parts in Korean`);
      assert(ko.typed.length >= 25, `${ko.typed.length} rows in Korean`);
      callWin(loaded.win, () => applyLanguage("en"));
      flush(loaded.win);
      const en = read();
      assert(en.titles.length === ko.titles.length, `${en.titles.length} parts in English against ${ko.titles.length}`);
      assert(en.typed.length === ko.typed.length, `${en.typed.length} rows in English against ${ko.typed.length}`);
      assert(!en.titles.some((title, at) => title === ko.titles[at]), "a part was never translated");
      callWin(loaded.win, () => applyLanguage("ko"));
    } finally {
      loaded.frame.remove();
    }
  });

  test("The help says how to write a sum and the signs around it", async () => {
    const loaded = await loadApp("pop=help");
    try {
      flush(loaded.win);
      const text = callWin(loaded.win, () => document.getElementById("helpDoc").textContent);
      const missing = [];
      for (const needle of ["\u03a3(", "sum(", "^", "pi", "sin", "fact(", "ans"]) {
        if (!text.includes(needle)) missing.push(needle);
      }
      assert(!missing.length, `the help never mentions ${missing.join(", ")}`);
      // Every sum in the help has to be a sum the engine would take.
      const written = [...text.matchAll(/[\u03a3]\([^)]*\)[^\s]*/g)].map((hit) => hit[0]);
      assert(written.length >= 3, `${written.length} worked examples of a sum`);
    } finally {
      loaded.frame.remove();
    }
  });

  test("The graph window has a button that opens the help", async () => {
    const loaded = await loadApp("pop=graph&desktop=1");
    try {
      const doc = loaded.win.document;
      flush(loaded.win);
      const button = doc.getElementById("helpGraph");
      assert(button, "there is no help button");
      assert(!button.hidden, "the help button is hidden");
      const opened = callWin(loaded.win, () => {
        let asked = "";
        const real = window.open;
        window.open = (url) => {
          asked = String(url);
          return null;
        };
        document.getElementById("helpGraph").click();
        window.open = real;
        return asked;
      });
      assert(opened.includes("pop=help"), `the button asked for ${opened || "nothing"}`);
    } finally {
      loaded.frame.remove();
    }
  });
});

suite("Fitting the window to the values", () => {
  const draws = (expr) => appCall((text) => {
    board.setDimension("2d");
    board.resetView();
    while (board.functions.length) board.removeFunction(board.functions[0].id);
    const before = { ...board.view };
    board.addFunction(text);
    const fn = board.functions[board.functions.length - 1];
    const span = board.view.xMax - board.view.xMin;
    let inside = 0;
    let total = 0;
    for (let step = 0; step <= 200; step++) {
      const x = board.view.xMin + (span * step) / 200;
      const y = board.evalScope(fn.ast, { x });
      if (!Number.isFinite(y)) continue;
      total += 1;
      if (y >= board.view.yMin && y <= board.view.yMax) inside += 1;
    }
    const after = { ...board.view };
    const stretched = board.stretched;
    while (board.functions.length) board.removeFunction(board.functions[0].id);
    board.resetView();
    return { before, after, inside, total, stretched };
  }, expr);

  test("A curve drawn clear off the window brings the window to it", () => {
    // Every value of this one is at least 9.6, climbing to eleven thousand
    // million, so the ten by ten window it lands in shows next to nothing.
    const fit = draws("sum(k, 1, 10, x^k+1)");
    assert(fit.after.yMax !== fit.before.yMax, "the window never moved");
    assert(fit.inside / fit.total > 0.9, `only ${fit.inside} of ${fit.total} points are in view`);
    assert(fit.after.xMin === fit.before.xMin && fit.after.xMax === fit.before.xMax, "the range of x was changed as well");
    assert(fit.stretched === true, "the window was left to be squared back out of shape");
  });

  test("A curve that already reads well is left where it is", () => {
    for (const expr of ["sin(x)", "x^2", "1/x", "tan(x)", "x^3/50"]) {
      const fit = draws(expr);
      assert(fit.after.yMin === fit.before.yMin && fit.after.yMax === fit.before.yMax, `${expr} moved the window to ${fit.after.yMin}..${fit.after.yMax}`);
      assert(fit.stretched === false, `${expr} gave up the square units for nothing`);
    }
  });

  test("A flat line far above the window is framed around itself", () => {
    const fit = draws("sum(k, 1, 10, k)");
    assert(fit.inside === fit.total, `${fit.inside} of ${fit.total} points are in view`);
    // Framed around the value, not stretched from zero up to it.
    assert(fit.after.yMin > 0, `the window starts at ${fit.after.yMin}`);
    assert(fit.after.yMax - fit.after.yMin < 55, `the window is ${fit.after.yMax - fit.after.yMin} tall for a flat line`);
  });

  test("A pole does not drag the window out to its spike", () => {
    const bounds = appCall(() => {
      // One value runs away; the rest sit between nought and ten.
      const ordinary = [];
      for (let step = 0; step <= 400; step++) ordinary.push((step % 11) - 1);
      const spiked = [...ordinary, 1e15, -1e15, 4e14];
      return { plain: board.fitBounds(ordinary), spiked: board.fitBounds(spiked) };
    });
    assert(bounds.spiked, "nothing came back for the spiked values");
    assert(bounds.spiked.high < 100, `the window reaches ${bounds.spiked.high}`);
    assert(bounds.spiked.low > -100, `the window reaches ${bounds.spiked.low}`);
    assert(bounds.plain.low <= -1 && bounds.plain.high >= 9, `the plain values gave ${bounds.plain.low}..${bounds.plain.high}`);
  });

  test("A 3D surface above the ceiling raises the ceiling", () => {
    const fit = appCall(() => {
      board.setDimension("3d");
      board.resetView();
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      const before = { zMin: board.view.zMin, zMax: board.view.zMax };
      board.addFunction("x^2+y^2");
      const after = { zMin: board.view.zMin, zMax: board.view.zMax };
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.setDimension("2d");
      board.resetView();
      return { before, after };
    });
    // The bowl climbs to two hundred over a ten by ten floor.
    assert(fit.after.zMax >= 200, `the ceiling stopped at ${fit.after.zMax}`);
    assert(fit.after.zMax > fit.before.zMax, "the ceiling never moved");
  });

  test("A range set by hand, or reset, takes the square units back", () => {
    const state = appCall(() => {
      board.setDimension("2d");
      board.resetView();
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.addFunction("sum(k, 1, 10, x^k+1)");
      const fitted = board.stretched;
      board.setView({ yMin: -5, yMax: 5 });
      const typed = board.stretched;
      board.addFunction("sum(k, 1, 10, x^k+1)");
      const refitted = board.stretched;
      board.resetView();
      const reset = board.stretched;
      while (board.functions.length) board.removeFunction(board.functions[0].id);
      board.resetView();
      return { fitted, typed, refitted, reset };
    });
    assert(state.fitted === true, "the window was never framed around the values");
    assert(state.typed === false, "a range set by hand did not take the square units back");
    assert(state.refitted === true, "the window was not framed again for the new curve");
    assert(state.reset === false, "reset left the window out of shape");
  });
});
