/* ------------------------------------------------------------------
   Student lab: the shared engine, plus autosave and the task starter.
   ------------------------------------------------------------------ */

(function () {
  "use strict";

  var cfg = window.LAB || {};
  var saveEl = document.getElementById("save-state");

  var lastSaved = document.getElementById("code").value;
  var saveTimer = null;

  function markState(text, state) {
    saveEl.textContent = text;
    saveEl.setAttribute("data-state", state);
  }

  async function save() {
    var code = runner.editor.getValue();
    if (code === lastSaved) {
      markState("saved", "saved");
      return;
    }
    try {
      var res = await fetch(cfg.saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, task_id: cfg.taskId })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      lastSaved = code;
      markState("saved", "saved");
    } catch (err) {
      markState("not saved, retrying", "unsaved");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 5000);
    }
  }

  var runner = Runner.create({
    textarea: document.getElementById("code"),
    terminal: document.getElementById("terminal"),
    runButton: document.getElementById("run"),
    clearButton: document.getElementById("clear"),
    statusEl: document.getElementById("status"),
    // Get the code onto the server before anything can hang the tab. The
    // request is already in flight even if the code below never yields.
    beforeRun: function () {
      clearTimeout(saveTimer);
      save();
    },
    afterRun: function () {
      runner.editor.focus();
    },
    // called from Python by celebrate()
    onSolved: function (message) {
      var card = document.getElementById("solved");
      if (!card) return;
      if (message) document.getElementById("solved-text").textContent = message;
      card.hidden = false;
    },
    onReady: function () {
      shell.greet();
    }
  });

  var shell = Workspace(runner);

  runner.editor.on("change", function () {
    markState("unsaved", "unsaved");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 900);
  });

  var starterBtn = document.getElementById("load-starter");
  if (starterBtn && cfg.starter) {
    starterBtn.addEventListener("click", function () {
      if (runner.editor.getValue().trim() &&
          !window.confirm("Replace what's in the editor with the task's starter code?")) {
        return;
      }
      runner.setCode(cfg.starter);
      runner.editor.focus();
    });
  }

  window.addEventListener("beforeunload", function () {
    var code = runner.editor.getValue();
    if (code === lastSaved) return;
    try {
      navigator.sendBeacon(
        cfg.saveUrl,
        new Blob([JSON.stringify({ code: code, task_id: cfg.taskId })],
                 { type: "application/json" })
      );
    } catch (ignored) { /* nothing more we can do on the way out */ }
  });

  // Switching assignments must not lose the last second of typing, so the
  // save goes out before the browser follows the link.
  document.querySelectorAll(".tab[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function (e) {
      if (runner.editor.getValue() === lastSaved) return;
      e.preventDefault();
      clearTimeout(saveTimer);
      save().finally(function () { window.location.href = tab.href; });
    });
  });

  // So the front page's rejoin dropdown opens on this group next time.
  try { localStorage.setItem("lab.group", cfg.group); } catch (ignored) {}

  var solvedClose = document.getElementById("solved-close");
  if (solvedClose) {
    solvedClose.addEventListener("click", function () {
      document.getElementById("solved").hidden = true;
    });
  }

  // a fresh run starts from a clean slate
  runner.editor.on("change", function () {
    var card = document.getElementById("solved");
    if (card) card.hidden = true;
  });

  // ---- live editing -------------------------------------------------
  var here = document.getElementById("here");

  function showPeople(state) {
    if (!here) return;
    var count = (state && state.here) || 1;
    if (count < 2) { here.hidden = true; return; }
    here.hidden = false;
    here.textContent = count + " of you editing this together";
  }

  function showStatus(state) {
    if (!here) return;
    here.classList.remove("here-live", "here-reconnecting", "here-offline");
    here.classList.add("here-" + state);
    // Silence was the old bug: when sync stopped working the page said
    // nothing, and the only clue was having to refresh to see anybody.
    if (state === "reconnecting") {
      here.hidden = false;
      here.textContent = "reconnecting\u2026";
    } else if (state === "offline") {
      here.hidden = false;
      here.textContent = "not syncing \u2014 reload the page";
    }
  }

  var collab = window.Collab && window.Collab.create({
    editor: runner.editor,
    url: "/api/doc/" + window.LAB.taskId,
    onPeople: showPeople,
    onStatus: showStatus
  });

  runner.editor.focus();
  runner.boot();
})();
