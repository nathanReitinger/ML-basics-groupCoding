#!/usr/bin/env python3
"""
Group Python Lab
================

A classroom Python editor.

  Students   /            name a group, or pick one back up from the dropdown
             /lab         editor, output, and a shell
  Instructor /instructor  every task, every group under it, run any of them
             /instructor/tasks   write the assignment and its starter code

  1. pip install -r requirements.txt
  2. Put your ngrok authtoken in NGROK_AUTHTOKEN below.
  3. python app.py

The URLs get printed when it starts. Add --local to skip ngrok and stay on
your own machine.

This file needs the templates/ and static/ folders that sit next to it. Keep
them together and you can run app.py from anywhere.

Python runs in the browser through Pyodide (WebAssembly), never on this
server, so nothing a student writes can touch this machine. The server only
stores text. That also means no GPU and no TensorFlow - see the README.
"""

# ==========================================================================
#
#   PASTE YOUR NGROK AUTHTOKEN ON THE NEXT LINE AND YOU ARE DONE.
#
#   Get it from https://dashboard.ngrok.com/get-started/your-authtoken
#   It looks like:  2abcDEFghiJKLmnoPQRstuVWXyz_1A2b3C4d5E6f7G8h9
#
NGROK_AUTHTOKEN = "3JgSnN218rYoMuGycp08kRWgQFT_3ZYzh6XePfWVVrCmGmFnx"
#
# ==========================================================================


# ==========================================================================
#  Everything else you might want to change
# ==========================================================================

# Your reserved ngrok domain, so the link is the same every class.
NGROK_DOMAIN = "stroller-coastal-earthly.ngrok-free.dev"

# Set False (or run with --local) to work offline with no public URL.
USE_NGROK = True

# Live collaboration: everyone in a group shares one editor, sees each
# other's cursors, and cannot overwrite each other. Set False to go back
# to one-at-a-time saving.
LIVE_EDITING = True

# The instructor password. Students never need it.
INSTRUCTOR_PASSWORD = "admin"

PORT = 5000
HOST = "0.0.0.0"          # 0.0.0.0 also lets the same wifi reach you directly

# Let students pick their group back up from a dropdown on the front page.
# It lists group names, so anyone could open anyone else's work; the page
# asks them not to. Set False to make everyone type their name instead.
SHOW_GROUP_PICKER = True

# Where the class's work is kept. A file, next to this script, created on
# first run. Delete it to clear everything and start over.
DB_FILENAME = "lab.db"

# Signs the session cookie: which group a student is in, and whether the
# instructor has signed in. Change it along with the password.
SECRET_KEY = "group-python-lab"

SESSION_DAYS = 30
MAX_NAME_LEN = 40
MAX_CODE_LEN = 200_000
MAX_TITLE_LEN = 120
MAX_INSTRUCTIONS_LEN = 20_000

# How long the instructor roster waits between refreshes.
ROSTER_POLL_MS = 4000

# ==========================================================================

import json
import re
import socket
import base64
import sqlite3
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

import collab

DB_PATH = Path(__file__).resolve().parent / DB_FILENAME

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=SESSION_DAYS)


