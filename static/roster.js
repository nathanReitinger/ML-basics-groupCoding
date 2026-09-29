/* ------------------------------------------------------------------
   Instructor roster. Polls for changes so new groups and fresh edits
   appear without a reload, laid out task by task.
   ------------------------------------------------------------------ */

(function () {
  "use strict";

  var cfg = window.ROSTER || {};
  var root = document.getElementById("roster");
  var countEl = document.getElementById("count");
  var pulseEl = document.getElementById("pulse");
  var emptyEl = document.getElementById("empty");

  var seen = {};            // group id -> updated_at, so only real changes flash
  var lastSignature = null; // skip the rebuild when nothing moved

  document.querySelectorAll(".group-card").forEach(function (card) {
    seen[card.dataset.id] = card.dataset.updated;
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function card(group, isFresh) {
    var li = el("li", "group-card" + (isFresh ? " is-fresh" : ""));
    li.dataset.id = group.id;
    li.dataset.updated = group.updated_at;

    var link = el("a", "group-open");
    link.href = group.url;

    var chip = el("span", "chip");
    chip.appendChild(el("span", "chip-band", "group"));
    chip.appendChild(el("span", "chip-name", group.name));
    link.appendChild(chip);

    link.appendChild(el("span", "group-facts", group.started
      ? plural(group.lines, "line") + ", edited " + group.updated_human
      : "hasn't started yet"));
    li.appendChild(link);

    if (group.progress && group.progress.length) {
      var dots = el("span", "dots");
      dots.title = "which assignments they have touched";
      group.progress.forEach(function (step) {
        var dot = el("a", "dot" + (step.started ? " is-done" : "") +
                          (step.current ? " is-here" : ""), String(step.n));
        dot.href = step.url;
        dot.title = step.title;
        dots.appendChild(dot);
      });
      li.appendChild(dots);
    }

    if (group.preview) li.appendChild(el("pre", "group-preview", group.preview));

    var open = el("a", "btn btn-run group-run", "Open and run");
    open.href = group.url;
    li.appendChild(open);
    return li;
  }

  function section(data) {
    var wrap = el("section", "tasksection");
    wrap.dataset.task = data.id === null ? "none" : data.id;

    var head = el("div", "tasksection-head");
    head.appendChild(el("h2", "tasksection-title", data.title));
    head.appendChild(el("span", "tasksection-count", plural(data.groups.length, "group")));
    if (data.url) {
      var edit = el("a", "tasksection-edit", "Edit task");
      edit.href = data.url;
      head.appendChild(edit);
    }
    wrap.appendChild(head);

    if (!data.groups.length) {
      wrap.appendChild(el("p", "tasksection-empty", "Nobody on this one."));
      return wrap;
    }

    var list = el("ul", "roster");
    data.groups.forEach(function (group) {
      var known = Object.prototype.hasOwnProperty.call(seen, group.id);
      var moved = !known || seen[group.id] !== group.updated_at;
      list.appendChild(card(group, moved));
      seen[group.id] = group.updated_at;
    });
    wrap.appendChild(list);
    return wrap;
  }

  function signature(sections) {
    return sections.map(function (s) {
      return s.id + ":" + s.title + ":" + s.groups.map(function (g) {
        return g.id + "@" + g.updated_at + "@" + g.updated_human + "@" +
               g.progress.map(function (p) { return (p.started ? 1 : 0) + (p.current ? "c" : ""); }).join("");
      }).join(",");
    }).join("|");
  }

  function render(sections, groupCount) {
    // Rebuilding every few seconds would flicker and swallow clicks, so only
    // touch the DOM when something actually moved.
    var sig = signature(sections);
    if (sig === lastSignature) return;
    lastSignature = sig;

    countEl.textContent = plural(groupCount, "group");
    emptyEl.hidden = groupCount > 0;

    var fragment = document.createDocumentFragment();
    sections.forEach(function (data) { fragment.appendChild(section(data)); });
    root.replaceChildren(fragment);
  }

  async function poll() {
    if (document.hidden) return;
    try {
      var res = await fetch(cfg.groupsUrl, { headers: { Accept: "application/json" } });
      if (res.status === 403) {
        pulseEl.textContent = "signed out, reload to sign back in";
        return;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      render(data.sections || [], data.group_count || 0);
      pulseEl.textContent = "updating live";
    } catch (err) {
      pulseEl.textContent = "not updating, check the connection";
    }
  }

  setInterval(poll, cfg.pollMs || 4000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) poll();
  });
  poll();
})();
