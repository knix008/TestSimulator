(function () {
  const report = document.getElementById("report");
  const summary = document.getElementById("summary");
  const rerun = document.getElementById("rerun");
  const started = performance.now();

  function clock() {
    document.getElementById("clock").textContent = ((performance.now() - started) / 1000).toFixed(1) + "s";
  }

  function waitApp() {
    const frame = document.getElementById("appFrame");
    return new Promise((resolve, reject) => {
      const begin = performance.now();
      const tick = () => {
        let app = null;
        try { app = frame.contentWindow; } catch (error) { app = null; }
        if (app && app.MyMerge && app.MyMerge.ready) {
          resolve(app);
          return;
        }
        if (performance.now() - begin > 20000) {
          reject(new Error("The application did not start."));
          return;
        }
        setTimeout(tick, 30);
      };
      tick();
    });
  }

  async function runAll() {
    rerun.disabled = true;
    report.innerHTML = "";
    summary.innerHTML = "";
    const app = await waitApp();
    let pass = 0;
    let fail = 0;
    let total = 0;
    const suiteRows = [];
    for (const suite of window.TEST_SUITES) {
      const block = document.createElement("article");
      block.className = "suite";
      const title = document.createElement("h3");
      title.textContent = suite.name;
      block.appendChild(title);
      report.appendChild(block);
      let suitePass = 0;
      let suiteFail = 0;
      let suiteMs = 0;
      for (const test of suite.tests) {
        total += 1;
        document.getElementById("countTotal").textContent = String(total);
        document.getElementById("progressLabel").textContent = suite.name + " · " + test.name;
        const row = document.createElement("div");
        row.className = "case run";
        row.innerHTML = '<span class="status">Running</span><span class="name"></span><span class="dur"></span><span class="error"></span>';
        row.querySelector(".name").textContent = test.name;
        block.appendChild(row);
        clock();
        await app.MyMerge.resetForTests();
        const t0 = performance.now();
        try {
          await test.fn(app.MyMerge, app.document, app);
          const ms = performance.now() - t0;
          suiteMs += ms;
          pass += 1;
          suitePass += 1;
          row.className = "case pass";
          row.querySelector(".status").textContent = "Passed";
          row.querySelector(".dur").textContent = ms.toFixed(0) + " ms";
        } catch (error) {
          const ms = performance.now() - t0;
          suiteMs += ms;
          fail += 1;
          suiteFail += 1;
          row.className = "case fail";
          row.querySelector(".status").textContent = "Failed";
          row.querySelector(".dur").textContent = ms.toFixed(0) + " ms";
          row.querySelector(".error").textContent = error && error.stack ? error.message : String(error);
        }
        document.getElementById("countPass").textContent = String(pass);
        document.getElementById("countFail").textContent = String(fail);
        document.getElementById("countTime").textContent = (performance.now() - started).toFixed(0) + " ms";
        clock();
      }
      suiteRows.push({ name: suite.name, pass: suitePass, fail: suiteFail, ms: suiteMs });
    }
    const table = document.createElement("table");
    table.innerHTML = "<tr><th>Suite</th><th>Passed</th><th>Failed</th><th>Duration</th></tr>" +
      suiteRows.map((row) => "<tr><td>" + row.name + "</td><td>" + row.pass + "</td><td>" + row.fail + "</td><td>" + row.ms.toFixed(0) + " ms</td></tr>").join("") +
      "<tr><td>Total</td><td>" + pass + "</td><td>" + fail + "</td><td>" + (performance.now() - started).toFixed(0) + " ms</td></tr>";
    summary.appendChild(table);
    document.getElementById("progressLabel").textContent = fail ? "Failed" : "Passed";
    rerun.disabled = false;
  }

  rerun.addEventListener("click", () => { runAll().catch((error) => { document.getElementById("progressLabel").textContent = error.message; rerun.disabled = false; }); });
  runAll().catch((error) => { document.getElementById("progressLabel").textContent = error.message; rerun.disabled = false; });
})();
