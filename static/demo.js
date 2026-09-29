/* ------------------------------------------------------------------
   Instructor demo view.

   Same run engine the students use, pointed at one group's code. Edits
   here stay local unless the instructor deliberately pushes them back,
   so poking at a group's code on the projector never overwrites their work.
   ------------------------------------------------------------------ */

(function () {
  "use strict";

  var cfg = window.DEMO || {};
  var pullBtn = document.getElementById("pull");
  var pushBtn = document.getElementById("push");
  var jump = document.getElementById("jump");
  var staleEl = document.getElementById("stale");
  var editedEl = document.getElementById("edited");

  var loadedCode = document.getElementById("code").value;
  var loadedStamp = cfg.updatedAt;

  var runner = Runner.create({
    textarea: document.getElementById("code"),
    terminal: document.getElementById("terminal"),
    runButton: document.getElementById("run"),
    clearButton: document.getElementById("clear"),
    statusEl: document.getElementById("status"),
    readyMessage: "Press Run to show the class what this does.",
    onReady: function () { shell.greet(); }
  });

  // the projector wants bigger type than a laptop does
  var shell = Workspace(runner, { textStart: 7 });

  /* ---------------------------------------------------------------
     local edits vs. the group's saved copy
     --------------------------------------------------------------- */

  function dirty() {
    return runner.editor.getValue() !== loadedCode;
  }

  function refreshEdited() {
    editedEl.textContent = dirty() ? "your changes are not saved to the group" : "";
  }

  runner.editor.on("change", refreshEdited);

  async function pull(force) {
    if (!force && dirty()) {
      var ok = window.confirm(
        "You've changed this code here. Loading the group's latest version will " +
        "discard your changes. Continue?"
      );
      if (!ok) return;
    }
    try {
      var res = await fetch(cfg.groupUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      runner.setCode(data.code);
      loadedCode = data.code;
      loadedStamp = data.updated_at;
      staleEl.hidden = true;
      refreshEdited();
      runner.meta("Loaded the group's latest version, edited " + data.updated_human + ".");
    } catch (err) {
      runner.write("Could not reach the server to reload this group.\n", "err");
    }
  }

  /* A quiet copy of the group's shared document. Nothing is bound to the
     editor and no cursor is sent, so watching a group on the projector
     does not put a teacher's caret in their file. It exists only so that
     "send to group" lands in front of them straight away. */
  var shared = window.Collab && cfg.groupId ? window.Collab.create({
    editor: runner.editor,
    detached: true,
    url: "/api/doc/" + cfg.groupId + "/" + cfg.taskId
  }) : null;

  pullBtn.addEventListener("click", function () { pull(false); });

  pushBtn.addEventListener("click", async function () {
    var code = runner.editor.getValue();
    if (!window.confirm("Replace " + cfg.groupName + "'s saved code with what's on screen?")) return;
    pushBtn.disabled = true;
    try {
      var res = await fetch(cfg.groupUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      loadedCode = code;
      loadedStamp = data.saved_at;
      staleEl.hidden = true;
      refreshEdited();
      if (shared) {
        // put it straight into their editor, rather than waiting for a
        // reload that the shared document would have overwritten anyway
        shared.replaceAll(code);
        runner.meta("Sent to " + cfg.groupName + ". It is on their screen now.");
      } else {
        runner.meta("Saved to " + cfg.groupName + ". They'll see it when they reload.");
      }
    } catch (err) {
      runner.write("Could not save to the group.\n", "err");
    } finally {
      pushBtn.disabled = false;
    }
  });

  /* Watch for the group editing while it is up on the projector. */
  setInterval(async function () {
    if (document.hidden) return;
    try {
      var res = await fetch(cfg.groupUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      var data = await res.json();
      staleEl.hidden = data.updated_at === loadedStamp;
    } catch (ignored) { /* quietly keep the current copy */ }
  }, 5000);

  staleEl.addEventListener("click", function () { pull(false); });

  /* ---------------------------------------------------------------
     moving between groups
     --------------------------------------------------------------- */

  if (jump) {
    jump.addEventListener("change", function () {
      window.location.href = jump.value;
    });
  }

  /* Plain left/right step between groups whenever you aren't typing, which
     is most of the time while presenting. Alt+left/right works even with the
     cursor in the editor, for when you've been mid-edit. */
  function typing() {
    var el = document.activeElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
           el.tagName === "SELECT";
  }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey) return;
    if (!e.altKey && typing()) return;
    if (e.key === "ArrowLeft" && cfg.prevUrl) {
      e.preventDefault();
      window.location.href = cfg.prevUrl;
    }
    if (e.key === "ArrowRight" && cfg.nextUrl) {
      e.preventDefault();
      window.location.href = cfg.nextUrl;
    }
  });

  refreshEdited();
  runner.boot();
})();