# --------------------------------------------------------------------------
# storage
# --------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS groups (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
                code       TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                title        TEXT NOT NULL,
                instructions TEXT NOT NULL DEFAULT '',
                starter_code TEXT NOT NULL DEFAULT '',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            )
            """
        )
        # Each group keeps a separate answer per assignment, so the toggle
        # at the top of the lab switches between their own saved work.
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                group_id   INTEGER NOT NULL,
                task_id    INTEGER NOT NULL,
                code       TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (group_id, task_id)
            )
            """
        )
        # The shared document behind live editing. Plain text lives in
        # submissions above, which is what the instructor's view reads;
        # this is the mergeable version the browsers pass between them.
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS docstate (
                group_id   INTEGER NOT NULL,
                task_id    INTEGER NOT NULL,
                state      BLOB    NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (group_id, task_id)
            )
            """
        )
        # Added after the first version shipped, so bring old files forward.
        columns = [row[1] for row in db.execute("PRAGMA table_info(groups)")]
        if "task_id" not in columns:
            db.execute("ALTER TABLE groups ADD COLUMN task_id INTEGER")
        db.execute(
            "INSERT OR IGNORE INTO submissions (group_id, task_id, code, updated_at)"
            " SELECT id, task_id, code, updated_at FROM groups"
            " WHERE task_id IS NOT NULL AND code <> ''"
        )
        db.commit()
    seed_assignments()


def seed_assignments() -> None:
    """First run only: load the assignments out of starters/.

    Each pair is NAME.py (the starter code) and NAME.txt (first line the
    title, second line a one-line subtitle, the rest the instructions).
    Edit those files and delete lab.db to load them again, or edit any
    assignment in the browser once it is loaded.
    """
    db = sqlite3.connect(DB_PATH)
    try:
        if db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]:
            return
        folder = Path(__file__).resolve().parent / "starters"
        if not folder.is_dir():
            return
        stamp = now_iso()
        for code_file in sorted(folder.glob("*.py")):
            notes = code_file.with_suffix(".txt")
            if notes.exists():
                lines = notes.read_text().splitlines()
                title = lines[0].strip()
                body = "\n".join(lines[1:]).strip()
            else:
                title = code_file.stem.replace("_", " ")
                body = ""
            db.execute(
                "INSERT INTO tasks (title, instructions, starter_code,"
                " created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (title, body, code_file.read_text(), stamp, stamp),
            )
        db.commit()
    finally:
        db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def find_group(name: str):
    return get_db().execute(
        "SELECT * FROM groups WHERE name = ? COLLATE NOCASE", (name,)
    ).fetchone()


def group_by_id(gid: int):
    return get_db().execute("SELECT * FROM groups WHERE id = ?", (gid,)).fetchone()


def all_groups() -> list:
    return get_db().execute(
        "SELECT * FROM groups ORDER BY name COLLATE NOCASE"
    ).fetchall()


def all_tasks() -> list:
    # Creation order, so the roster reads like the order you taught them.
    return get_db().execute("SELECT * FROM tasks ORDER BY id").fetchall()


def task_by_id(tid):
    if tid is None:
        return None
    return get_db().execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()


def create_group(name: str):
    """New groups start on assignment one, with nothing typed yet."""
    db = get_db()
    stamp = now_iso()
    db.execute(
        "INSERT INTO groups (name, code, created_at, updated_at, task_id)"
        " VALUES (?, ?, ?, ?, ?)",
        (name, "", stamp, stamp, first_task_id()),
    )
    db.commit()
    return find_group(name)


def first_task_id():
    row = get_db().execute("SELECT id FROM tasks ORDER BY id LIMIT 1").fetchone()
    return row["id"] if row else None


def current_task_id(group) -> int | None:
    """Which assignment this group has open. Falls back to the first one."""
    if group["task_id"] is not None and task_by_id(group["task_id"]) is not None:
        return group["task_id"]
    return first_task_id()


def set_current_task(gid: int, tid) -> None:
    db = get_db()
    db.execute("UPDATE groups SET task_id = ? WHERE id = ?", (tid, gid))
    db.commit()


def code_for(gid: int, tid) -> str:
    """This group's answer to this assignment, starting from the starter."""
    if tid is None:
        row = group_by_id(gid)
        return starter_code(row["name"]) if row else ""
    found = get_db().execute(
        "SELECT code FROM submissions WHERE group_id = ? AND task_id = ?", (gid, tid)
    ).fetchone()
    if found is not None:
        return found["code"]
    task = task_by_id(tid)
    if task is not None and task["starter_code"].strip():
        return task["starter_code"]
    row = group_by_id(gid)
    return starter_code(row["name"]) if row else ""


def save_code(gid: int, tid, code: str) -> str:
    stamp = now_iso()
    db = get_db()
    if tid is not None:
        db.execute(
            "INSERT INTO submissions (group_id, task_id, code, updated_at)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(group_id, task_id) DO UPDATE SET"
            " code = excluded.code, updated_at = excluded.updated_at",
            (gid, tid, code, stamp),
        )
    db.execute("UPDATE groups SET code = ?, updated_at = ? WHERE id = ?",
               (code, stamp, gid))
    db.commit()
    return stamp


def all_submissions() -> dict:
    """{(group_id, task_id): row} - one query, for the roster."""
    return {(r["group_id"], r["task_id"]): r
            for r in get_db().execute("SELECT * FROM submissions")}


def starter_code(name: str) -> str:
    return (
        f"# {name}\n"
        "# Write Python below, then press Run (or Ctrl+Enter).\n"
        "\n"
        'print("Hello from the lab")\n'
    )


def create_task(title: str, instructions: str, starter: str):
    db = get_db()
    stamp = now_iso()
    cur = db.execute(
        "INSERT INTO tasks (title, instructions, starter_code, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (title, instructions, starter, stamp, stamp),
    )
    db.commit()
    return cur.lastrowid


