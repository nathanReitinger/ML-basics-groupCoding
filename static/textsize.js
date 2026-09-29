/* ------------------------------------------------------------------
   Text size. One control drives the instructions, the editor and both
   output panes together, so "make it bigger" means all of it.
   ------------------------------------------------------------------ */

window.TextSize = function (opts) {
  // room to go well below 100% as well as above it
  var STEPS = [0.62, 0.70, 0.78, 0.85, 0.92, 1, 1.12, 1.28, 1.5, 1.8, 2.2];
  var KEY = "lab.textsize";
  var index = opts.start;

  try {
    var saved = localStorage.getItem(KEY);
    if (saved !== null && STEPS[Number(saved)]) index = Number(saved);
  } catch (ignored) { /* private browsing, never mind */ }

  function apply() {
    document.documentElement.style.setProperty("--scale", STEPS[index]);
    var pct = Math.round(STEPS[index] * 100);
    if (opts.readout) opts.readout.textContent = pct + "%";
    if (opts.smaller) opts.smaller.disabled = index === 0;
    if (opts.bigger) opts.bigger.disabled = index === STEPS.length - 1;
    try { localStorage.setItem(KEY, String(index)); } catch (ignored) {}
    if (opts.onChange) opts.onChange();
  }

  function nudge(by) {
    index = Math.max(0, Math.min(STEPS.length - 1, index + by));
    apply();
  }

  if (opts.smaller) opts.smaller.addEventListener("click", function () { nudge(-1); });
  if (opts.bigger) opts.bigger.addEventListener("click", function () { nudge(1); });

  // Ctrl/Cmd +/- the way every other app does it
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); nudge(1); }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); nudge(-1); }
    if (e.key === "0") { e.preventDefault(); index = opts.start; apply(); }
  });

  apply();
  return { nudge: nudge };
};
