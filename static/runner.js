/* ------------------------------------------------------------------
   Group Python Lab - the shared run engine.

   Used by both the student lab and the instructor demo view, so code runs
   exactly the same way in front of the class as it did on the student's
   laptop. Python executes here, in the tab, through Pyodide. The Flask
   server never runs student code; it only stores it.
   ------------------------------------------------------------------ */

(function () {
  "use strict";

  /* Packages with no WebAssembly build. Saying so immediately beats a long
     wait followed by a resolver error nobody can read. */
  var NO_WASM_BUILD = {
    tensorflow: "TensorFlow has no WebAssembly build, so it can't run in a browser tab.",
    "tensorflow-cpu": "TensorFlow has no WebAssembly build, so it can't run in a browser tab.",
    keras: "Keras needs TensorFlow, JAX or PyTorch underneath, and none of those run in the browser.",
    torch: "PyTorch has no WebAssembly build.",
    torchvision: "PyTorch has no WebAssembly build.",
    jax: "JAX has no WebAssembly build.",
    jaxlib: "JAX has no WebAssembly build.",
    cupy: "CuPy needs a physical NVIDIA GPU, which a browser tab cannot reach.",
    numba: "Numba compiles machine code for the host CPU and has no WebAssembly build.",
    pygame: "Pygame needs a real display surface.",
    psycopg2: "Database drivers need real network sockets, which the browser blocks.",
    mysqlclient: "Database drivers need real network sockets, which the browser blocks."
  };

  var KNOWN_GOOD = "numpy pandas matplotlib scipy scikit-learn sympy networkx " +
                   "pillow requests beautifulsoup4 seaborn statsmodels";

  /* Pyodide's traceback carries frames from its own loader. Drop those so
     students see their own line numbers and nothing else. */
  function tidyTraceback(raw) {
    var lines = String(raw).split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/File "\/lib\/python3[^"]*(_pyodide|pyodide)[^"]*"/.test(line)) {
        if (i + 1 < lines.length && /^\s{4,}\S/.test(lines[i + 1])) i++;
        continue;
      }
      out.push(line.replace(/File "<exec>"/g, 'File "your code"'));
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /* Lines beginning with ! are shell lines, the way a notebook treats them.
     They get blanked rather than deleted so traceback line numbers still
     point at what the student sees in the editor. */
  function splitBangLines(code) {
    var commands = [];
    var kept = code.split("\n").map(function (line) {
      var bang = line.match(/^\s*!(.+)$/);
      if (bang) {
        commands.push(bang[1].trim());
        return "";
      }
      // a bare "pip install x" is not valid Python, so treat it as shell too
      var bare = line.match(/^\s*(?:%\s*)?(pip\s+install\s+.+)$/);
      if (bare) {
        commands.push(bare[1].trim());
        return "";
      }
      return line;
    });
    return { code: kept.join("\n"), commands: commands };
  }

  function parsePipInstall(command) {
    var match = command.match(/^(?:python\s+-m\s+)?pip\s+install\s+(.+)$/);
    if (!match) return null;
    return match[1]
      .split(/\s+/)
      .filter(function (word) { return word && word[0] !== "-"; });
  }

  function baseName(requirement) {
    return requirement.split(/[<>=!~\[]/)[0].trim().toLowerCase();
  }

  /* Boot code: quiet the noisy library warnings, wire input() to a browser
     prompt, and provide a small shell over Pyodide's in-browser filesystem. */
  var PY_BOOT = `
import builtins, os, shlex, sys, warnings

# Library housekeeping warnings (the pandas/pyarrow notice and friends) are
# noise in a classroom. A student's own SyntaxWarning still gets through.
for _category in (DeprecationWarning, FutureWarning, PendingDeprecationWarning):
    warnings.simplefilter("ignore", _category)
del _category


def _lab_input(prompt=""):
    text = "" if prompt is None else str(prompt)
    print(text, end="")
    value = __lab_prompt(text)
    if value is None:
        value = ""
    print(value)
    return value

builtins.input = _lab_input
del _lab_input


def _lab_said():
    """Everything this run has printed so far, as one string."""
    return __lab_output()

builtins.lab_output = _lab_said
del _lab_said


def _lab_celebrate(message=""):
    """Confetti, and a button through to the next assignment."""
    __lab_party(str(message))

builtins.celebrate = _lab_celebrate
del _lab_celebrate


def __lab_python_version():
    return sys.version.split()[0]


__LAB_HELP = """Commands, running against this tab's own filesystem:

  ls [-l] [path]      list files          cat FILE            show a file
  cd PATH             change directory    head/tail [-n N] F  first/last lines
  pwd                 where you are       wc [-l] FILE        count lines/words
  mkdir [-p] DIR      make a directory    find [path]         list everything
  touch FILE          make a file         rm [-r] PATH        delete
  cp [-r] A B         copy                mv A B              move or rename
  echo TEXT           print text          clear               empty this pane

  pip install NAME    add a package       pip list            what's installed
  python --version    version info        help                this list

Anything else is run as Python, sharing variables with your last Run. So
after running, try things like  df.head()  or  len(results).

This filesystem lives in the browser tab. It resets when you reload."""


def __lab_shell(line):
    import shutil

    try:
        parts = shlex.split(line)
    except ValueError as exc:
        return str(exc)
    if not parts:
        return ""
    cmd, args = parts[0], parts[1:]
    flags = [a for a in args if a.startswith("-")]
    rest = [a for a in args if not a.startswith("-")]

    def fail(message):
        return cmd + ": " + message

    def size(path):
        try:
            return os.path.getsize(path)
        except OSError:
            return 0

    if cmd == "help":
        return __LAB_HELP

    if cmd == "pwd":
        return os.getcwd()

    if cmd == "ls":
        target = rest[0] if rest else "."
        if os.path.isfile(target):
            return target
        if not os.path.isdir(target):
            return fail("no such directory: " + target)
        names = sorted(os.listdir(target))
        if not names:
            return "(empty)"
        rows = []
        for name in names:
            full = os.path.join(target, name)
            if os.path.isdir(full):
                rows.append(name + "/")
            elif "-l" in flags:
                rows.append(name.ljust(30) + str(size(full)) + " bytes")
            else:
                rows.append(name)
        return "\\n".join(rows)

    if cmd == "cd":
        target = rest[0] if rest else os.path.expanduser("~")
        try:
            os.chdir(target)
        except OSError:
            return fail("no such directory: " + target)
        return os.getcwd()

    if cmd == "cat":
        if not rest:
            return fail("which file?")
        chunks = []
        for path in rest:
            try:
                with open(path) as handle:
                    chunks.append(handle.read())
            except OSError:
                chunks.append(fail("cannot read " + path))
            except UnicodeDecodeError:
                chunks.append(fail(path + " is not text"))
        return "".join(chunks).rstrip("\\n")

    if cmd in ("head", "tail"):
        count = 10
        for i, arg in enumerate(args):
            if arg == "-n" and i + 1 < len(args):
                try:
                    count = int(args[i + 1])
                except ValueError:
                    pass
        paths = [a for a in rest if not a.isdigit()]
        if not paths:
            return fail("which file?")
        try:
            with open(paths[0]) as handle:
                lines = handle.read().splitlines()
        except OSError:
            return fail("cannot read " + paths[0])
        picked = lines[:count] if cmd == "head" else lines[-count:]
        return "\\n".join(picked)

    if cmd == "wc":
        if not rest:
            return fail("which file?")
        try:
            with open(rest[0]) as handle:
                text = handle.read()
        except OSError:
            return fail("cannot read " + rest[0])
        if "-l" in flags:
            return str(len(text.splitlines()))
        return "{} lines  {} words  {} chars".format(
            len(text.splitlines()), len(text.split()), len(text))

    if cmd == "mkdir":
        if not rest:
            return fail("name the directory")
        try:
            if "-p" in flags:
                os.makedirs(rest[0], exist_ok=True)
            else:
                os.mkdir(rest[0])
        except OSError as exc:
            return fail(str(exc))
        return ""

    if cmd == "touch":
        if not rest:
            return fail("name the file")
        try:
            open(rest[0], "a").close()
        except OSError as exc:
            return fail(str(exc))
        return ""

    if cmd in ("rm", "rmdir"):
        if not rest:
            return fail("what should I delete?")
        target = rest[0]
        try:
            if os.path.isdir(target):
                if cmd == "rmdir" or "-r" in flags:
                    shutil.rmtree(target)
                else:
                    return fail(target + " is a directory, use rm -r")
            else:
                os.remove(target)
        except OSError as exc:
            return fail(str(exc))
        return ""

    if cmd == "cp":
        if len(rest) < 2:
            return fail("cp SOURCE DEST")
        try:
            if os.path.isdir(rest[0]):
                shutil.copytree(rest[0], rest[1])
            else:
                shutil.copy(rest[0], rest[1])
        except OSError as exc:
            return fail(str(exc))
        return ""

    if cmd == "mv":
        if len(rest) < 2:
            return fail("mv SOURCE DEST")
        try:
            shutil.move(rest[0], rest[1])
        except OSError as exc:
            return fail(str(exc))
        return ""

    if cmd == "echo":
        return " ".join(args)

    if cmd == "find":
        root = rest[0] if rest else "."
        found = []
        for base, dirs, files in os.walk(root):
            for name in sorted(dirs):
                found.append(os.path.join(base, name) + "/")
            for name in sorted(files):
                found.append(os.path.join(base, name))
        return "\\n".join(found) if found else "(nothing)"

    if cmd in ("python", "python3"):
        return "Python " + sys.version.split()[0] + " (Pyodide, WebAssembly)"

    if cmd == "pip" and rest and rest[0] == "list":
        try:
            import micropip
            installed = micropip.list()
            return str(installed).rstrip()
        except Exception:
            import importlib.metadata as meta
            names = sorted(d.metadata["Name"] for d in meta.distributions())
            return "\\n".join(names)

    return "__LAB_UNKNOWN__"
`;


  /* Keras needs TensorFlow and TensorFlow has no WebAssembly build, so it
     cannot run in a browser tab. This is a small stand-in with the same
     names doing the same arithmetic in numpy. The lab writes it into the
     tab's filesystem as a real importable package, so an assignment can
     open with the same two import lines a student would write in Colab
     instead of a hundred lines of scaffolding. */
  var KERAS_STANDIN = `import numpy as np

_rng = np.random.default_rng(0)


class Dense:
  """One layer of neurons, same arguments as keras.layers.Dense."""

  def __init__(self, units, input_dim=None, activation=None):
    self.units = units
    self.input_dim = input_dim
    self.activation = activation
    self.W = None

  def build(self, n_in):
    limit = np.sqrt(6.0 / (n_in + self.units))     ## glorot_uniform
    self.W = _rng.uniform(-limit, limit, size=(n_in, self.units))
    self.b = np.zeros((1, self.units))
    self.mW = np.zeros_like(self.W); self.vW = np.zeros_like(self.W)
    self.mb = np.zeros_like(self.b); self.vb = np.zeros_like(self.b)

  def forward(self, x):
    self.x = x
    self.z = x @ self.W + self.b
    if self.activation == "relu":
      self.a = np.maximum(0.0, self.z)
    else:
      self.a = 1.0 / (1.0 + np.exp(-self.z))
    return self.a

  def backward(self, d_a):
    if self.activation == "relu":
      d_z = d_a * (self.z > 0)
    else:
      d_z = d_a * self.a * (1.0 - self.a)
    self.dW = self.x.T @ d_z
    self.db = d_z.sum(axis=0, keepdims=True)
    return d_z @ self.W.T


class History:
  def __init__(self):
    self.history = {"loss": [], "accuracy": []}


class Sequential:
  """Same calls as keras.models.Sequential, for the few we use here."""

  def __init__(self):
    self.layers = []
    self.metrics_names = ["loss", "accuracy"]
    self._t = 0

  def add(self, layer):
    self.layers.append(layer)

  def compile(self, loss=None, optimizer=None, metrics=None):
    self.lr, self.b1, self.b2, self.eps = 0.001, 0.9, 0.999, 1e-7  ## adam defaults

  def _run(self, x):
    for layer in self.layers:
      x = layer.forward(x)
    return x

  def _update(self):
    self._t += 1
    c1, c2 = 1 - self.b1 ** self._t, 1 - self.b2 ** self._t
    for L in self.layers:
      for name, grad, m, v in (("W", L.dW, "mW", "vW"), ("b", L.db, "mb", "vb")):
        mm, vv = getattr(L, m), getattr(L, v)
        mm[:] = self.b1 * mm + (1 - self.b1) * grad
        vv[:] = self.b2 * vv + (1 - self.b2) * grad * grad
        setattr(L, name, getattr(L, name)
                - self.lr * (mm / c1) / (np.sqrt(vv / c2) + self.eps))

  def fit(self, x, y, epochs=1, show_every=25):
    n_in = x.shape[1]
    for layer in self.layers:
      if layer.W is None:
        layer.build(n_in)
      n_in = layer.units

    print("TRAINING")
    print("")
    print(f"   {epochs} epochs, showing every {show_every}th so it stays readable.")
    print("   'loss' is how wrong it is. The bar is that same number, drawn.")
    print("")
    print("     epoch      loss    accuracy   how wrong it still is")
    print("   " + "-" * 62)

    history = History()
    first_loss = None
    for epoch in range(1, epochs + 1):
      out = self._run(x)
      loss = float(((out - y) ** 2).mean())
      acc = float(((out > 0.5) == (y > 0.5)).mean())
      history.history["loss"].append(loss)
      history.history["accuracy"].append(acc)
      if first_loss is None:
        first_loss = max(loss, 1e-9)

      grad = 2.0 * (out - y) / y.size
      for layer in reversed(self.layers):
        grad = layer.backward(grad)
      self._update()

      if epoch == 1 or epoch % show_every == 0 or epoch == epochs:
        bar = "#" * int(round(min(1.0, loss / first_loss) * 28))
        print(f"   {epoch:>7}   {loss:7.4f}    {acc * 100:5.1f}%    {bar}")

    print("")
    print("   and what changed over those %d epochs:" % epochs)
    print("")
    print("                      at the start    at the end")
    print("   " + "-" * 52)
    print(f"      loss            {history.history['loss'][0]:11.4f}   "
          f"{history.history['loss'][-1]:11.4f}")
    print(f"      accuracy        {history.history['accuracy'][0] * 100:10.1f}%   "
          f"{history.history['accuracy'][-1] * 100:10.1f}%")
    print("")
    return history

  def evaluate(self, x, y):
    out = self._run(x)
    return [float(((out - y) ** 2).mean()),
            float(((out > 0.5) == (y > 0.5)).mean())]

  def predict(self, x):
    return self._run(x)
`;

  var WRITE_KERAS = `
import pathlib, sys
_pkg = pathlib.Path("keras")
_pkg.mkdir(exist_ok=True)
# make sure the folder we just wrote into is importable, rather than
# trusting whatever happens to be on sys.path
_where = str(_pkg.resolve().parent)
if _where not in sys.path:
    sys.path.insert(0, _where)
(_pkg / "__init__.py").write_text("")
(_pkg / "_core.py").write_text(__keras_source)
(_pkg / "models.py").write_text("from ._core import Sequential\\n")
(_pkg / "layers.py").write_text("from ._core import Dense\\n")
del _pkg
`;

  function create(opts) {
    var term = opts.terminal;
    var runBtn = opts.runButton;
    var statusEl = opts.statusEl || null;

    var pyodide = null;
    var ready = false;
    var running = false;
    var runCount = 0;
    var runOutput = "";      // what this run has printed, for lab_output()
    var pyVersion = "";
    var namespace = null;

    // Python's stdout goes wherever this points, so a shell command's output
    // lands in the shell pane rather than the run terminal.
    var sink = null;

    function writeTo(target, text, cls) {
      var span = document.createElement("span");
      if (cls) span.className = cls;
      span.textContent = text;
      target.appendChild(span);
      target.scrollTop = target.scrollHeight;
    }

    function write(text, cls) {
      writeTo(sink || term, text, cls);
    }

    function meta(text) {
      write(text + "\n", "meta");
    }

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }

    function setLabel(text) {
      if (!runBtn) return;
      runBtn.innerHTML = "";
      var glyph = document.createElement("span");
      glyph.className = "run-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "\u25B6";
      runBtn.appendChild(glyph);
      runBtn.appendChild(document.createTextNode(text));
    }

    /* A short wave the first time Python is ready, so nobody sits there
       wondering what to press. It stops on its own, never repeats in a
       session, and does nothing if the browser asks for reduced motion. */
    function waveOnce() {
      if (!runBtn) return;
      try {
        if (localStorage.getItem("lab.waved") === "1") return;
        localStorage.setItem("lab.waved", "1");
      } catch (ignored) { /* private browsing: wave anyway */ }
      runBtn.classList.add("wants-a-click");
      setTimeout(function () { runBtn.classList.remove("wants-a-click"); }, 4200);
      runBtn.addEventListener("click", function () {
        runBtn.classList.remove("wants-a-click");
      }, { once: true });
    }

    function clockTime() {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    }

    function separator(label) {
      runCount += 1;
      var parts = [label || "run " + runCount];
      if (pyVersion) parts.push("Python " + pyVersion);
      parts.push(clockTime());
      if (term.childNodes.length) writeTo(term, "\n");
      writeTo(term, "\u2500\u2500 " + parts.join("   ") + "\n", "rule");
    }

    var editor = CodeMirror.fromTextArea(opts.textarea, {
      mode: "python",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      lineWrapping: false,
      extraKeys: {
        "Ctrl-Enter": function () { run(); },
        "Cmd-Enter": function () { run(); },
        Tab: function (cm) {
          if (cm.somethingSelected()) cm.execCommand("indentMore");
          else cm.replaceSelection("    ", "end");
        },
        "Shift-Tab": function (cm) { cm.execCommand("indentLess"); }
      }
    });

    /* ---------------------------------------------------------------
       boot
       --------------------------------------------------------------- */

    async function boot() {
      setStatus("loading Python");
      meta("Loading Python. First time takes a few seconds.");
      try {
        pyodide = await loadPyodide({
          stdout: function (s) { runOutput += s + "\n"; write(s + "\n"); },
          stderr: function (s) { write(s + "\n", "err"); }
        });

        pyodide.globals.set("__lab_prompt", function (promptText) {
          var answer = window.prompt(promptText || "Input:");
          return answer === null ? "" : answer;
        });
        pyodide.globals.set("__lab_output", function () { return runOutput; });
        pyodide.globals.set("__lab_party", function (message) {
          // celebrate() is a courtesy. If any of it fails, the student's
          // run has still succeeded and must not show a traceback.
          try { confetti(); } catch (ignored) {}
          try {
            if (opts.onSolved) opts.onSolved(String(message || ""));
          } catch (ignored) {}
        });
        await pyodide.runPythonAsync(PY_BOOT);
        pyodide.globals.set("__keras_source", KERAS_STANDIN);
        await pyodide.runPythonAsync(WRITE_KERAS);
        pyVersion = pyodide.globals.get("__lab_python_version")();

        ready = true;
        if (runBtn) {
          runBtn.disabled = false;
          setLabel("Run");
          waveOnce();
        }
        setStatus("Python " + pyVersion);
        meta("Python " + pyVersion + " ready, running inside this browser tab.");
        meta("Add packages with a line like:  !pip install pandas");
        meta(opts.readyMessage || "Press Run, or Ctrl+Enter.");
        if (opts.onReady) opts.onReady();
      } catch (err) {
        setStatus("Python failed to load");
        write("Could not load Python: " + err + "\n", "err");
        meta("Check the network connection and reload the page.");
      }
    }

    /* ---------------------------------------------------------------
       packages
       --------------------------------------------------------------- */

    var micropip = null;
    var alreadyInstalled = {};

    async function getMicropip() {
      if (!micropip) {
        await pyodide.loadPackage("micropip");
        micropip = pyodide.pyimport("micropip");
      }
      return micropip;
    }

    async function install(requirements) {
      for (var i = 0; i < requirements.length; i++) {
        var requirement = requirements[i];
        var key = baseName(requirement);

        if (NO_WASM_BUILD[key]) {
          write("cannot install " + requirement + "\n", "err");
          meta("  " + NO_WASM_BUILD[key]);
          meta("  Packages that do work here: " + KNOWN_GOOD);
          continue;
        }

        // A pip line at the top of the file shouldn't reinstall on every run.
        if (alreadyInstalled[requirement]) {
          meta(key + " already installed");
          continue;
        }

        write("installing " + requirement + "\n", "meta");
        setStatus("installing " + key);
        try {
          var pip = await getMicropip();
          await pip.install(requirement);
          alreadyInstalled[requirement] = true;
          write("  " + requirement + " ready\n", "ok");
        } catch (err) {
          write("  could not install " + requirement + "\n", "err");
          meta("  " + String(err && err.message ? err.message : err).split("\n")[0]);
          meta("  Pure-Python packages install from PyPI; anything with C or CUDA");
          meta("  in it needs a WebAssembly build, and most don't have one.");
        }
      }
      setStatus("Python " + pyVersion);
    }

    /* ---------------------------------------------------------------
       shell
       --------------------------------------------------------------- */

    function getNamespace() {
      if (!namespace) {
        namespace = pyodide.globals.get("dict")();
        namespace.set("__name__", "__main__");
      }
      return namespace;
    }

    function resetNamespace() {
      if (namespace) namespace.destroy();
      namespace = null;
      return getNamespace();
    }

    /* Runs one shell line and writes the result to `target`. Returns true if
       it was handled as a command rather than as Python. */
    async function command(line, target) {
      var previous = sink;
      sink = target || term;
      try {
        var requirements = parsePipInstall(line);
        if (requirements) {
          await install(requirements);
          return true;
        }

        var shell = pyodide.globals.get("__lab_shell");
        var result = shell(line);
        if (result !== "__LAB_UNKNOWN__") {
          if (result) write(result + "\n");
          return true;
        }

        // not a command, so treat it as Python in the shared namespace
        var value = await pyodide.runPythonAsync(line, { globals: getNamespace() });
        if (value !== undefined && value !== null) {
          var text = (value && typeof value.toString === "function")
            ? value.toString() : String(value);
          write(text + "\n");
          if (value && typeof value.destroy === "function") value.destroy();
        }
        return false;
      } catch (err) {
        write(tidyTraceback(err && err.message ? err.message : err) + "\n", "err");
        return false;
      } finally {
        sink = previous;
      }
    }

    /* ---------------------------------------------------------------
       run
       --------------------------------------------------------------- */

    async function run(label) {
      if (!ready || running) return;

      running = true;
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.classList.remove("wants-a-click");
        setLabel("Running");
      }
      setStatus("running");

      runOutput = "";
      var source = editor.getValue();
      if (opts.beforeRun) {
        try { opts.beforeRun(source); } catch (ignored) { /* never block a run */ }
      }

      separator(typeof label === "string" ? label : null);

      var split = splitBangLines(source);
      var started = performance.now();

      try {
        for (var i = 0; i < split.commands.length; i++) {
          await command(split.commands[i], term);
        }

        // packages the code imports but never pip-installed (numpy, pandas...)
        try {
          await pyodide.loadPackagesFromImports(split.code, {
            messageCallback: function () {},
            errorCallback: function () {}
          });
        } catch (ignored) { /* the import itself will report the problem */ }

        var ns = resetNamespace();
        await pyodide.runPythonAsync(split.code, { globals: ns });
        var seconds = ((performance.now() - started) / 1000).toFixed(2);
        write("finished in " + seconds + "s\n", "ok");
      } catch (err) {
        write(tidyTraceback(err && err.message ? err.message : err) + "\n", "err");
      } finally {
        running = false;
        if (runBtn) {
          runBtn.disabled = false;
          setLabel("Run");
        }
        setStatus("Python " + pyVersion);
        if (opts.afterRun) opts.afterRun();
      }
    }

    if (runBtn) runBtn.addEventListener("click", function () { run(); });

    if (opts.clearButton) {
      opts.clearButton.addEventListener("click", function () {
        term.textContent = "";
        runCount = 0;
        editor.focus();
      });
    }

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });

    window.addEventListener("resize", function () { editor.refresh(); });

    return {
      editor: editor,
      run: run,
      boot: boot,
      write: write,
      meta: meta,
      command: command,
      isReady: function () { return ready; },
      isRunning: function () { return running; },
      pythonVersion: function () { return pyVersion; },
      clearTerminal: function () { term.textContent = ""; runCount = 0; },
      setCode: function (code) {
        var scroll = editor.getScrollInfo();
        editor.setValue(code);
        editor.scrollTo(scroll.left, scroll.top);
      }
    };
  }

  /* ------------------------------------------------------------------
     panes
     ------------------------------------------------------------------ */

  /* Ctrl+A inside an output pane should select that pane, not the page. */
  function selectable(pane) {
    pane.setAttribute("tabindex", "0");
    pane.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "a" && e.key !== "A") return;
      e.preventDefault();
      e.stopPropagation();
      var range = document.createRange();
      range.selectNodeContents(pane);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }

  function copyPane(pane, button) {
    var original = button.textContent;
    function done(message) {
      button.textContent = message;
      setTimeout(function () { button.textContent = original; }, 1400);
    }
    button.addEventListener("click", function () {
      var text = pane.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { done("Copied"); },
          function () { done("Press Ctrl+C"); }
        );
      } else {
        done("Press Ctrl+C");
      }
    });
  }

  /* Draggable divider. `axis` is "rows" for a top/bottom split or "columns"
     for a left/right one. */
  function split(container, grip, editor, axis, opts) {
    opts = opts || {};
    var rows = axis !== "columns";
    var minimum = opts.min || 90;
    var slack = opts.slack || 150;

    // Is the resizable track the first one in the grid, or the last?
    var leading = !!opts.leading;

    function apply(size) {
      var total = rows ? container.clientHeight : container.clientWidth;
      var value = Math.max(minimum, Math.min(total - slack, size));
      // Set the custom property the stylesheet reads, not the whole template,
      // so hiding the shell or dropping to a narrow screen still wins.
      container.style.setProperty(opts.property, value + "px");
      if (editor) editor.refresh();
      if (opts.onResize) opts.onResize();
    }

    function onDrag(e) {
      var point = e.touches ? e.touches[0] : e;
      var box = container.getBoundingClientRect();
      if (leading) {
        apply(rows ? point.clientY - box.top : point.clientX - box.left);
      } else {
        apply(rows ? box.bottom - point.clientY : box.right - point.clientX);
      }
    }

    function endDrag() {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", onDrag);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", onDrag);
      window.removeEventListener("touchend", endDrag);
    }

    function startDrag(e) {
      e.preventDefault();
      document.body.classList.add("dragging");
      window.addEventListener("mousemove", onDrag);
      window.addEventListener("mouseup", endDrag);
      window.addEventListener("touchmove", onDrag, { passive: false });
      window.addEventListener("touchend", endDrag);
    }

    grip.addEventListener("mousedown", startDrag);
    grip.addEventListener("touchstart", startDrag, { passive: false });
    grip.addEventListener("keydown", function (e) {
      var pane = leading ? grip.previousElementSibling : grip.nextElementSibling;
      var current = rows ? pane.clientHeight : pane.clientWidth;
      var grow = rows ? (leading ? "ArrowDown" : "ArrowUp")
                      : (leading ? "ArrowRight" : "ArrowLeft");
      var shrink = rows ? (leading ? "ArrowUp" : "ArrowDown")
                        : (leading ? "ArrowLeft" : "ArrowRight");
      if (e.key === grow) { e.preventDefault(); apply(current + 32); }
      if (e.key === shrink) { e.preventDefault(); apply(current - 32); }
    });
  }

  /* ------------------------------------------------------------------
     the shell pane: history, prompt, command dispatch
     ------------------------------------------------------------------ */

  function shell(runner, els) {
    var history = [];
    var cursor = 0;

    function echo(text, cls) {
      var span = document.createElement("span");
      if (cls) span.className = cls;
      span.textContent = text;
      els.output.appendChild(span);
      els.output.scrollTop = els.output.scrollHeight;
    }

    async function submit(line) {
      echo("> " + line + "\n", "prompt-echo");
      if (line === "clear") {
        els.output.textContent = "";
        return;
      }
      els.input.disabled = true;
      try {
        await runner.command(line, els.output);
      } finally {
        els.input.disabled = false;
        els.input.focus();
      }
    }

    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var line = els.input.value.trim();
        els.input.value = "";
        if (!line) return;
        history.push(line);
        cursor = history.length;
        submit(line);
        return;
      }
      if (e.key === "ArrowUp" && cursor > 0) {
        e.preventDefault();
        cursor -= 1;
        els.input.value = history[cursor];
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        cursor = Math.min(cursor + 1, history.length);
        els.input.value = cursor === history.length ? "" : history[cursor];
      }
    });

    if (els.clear) {
      els.clear.addEventListener("click", function () {
        els.output.textContent = "";
        els.input.focus();
      });
    }

    els.output.addEventListener("click", function (e) {
      if (window.getSelection().isCollapsed) els.input.focus();
    });

    return {
      greet: function () {
        echo("Shell over this tab's filesystem. Type help for the list.\n", "meta");
      },
      focus: function () { els.input.focus(); }
    };
  }

  window.Runner = {
    create: create,
    split: split,
    shell: shell,
    selectable: selectable,
    copyPane: copyPane,
    tidyTraceback: tidyTraceback
  };
})();