def update_task(tid: int, title: str, instructions: str, starter: str) -> None:
    db = get_db()
    db.execute(
        "UPDATE tasks SET title = ?, instructions = ?, starter_code = ?, updated_at = ?"
        " WHERE id = ?",
        (title, instructions, starter, now_iso(), tid),
    )
    db.commit()


def task_usage(tid: int) -> int:
    return get_db().execute(
        "SELECT COUNT(*) AS n FROM groups WHERE task_id = ?", (tid,)
    ).fetchone()["n"]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _prose_and_code(lines: list) -> list:
    """Join wrapped prose back into paragraphs, leave indented lines alone."""
    out, text, code = [], [], []

    def flush_text():
        if text:
            out.append({"kind": "text", "body": " ".join(l.strip() for l in text)})
            text.clear()

    def flush_code():
        if code:
            out.append({"kind": "code", "body": "\n".join(code)})
            code.clear()

    for line in lines:
        if line.startswith("    "):
            flush_text()
            code.append(line)
        else:
            flush_code()
            text.append(line)
    flush_text()
    flush_code()
    return out


def instruction_blocks(text: str) -> list:
    """Turn the instruction text into blocks the page can lay out.

    The .txt files are hard-wrapped so they read well in an editor, but a
    browser should reflow them to whatever width the pane happens to be.
    Indented lines are left exactly as typed, because those are code.

    A paragraph beginning "HINT: something" becomes a closed accordion.
    Its first line is the summary, the rest is what opens.
    """
    blocks = []
    for chunk in re.split(r"\n\s*\n", (text or "").strip()):
        lines = [ln for ln in chunk.split("\n") if ln.strip()]
        if not lines:
            continue

        if lines[0].strip().upper().startswith("HINT:"):
            blocks.append({
                "kind": "hint",
                "title": lines[0].split(":", 1)[1].strip(),
                "body": _prose_and_code(lines[1:]),
            })
            continue

        if all(ln.startswith("    ") for ln in lines):
            blocks.append({"kind": "code", "body": "\n".join(lines)})
            continue

        if any(re.match(r"\s*(\d+\.|[-*])\s", ln) for ln in lines):
            # the marker belongs to the list, not to the text of the item,
            # or the browser draws a bullet next to a number
            ordered = bool(re.match(r"\s*\d+\.\s", lines[0]))
            items, current = [], ""
            for ln in lines:
                if re.match(r"\s*(\d+\.|[-*])\s", ln):
                    if current:
                        items.append(current)
                    current = re.sub(r"^\s*(\d+\.|[-*])\s+", "", ln).strip()
                else:
                    current = (current + " " + ln.strip()).strip()
            if current:
                items.append(current)
            blocks.append({"kind": "list", "ordered": ordered, "body": items})
            continue

        blocks.append({"kind": "text", "body": " ".join(ln.strip() for ln in lines)})
    return blocks


def clean_name(raw: str) -> str:
    """Collapse whitespace, drop control characters, cap the length."""
    name = re.sub(r"\s+", " ", (raw or "").strip())
    name = "".join(ch for ch in name if ch.isprintable())
    return name[:MAX_NAME_LEN]


