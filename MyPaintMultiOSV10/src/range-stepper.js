/* The value stepper with a bar: [-] [bar] [n %] [+]. Used on the start screen and in Settings >
 * Start screen, so it also has to work inside a dialog that lives in its own window: everything
 * is delegated from one root, and a new value reaches the rest of the program as a bubbling
 * "change" on the number input, which carries data-field like any other dialog field. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintRange = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MINUS = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 6h7"/></svg>';
  const PLUS = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7"/></svg>';

  const percent = (value, min, max) => Math.max(0, Math.min(1, (value - min) / ((max - min) || 1))) * 100;

  /* options: field, label (already escaped), min, max, step, suffix, value */
  function html(o) {
    const at = percent(o.value, o.min, o.max);
    return '<span class="range-stepper" data-range="' + o.field + '" data-min="' + o.min + '" data-max="' + o.max + '" data-step="' + o.step + '" data-suffix="' + (o.suffix || "") + '">' +
      '<button type="button" class="range-step" data-range-step="-1" title="' + o.label + ' -" aria-label="' + o.label + ' -"' + (o.value <= o.min ? " disabled" : "") + ">" + MINUS + "</button>" +
      '<span class="range-bar" role="slider" tabindex="0" aria-label="' + o.label + '" aria-valuemin="' + o.min + '" aria-valuemax="' + o.max + '" aria-valuenow="' + o.value + '" aria-valuetext="' + o.value + (o.suffix || "") + '">' +
      '<span class="range-fill" style="width:' + at + '%"></span><span class="range-thumb" style="left:' + at + '%"></span></span>' +
      '<span class="range-value"><input type="number" data-field="' + o.field + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + o.value + '" aria-label="' + o.label + '">' +
      (o.suffix ? '<span class="range-suffix">' + o.suffix + "</span>" : "") + "</span>" +
      '<button type="button" class="range-step" data-range-step="1" title="' + o.label + ' +" aria-label="' + o.label + ' +"' + (o.value >= o.max ? " disabled" : "") + ">" + PLUS + "</button></span>";
  }

  function limits(control) {
    return {
      min: Number(control.dataset.min),
      max: Number(control.dataset.max),
      step: Number(control.dataset.step) || 1,
    };
  }

  function clampTo(control, value) {
    const lim = limits(control);
    return Math.max(lim.min, Math.min(lim.max, Math.round(value / lim.step) * lim.step));
  }

  /* Shows value without telling anyone. */
  function show(control, value) {
    const lim = limits(control);
    const at = percent(value, lim.min, lim.max) + "%";
    const input = control.querySelector("input");
    const bar = control.querySelector(".range-bar");
    if (input && input.ownerDocument.activeElement !== input) input.value = String(value);
    control.querySelector(".range-fill").style.width = at;
    control.querySelector(".range-thumb").style.left = at;
    bar.setAttribute("aria-valuenow", String(value));
    bar.setAttribute("aria-valuetext", value + (control.dataset.suffix || ""));
    control.querySelector('[data-range-step="-1"]').disabled = value <= lim.min;
    control.querySelector('[data-range-step="1"]').disabled = value >= lim.max;
  }

  function commit(control, value) {
    const next = clampTo(control, value);
    const input = control.querySelector("input");
    if (Number(input.value) === next && Number(control.querySelector(".range-bar").getAttribute("aria-valuenow")) === next) return;
    input.value = String(next);
    show(control, next);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const current = (control) => Number(control.querySelector("input").value) || 0;

  function bind(rootEl) {
    if (rootEl.dataset.rangeBound) return;
    rootEl.dataset.rangeBound = "1";
    rootEl.addEventListener("click", (event) => {
      const step = event.target.closest && event.target.closest("[data-range-step]");
      if (!step || step.disabled) return;
      const control = step.closest("[data-range]");
      commit(control, current(control) + Number(step.dataset.rangeStep) * limits(control).step);
    });
    rootEl.addEventListener("pointerdown", (event) => {
      const bar = event.target.closest && event.target.closest(".range-bar");
      if (!bar || event.button !== 0) return;
      event.preventDefault();
      bar.focus();
      const control = bar.closest("[data-range]");
      const lim = limits(control);
      const at = (clientX) => {
        const rect = bar.getBoundingClientRect();
        return rect.width ? lim.min + ((clientX - rect.left) / rect.width) * (lim.max - lim.min) : current(control);
      };
      commit(control, at(event.clientX));
      if (bar.setPointerCapture) bar.setPointerCapture(event.pointerId);
      const move = (ev) => commit(control, at(ev.clientX));
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    });
    rootEl.addEventListener("keydown", (event) => {
      const bar = event.target.closest && event.target.closest(".range-bar");
      if (!bar) return;
      const control = bar.closest("[data-range]");
      const lim = limits(control);
      const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[event.key];
      if (event.key === "Home") commit(control, lim.min);
      else if (event.key === "End") commit(control, lim.max);
      else if (delta) commit(control, current(control) + delta * lim.step);
      else return;
      event.preventDefault();
      event.stopPropagation();
    });
    // Typed values are made valid first, so whoever listens for this change reads a good one.
    rootEl.addEventListener("change", (event) => {
      const input = event.target;
      const control = input.closest && input.closest("[data-range]");
      if (!control || input.tagName !== "INPUT") return;
      const parsed = Number(input.value);
      const next = input.value.trim() !== "" && Number.isFinite(parsed)
        ? clampTo(control, parsed)
        : Number(control.querySelector(".range-bar").getAttribute("aria-valuenow"));
      input.value = String(next);
      show(control, next);
    }, true);
  }

  return { html: html, bind: bind, show: show };
});
