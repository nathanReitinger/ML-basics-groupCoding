/* ------------------------------------------------------------------
   The parts of a workspace page the student lab and the instructor demo
   set up identically: the three splits, the shell pane, the text size
   control, and the copy / select-all behaviour on the output panes.
   ------------------------------------------------------------------ */

window.Workspace = function (runner, options) {
  options = options || {};

  var below = document.getElementById("below");
  var workspace = document.getElementById("workspace");
  var stack = document.getElementById("stack");
  var terminal = document.getElementById("terminal");
  var shellOut = document.getElementById("shell-out");
  var shellInput = document.getElementById("shell-input");
  var shellToggle = document.getElementById("shell-toggle");
  var taskToggle = document.getElementById("task-toggle");
  var refresh = function () { runner.editor.refresh(); };

  /* ---- text size ------------------------------------------------- */

  TextSize({
    smaller: document.getElementById("text-smaller"),
    bigger: document.getElementById("text-bigger"),
    readout: document.getElementById("text-size"),
    start: options.textStart === undefined ? 2 : options.textStart,
    onChange: refresh
  });

  /* ---- keep the editor measured correctly ------------------------ */

  /* CodeMirror caches how tall it thinks it is. Anything that changes the
     pane - dragging, toggling, the text size, a font arriving late, the
     window resizing - has to tell it to look again. One observer covers
     every one of those instead of hoping each caller remembers. */
  var editorPane = document.querySelector(".pane-editor");
  if (editorPane && window.ResizeObserver) {
    var pending = false;
    new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        runner.editor.refresh();
      });
    }).observe(editorPane);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refresh);
  }

  /* ---- output panes ---------------------------------------------- */

  // Ctrl+A in an output pane selects that pane instead of the whole page.
  Runner.selectable(terminal);
  Runner.selectable(shellOut);
  Runner.copyPane(terminal, document.getElementById("copy-term"));
  Runner.copyPane(shellOut, document.getElementById("copy-shell"));

  /* ---- the three draggable dividers ------------------------------ */

  // instructions above, everything else below
  if (below && document.getElementById("task-grip")) {
    Runner.split(below, document.getElementById("task-grip"), runner.editor, "rows",
                 { min: 70, slack: 220, property: "--task-h", leading: true });
  }
  // editor above, output below
  Runner.split(stack, document.getElementById("grip"), runner.editor, "rows",
               { min: 110, slack: 150, property: "--term-h" });
  // workspace left, shell right
  Runner.split(workspace, document.getElementById("vgrip"), runner.editor, "columns",
               { min: 220, slack: 340, property: "--shell-w" });

  /* ---- the shell -------------------------------------------------- */

  var shell = Runner.shell(runner, {
    output: shellOut,
    input: shellInput,
    clear: document.getElementById("shell-clear")
  });

  function remember(key, value) {
    try { localStorage.setItem(key, value ? "1" : "0"); } catch (ignored) {}
  }
  function recall(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch (ignored) { return fallback; }
  }

  // Hidden by default. The button brings it out and the choice sticks.
  var shellOpen = recall("lab.shell", false);

  function applyShell() {
    document.body.classList.toggle("no-shell", !shellOpen);
    shellToggle.setAttribute("aria-pressed", shellOpen ? "true" : "false");
    shellToggle.textContent = shellOpen ? "Hide shell" : "Shell";
    refresh();
  }

  shellToggle.addEventListener("click", function () {
    shellOpen = !shellOpen;
    remember("lab.shell", shellOpen);
    applyShell();
    if (shellOpen) shell.focus();
  });

  applyShell();

  /* ---- collapsing the instructions -------------------------------- */

  if (taskToggle) {
    var taskOpen = recall("lab.task", false);

    function applyTask() {
      document.body.classList.toggle("no-task", !taskOpen);
      taskToggle.setAttribute("aria-pressed", taskOpen ? "true" : "false");
      taskToggle.textContent = taskOpen ? "Hide instructions" : "Instructions";
      // closed by default, so the button has to advertise itself
      taskToggle.classList.toggle("has-notes", !taskOpen);
      refresh();
    }

    taskToggle.addEventListener("click", function () {
      taskOpen = !taskOpen;
      remember("lab.task", taskOpen);
      applyTask();
    });

    applyTask();
  }

  return shell;
};