def humanize(value: str) -> str:
    try:
        dt = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return value
    mins = int((datetime.now(timezone.utc) - dt).total_seconds() // 60)
    if mins < 1:
        return "just now"
    if mins == 1:
        return "1 min ago"
    if mins < 60:
        return f"{mins} min ago"
    hours = mins // 60
    if hours == 1:
        return "1 hr ago"
    if hours < 24:
        return f"{hours} hr ago"
    return dt.strftime("%b %d, %H:%M UTC")


app.add_template_filter(humanize, "when")


def strip_number(title: str) -> str:
    """Titles are written "2. Write a rule instead" so they sort and read
    well in the starters folder, but the tab already shows the number."""
    return re.sub(r"^\s*\d+\.\s*", "", title or "")


app.add_template_filter(strip_number, "bare")


def current_group():
    name = session.get("group")
    if not name:
        return None
    row = find_group(name)
    if row is None:  # database was reset out from under the session
        session.pop("group", None)
    return row


def started(code: str, task) -> bool:
    """Has anyone typed in this yet, or is it still the starter?"""
    if not code.strip():
        return False
    if task is not None and task["starter_code"].strip():
        return code.strip() != task["starter_code"].strip()
    return True


def summarize(row, tasks, subs) -> dict:
    """One group: where they are now, and how far through the set."""
    tid = current_task_id(row)
    task = next((t for t in tasks if t["id"] == tid), None)
    here = subs.get((row["id"], tid))
    code = here["code"] if here else ""
    real = [ln for ln in code.splitlines()
            if ln.strip() and not ln.lstrip().startswith("#")]

    progress = []
    for index, t in enumerate(tasks, start=1):
        sub = subs.get((row["id"], t["id"]))
        progress.append({
            "n": index,
            "id": t["id"],
            "title": t["title"],
            "started": started(sub["code"] if sub else "", t),
            "current": t["id"] == tid,
            "url": url_for("instructor_demo_task", gid=row["id"], tid=t["id"]),
        })

    return {
        "id": row["id"],
        "name": row["name"],
        "updated_at": row["updated_at"],
        "updated_human": humanize(row["updated_at"]),
        "lines": len(real),
        "started": started(code, task),
        "preview": "\n".join(real[:4])[:240],
        "progress": progress,
        "url": url_for("instructor_demo", gid=row["id"]),
    }


def grouped_groups() -> list:
    """[(task_row_or_None, [group_rows]), ...] - the roster's order, and the
    order previous/next walks. Grouped by the assignment each group has open."""
    groups = all_groups()
    tasks = all_tasks()
    sections = [(t, [g for g in groups if current_task_id(g) == t["id"]])
                for t in tasks]
    loose = [g for g in groups if current_task_id(g) is None]
    if loose or not tasks:
        sections.append((None, loose))
    return sections


def roster_sections() -> list:
    tasks = all_tasks()
    subs = all_submissions()
    return [{
        "id": task["id"] if task else None,
        "title": task["title"] if task else "No assignment",
        "url": url_for("task_edit", tid=task["id"]) if task else None,
        "groups": [summarize(row, tasks, subs) for row in members],
    } for task, members in grouped_groups()]


def walk_order() -> list:
    """Group rows in roster order, so previous/next stays inside a task."""
    return [row for _task, members in grouped_groups() for row in members]


# --------------------------------------------------------------------------
# instructor access
# --------------------------------------------------------------------------

def instructor_ok() -> bool:
    return bool(session.get("instructor"))


def instructor_page(view):
    """Send a browser to the password prompt instead of a bare 403."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not instructor_ok():
            return redirect(url_for("instructor_login", next=request.path))
        return view(*args, **kwargs)
    return wrapper


def instructor_api(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not instructor_ok():
            return jsonify(ok=False, error="Instructor session expired."), 403
        return view(*args, **kwargs)
    return wrapper


@app.get("/instructor/login")
def instructor_login():
    if instructor_ok():
        return redirect(url_for("instructor_roster"))
    return render_template("instructor_login.html", next=request.args.get("next", ""))


@app.post("/instructor/login")
def instructor_login_post():
    if request.form.get("password", "") == INSTRUCTOR_PASSWORD:
        session.permanent = True
        session["instructor"] = True
        target = request.form.get("next", "")
        # Follow same-site paths only, never an absolute URL pasted into the form.
        if target.startswith("/") and not target.startswith("//"):
            return redirect(target)
        return redirect(url_for("instructor_roster"))
    return (
        render_template(
            "instructor_login.html",
            next=request.form.get("next", ""),
            error="That isn't the password.",
        ),
        403,
    )


@app.post("/instructor/logout")
def instructor_logout():
    session.pop("instructor", None)
    return redirect(url_for("home"))


# --------------------------------------------------------------------------
# student routes
# --------------------------------------------------------------------------

@app.get("/")
def home():
    names = [row["name"] for row in all_groups()] if SHOW_GROUP_PICKER else []
    return render_template("index.html", current=session.get("group"), names=names)


@app.post("/")
def join():
    # Either typed into the name tag, or picked from the rejoin dropdown.
    name = clean_name(request.form.get("group_name") or request.form.get("existing", ""))
    if not name:
        names = [row["name"] for row in all_groups()] if SHOW_GROUP_PICKER else []
        return (
            render_template(
                "index.html",
                current=session.get("group"),
                names=names,
                error="Type a name first. Anything works.",
            ),
            400,
        )

    row = find_group(name) or create_group(name)

    # Use the spelling the group was created with, so "the semicolons" and
    # "The Semicolons" stay one group rather than two.
    session.permanent = True
    session["group"] = row["name"]
    return redirect(url_for("lab"))


@app.post("/leave")
def leave():
    session.pop("group", None)
    return redirect(url_for("home"))


@app.get("/lab")
def lab():
    row = current_group()
    if row is None:
        return redirect(url_for("home"))
    return render_lab(row, current_task_id(row))


@app.get("/lab/<int:tid>")
def lab_task(tid: int):
    """The assignment toggle. Switching remembers where they were."""
    row = current_group()
    if row is None:
        return redirect(url_for("home"))
    if task_by_id(tid) is None:
        return redirect(url_for("lab"))
    set_current_task(row["id"], tid)
    return render_lab(row, tid)


def render_lab(row, tid):
    tasks = all_tasks()
    # 1-based position, so the title can drop its own "1. " prefix
    index = next((i for i, t in enumerate(tasks, 1) if t["id"] == tid), 1)
    following = tasks[index] if index < len(tasks) else None
    return render_template(
        "lab.html",
        group=row["name"],
        code=code_for(row["id"], tid),
        task=task_by_id(tid),
        task_id=tid,
        task_index=index,
        tasks=tasks,
        next_task=following,
        blocks=instruction_blocks(task_by_id(tid)["instructions"]) if task_by_id(tid) else [],
    )


@app.post("/api/save")
def api_save():
    """A student can only ever write to the group in their own session."""
    row = current_group()
    if row is None:
        return jsonify(ok=False, error="Your session expired. Reload and rejoin."), 401

    data = request.get_json(silent=True) or {}
    code = data.get("code")
    if not isinstance(code, str):
        return jsonify(ok=False, error="Expected a 'code' string."), 400

    tid = data.get("task_id")
    tid = tid if isinstance(tid, int) and task_by_id(tid) else current_task_id(row)

    stamp = save_code(row["id"], tid, code[:MAX_CODE_LEN])
    return jsonify(ok=True, saved_at=stamp)


# --------------------------------------------------------------------------
# live editing
# --------------------------------------------------------------------------

def read_doc(group_id: int, task_id: int):
    """A group's shared document, as stored."""
    with sqlite3.connect(DB_PATH) as db:
        row = db.execute(
            "SELECT state FROM docstate WHERE group_id = ? AND task_id = ?",
            (group_id, task_id),
        ).fetchone()
    return row[0] if row else None


def write_doc(group_id: int, task_id: int, blob: bytes) -> None:
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "INSERT INTO docstate (group_id, task_id, state, updated_at)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(group_id, task_id) DO UPDATE SET"
            " state = excluded.state, updated_at = excluded.updated_at",
            (group_id, task_id, blob, now_iso()),
        )
        db.commit()


def persist_edits() -> None:
    """Edits arrive keystroke by keystroke and pile up in memory. Every
    few seconds the rooms that changed are written down, so a shut laptop
    costs a moment's work rather than the lesson."""
    while True:
        time.sleep(3)
        try:
            pending = collab.pending_saves()
            for (group_id, task_id), blob in pending:
                write_doc(group_id, task_id, blob)
            collab.mark_saved([key for key, _ in pending])
            collab.drop_idle()
        except Exception:
            pass


if LIVE_EDITING:
    threading.Thread(target=persist_edits, daemon=True).start()


def exchange(room, payload):
    """The one live-editing operation: take this edit, hand back the ones
    this caller has not seen. A keystroke and a catch-up are the same
    request, which is why there is nothing here that can silently stop
    working and leave somebody pressing refresh."""
    since = payload.get("since")
    since = since if isinstance(since, int) else 0

    raw = payload.get("update") or ""
    update = b""
    if raw:
        try:
            update = base64.b64decode(raw, validate=True)
        except Exception:
            return jsonify(ok=False, error="Bad update."), 400
        if len(update) > MAX_CODE_LEN:
            return jsonify(ok=False, error="Update too large."), 413

    whole = payload.get("whole") or ""
    if whole:
        # a client has sent the entire document, so the log of single
        # keystrokes can be replaced by it
        try:
            seq = room.replace_with(base64.b64decode(whole, validate=True))
        except Exception:
            return jsonify(ok=False, error="Bad snapshot."), 400
        return jsonify(ok=True, seq=seq, updates=[], here=1, reset=True)

    token = payload.get("me")
    token = token if isinstance(token, str) else ""
    seq, waiting, here = room.exchange(since, update, token[:64])

    return jsonify(
        ok=True,
        seq=seq,
        updates=[base64.b64encode(u).decode("ascii") for u in waiting],
        here=here,
        seed=bool(payload.get("ask_seed")) and room.claim_seed(),
    )


@app.post("/api/doc/<int:tid>")
def api_doc(tid: int):
    """Students. The group comes from their own session, so nobody can
    reach another group's document."""
    row = current_group()
    if row is None:
        return jsonify(ok=False, error="Your session expired. Reload and rejoin."), 401
    if not LIVE_EDITING:
        return jsonify(ok=False, error="Live editing is off."), 409

    room = collab.room_for(row["id"], tid, read_doc)
    return exchange(room, request.get_json(silent=True) or {})


@app.post("/api/doc/<int:gid>/<int:tid>")
@instructor_api
def api_doc_instructor(gid: int, tid: int):
    """The demo page, so 'save to group' lands in front of them straight
    away instead of waiting for a reload."""
    if group_by_id(gid) is None:
        return jsonify(ok=False, error="No such group."), 404
    if not LIVE_EDITING:
        return jsonify(ok=False, error="Live editing is off."), 409

    room = collab.room_for(gid, tid, read_doc)
    return exchange(room, request.get_json(silent=True) or {})


# --------------------------------------------------------------------------
# instructor routes
# --------------------------------------------------------------------------

@app.get("/instructor")
@instructor_page
def instructor_roster():
    return render_template(
        "instructor.html",
        sections=roster_sections(),
        group_count=len(all_groups()),
        task_count=len(all_tasks()),
        poll_ms=ROSTER_POLL_MS,
    )


@app.get("/instructor/group/<int:gid>")
@instructor_page
def instructor_demo(gid: int):
    row = group_by_id(gid)
    if row is None:
        return redirect(url_for("instructor_roster"))
    return render_demo(row, current_task_id(row))


@app.get("/instructor/group/<int:gid>/<int:tid>")
@instructor_page
def instructor_demo_task(gid: int, tid: int):
    """Look at one group's answer to a particular assignment. Viewing does
    not move the group - they stay on whatever they have open."""
    row = group_by_id(gid)
    if row is None:
        return redirect(url_for("instructor_roster"))
    if task_by_id(tid) is None:
        return redirect(url_for("instructor_demo", gid=gid))
    return render_demo(row, tid)


def render_demo(row, tid):
    order = walk_order()
    position = next((i for i, r in enumerate(order) if r["id"] == row["id"]), 0)
    wrap = len(order) > 1

    def step(other):
        # keep looking at the same assignment as you step between groups
        return url_for("instructor_demo_task", gid=other["id"], tid=tid) \
            if tid is not None else url_for("instructor_demo", gid=other["id"])

    return render_template(
        "demo.html",
        group=row,
        code=code_for(row["id"], tid),
        task=task_by_id(tid),
        task_id=tid,
        tasks=all_tasks(),
        blocks=instruction_blocks(task_by_id(tid)["instructions"]) if task_by_id(tid) else [],
        viewing_their_page=tid == current_task_id(row),
        sections=grouped_groups(),
        position=position,
        total=len(order),
        prev_row=order[position - 1] if wrap else None,
        next_row=order[(position + 1) % len(order)] if wrap else None,
        prev_url=step(order[position - 1]) if wrap else None,
        next_url=step(order[(position + 1) % len(order)]) if wrap else None,
    )


@app.get("/api/instructor/groups")
@instructor_api
def api_groups():
    return jsonify(
        ok=True,
        sections=roster_sections(),
        group_count=len(all_groups()),
    )


@app.get("/api/instructor/groups/<int:gid>/<int:tid>")
@instructor_api
def api_group(gid: int, tid: int):
    row = group_by_id(gid)
    if row is None:
        return jsonify(ok=False, error="That group is gone."), 404
    sub = get_db().execute(
        "SELECT updated_at FROM submissions WHERE group_id = ? AND task_id = ?",
        (gid, tid),
    ).fetchone()
    stamp = sub["updated_at"] if sub else row["updated_at"]
    return jsonify(
        ok=True,
        id=row["id"],
        name=row["name"],
        code=code_for(gid, tid),
        updated_at=stamp,
        updated_human=humanize(stamp),
    )


@app.post("/api/instructor/groups/<int:gid>/<int:tid>")
@instructor_api
def api_group_write(gid: int, tid: int):
    """Push instructor edits back to the group. Deliberate, never automatic."""
    if group_by_id(gid) is None:
        return jsonify(ok=False, error="That group is gone."), 404

    data = request.get_json(silent=True) or {}
    code = data.get("code")
    if not isinstance(code, str):
        return jsonify(ok=False, error="Expected a 'code' string."), 400

    stamp = save_code(gid, tid, code[:MAX_CODE_LEN])
    return jsonify(ok=True, saved_at=stamp, updated_human=humanize(stamp))


@app.post("/instructor/group/<int:gid>/task")
@instructor_page
def group_set_task(gid: int):
    """Move one group onto a different assignment without touching anyone
    else. For the pair who are racing ahead."""
    if group_by_id(gid) is None:
        return redirect(url_for("instructor_roster"))
    raw = request.form.get("task_id", "")
    tid = int(raw) if raw.isdigit() and task_by_id(int(raw)) else None
    set_current_task(gid, tid)
    return redirect(url_for("instructor_demo", gid=gid))


# --------------------------------------------------------------------------
# tasks - the assignment and its starter code
# --------------------------------------------------------------------------

@app.get("/instructor/tasks")
@instructor_page
def tasks_index():
    return render_template(
        "tasks.html",
        tasks=[dict(r, groups=task_usage(r["id"])) for r in all_tasks()],
        group_count=len(all_groups()),
    )


@app.get("/instructor/tasks/new")
@instructor_page
def task_new():
    return render_template("task_edit.html", task=None, group_count=len(all_groups()))


@app.get("/instructor/tasks/<int:tid>")
@instructor_page
def task_edit(tid: int):
    row = task_by_id(tid)
    if row is None:
        return redirect(url_for("tasks_index"))
    return render_template(
        "task_edit.html",
        task=row,
        assigned=task_usage(tid),
        group_count=len(all_groups()),
    )


@app.post("/instructor/tasks")
@instructor_page
def task_create():
    title = (request.form.get("title") or "").strip()[:MAX_TITLE_LEN]
    instructions = (request.form.get("instructions") or "")[:MAX_INSTRUCTIONS_LEN]
    starter = (request.form.get("starter_code") or "")[:MAX_CODE_LEN]

    if not title:
        return render_template(
            "task_edit.html",
            task={"id": None, "title": title, "instructions": instructions,
                  "starter_code": starter},
            group_count=len(all_groups()),
            error="Give the task a title so you can find it later.",
        ), 400

    return redirect(url_for("task_edit", tid=create_task(title, instructions, starter)))


@app.post("/instructor/tasks/<int:tid>")
@instructor_page
def task_save(tid: int):
    if task_by_id(tid) is None:
        return redirect(url_for("tasks_index"))

    title = (request.form.get("title") or "").strip()[:MAX_TITLE_LEN]
    instructions = (request.form.get("instructions") or "")[:MAX_INSTRUCTIONS_LEN]
    starter = (request.form.get("starter_code") or "")[:MAX_CODE_LEN]

    if not title:
        return render_template(
            "task_edit.html",
            task={"id": tid, "title": title, "instructions": instructions,
                  "starter_code": starter},
            assigned=task_usage(tid),
            group_count=len(all_groups()),
            error="Give the task a title so you can find it later.",
        ), 400

    update_task(tid, title, instructions, starter)
    return redirect(url_for("task_edit", tid=tid))


@app.post("/instructor/tasks/<int:tid>/delete")
@instructor_page
def task_delete(tid: int):
    db = get_db()
    db.execute("UPDATE groups SET task_id = NULL WHERE task_id = ?", (tid,))
    db.execute("DELETE FROM tasks WHERE id = ?", (tid,))
    db.commit()
    return redirect(url_for("tasks_index"))


@app.post("/instructor/tasks/<int:tid>/assign")
@instructor_page
def task_assign(tid: int):
    """Move the whole class onto this assignment."""
    if task_by_id(tid) is None:
        return redirect(url_for("tasks_index"))

    wipe = request.form.get("mode") == "reset"
    db = get_db()
    cleared = 0
    for row in all_groups():
        db.execute("UPDATE groups SET task_id = ? WHERE id = ?", (tid, row["id"]))
        if wipe:
            db.execute("DELETE FROM submissions WHERE group_id = ? AND task_id = ?",
                       (row["id"], tid))
            cleared += 1
    db.commit()
    return redirect(url_for("task_edit", tid=tid, filled=cleared, assigned=1))


@app.post("/instructor/tasks/unassign")
@instructor_page
def task_unassign():
    db = get_db()
    db.execute("UPDATE groups SET task_id = NULL")
    db.commit()
    return redirect(url_for("tasks_index"))


init_db()


# --------------------------------------------------------------------------
# ngrok and startup
# --------------------------------------------------------------------------

def start_tunnel():
    """Open the public URL. Returns it, or None if we're staying local."""
    if not NGROK_AUTHTOKEN:
        print()
        print("  NO PUBLIC LINK - the authtoken slot is still empty.")
        print()
        print("  1. open https://dashboard.ngrok.com/get-started/your-authtoken")
        print("  2. copy the token")
        print("  3. open app.py, find NGROK_AUTHTOKEN near the top, paste it")
        print("     between the quotes, and save")
        print("  4. run this again")
        print()
        print("  Carrying on without it - the lab still works on this machine.")
        return None

    try:
        from pyngrok import ngrok
    except ImportError:
        print()
        print("  NO PUBLIC LINK - pyngrok is not installed. In Terminal:")
        print()
        print("      python3 -m pip install pyngrok")
        print()
        print("  then run this again. Or, if you already have the ngrok app,")
        print("  leave this running and open a second Terminal window:")
        print()
        print(f"      ngrok http --url={NGROK_DOMAIN} {PORT}")
        print()
        return None

    first_error = None
    try:
        ngrok.set_auth_token(NGROK_AUTHTOKEN)
        # "domain" is what current ngrok wants; "hostname" is the older name.
        for option in ("domain", "hostname"):
            try:
                tunnel = ngrok.connect(addr=str(PORT), proto="http",
                                       **{option: NGROK_DOMAIN})
                return tunnel.public_url
            except Exception as exc:
                first_error = first_error or exc
    except Exception as exc:
        first_error = exc

    print()
    print(f"  NGROK DID NOT START: {first_error}")
    print()
    print("  The usual causes, in order of likelihood:")
    print("    - the authtoken is wrong, or has a stray space or quote in it")
    print(f"    - {NGROK_DOMAIN}")
    print("      is not reserved on that ngrok account")
    print("    - an ngrok agent is already running. Close it, or in Terminal:")
    print("          pkill -f ngrok")
    print("    - the network blocked the download of ngrok itself, which")
    print("      school and campus wifi sometimes does")
    print()
    print("  You can also start the tunnel by hand. Leave this window running")
    print("  and open a second Terminal window:")
    print()
    print(f"      ngrok http --url={NGROK_DOMAIN} {PORT}")
    print()
    print("  Carrying on locally in the meantime.")
    return None


def lan_address():
    """This Mac's address on the classroom wifi. Nothing is actually sent -
    connecting a UDP socket just picks the interface with the default route."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


def banner(public_url):
    rule = "-" * 64
    base = public_url or f"http://localhost:{PORT}"
    print()
    print(rule)
    print("  Python Lab")
    print()
    print(f"  Students     {base}")
    print(f"  You          {base}/instructor")
    print(f"               password: {INSTRUCTOR_PASSWORD}")
    print()
    if public_url:
        print(f"  This machine http://localhost:{PORT}")
        print()
        print("  Write the student link on the board.")
        print()
        print("  The first visit on a free ngrok account shows a click-through")
        print("  page. Students press 'Visit Site' once and never see it again -")
        print("  worth warning them, or thirty hands go up at once.")
    else:
        here = lan_address()
        if here:
            print(f"  Same wifi   http://{here}:{PORT}")
            print(f"              http://{here}:{PORT}/instructor")
        else:
            print("  No network found, so this machine only.")
    print()
    print("  Ctrl+C in this window stops the server.")
    print("  Work is saved in " + DB_FILENAME + " and survives a restart.")
    print(rule)
    print()


def port_is_free(port: int) -> bool:
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def main():
    # Check before opening a tunnel, so we never point a public URL at a port
    # that isn't going to serve anything.
    if not port_is_free(PORT):
        print()
        print(f"  PORT {PORT} IS ALREADY BUSY.")
        print()
        print("  Usually an older copy of this still running. In Terminal:")
        print()
        print("      pkill -f app.py")
        print()
        print("  On a Mac, port 5000 is also used by AirPlay Receiver. Turn it")
        print("  off in System Settings > General > AirDrop & Handoff, or")
        print(f"  change PORT near the top of this file from {PORT} to {PORT + 1}.")
        print()
        return

    public_url = None
    if USE_NGROK and "--local" not in sys.argv:
        public_url = start_tunnel()

    banner(public_url)

    # Flask prints its own preamble and then a line per request. With
    # thirty students autosaving, that scrolls the URLs off the screen
    # within seconds, so quieten both and leave the banner above standing.
    import logging
    import flask.cli
    flask.cli.show_server_banner = lambda *a, **k: None
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    try:
        # debug=False on purpose: this is reachable from the internet, and the
        # Werkzeug debugger would hand a console to anyone who triggers an error.
        app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
    except KeyboardInterrupt:
        print("\n  Stopped.\n")
    finally:
        if public_url:
            try:
                from pyngrok import ngrok
                ngrok.kill()
            except Exception:
                pass


if __name__ == "__main__":
    main()
