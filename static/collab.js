/* ------------------------------------------------------------------
   Live editing, over ordinary HTTP.

   One request does both halves of the job: here is what I just typed,
   now give me everything I have not seen yet. A keystroke and a
   catch-up are the same call, which is the whole point - there is no
   separate "listen" channel that can quietly stop working and leave
   somebody pressing refresh.

   The document itself lives in Yjs. When two people type in the same
   line at the same moment it merges their edits into one answer both
   of them arrive at, so the server never has to referee.
   ------------------------------------------------------------------ */

window.Collab = (function () {
  "use strict";

  var TYPING_FLUSH = 120;    // ms after a keystroke before sending
  var IDLE_POLL = 500;       // ms between checks when nobody is typing
  var SNAPSHOT_EVERY = 120;  // edits, before we collapse the log
  var GIVE_UP_AFTER = 4;     // failed requests before we say so

  function b64encode(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return window.btoa(out);
  }

  function b64decode(text) {
    var raw = window.atob(text);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function create(options) {
    var editor = options.editor;
    var url = options.url;
    var detached = !!options.detached;      // sync, but leave the editor alone
    var onStatus = options.onStatus || function () {};
    var onPeople = options.onPeople || function () {};

    var L = window.Ylab;
    if (!L || !url) {
      onStatus("offline");
      return null;
    }

    var doc = new L.Y.Doc();
    var text = doc.getText("code");
    var binding = null;
    var seq = 0;
    var outbox = [];
    var sending = false;
    var stopped = false;
    var failures = 0;
    var started = false;
    var sinceSnapshot = 0;
    var flushTimer = null;
    var me = String(Math.random()).slice(2) + String(Date.now()).slice(-4);

    /* Our own edits queue up. Edits arriving from the server are applied
       with origin "remote", so this does not send them straight back. */
    doc.on("update", function (update, origin) {
      if (origin === "remote") return;
      outbox.push(update);
      soon();
    });

    function soon() {
      if (flushTimer || stopped) return;
      flushTimer = window.setTimeout(function () {
        flushTimer = null;
        exchange();
      }, TYPING_FLUSH);
    }

    function merge(updates) {
      if (!updates || !updates.length) return;
      for (var i = 0; i < updates.length; i++) {
        try {
          L.Y.applyUpdate(doc, b64decode(updates[i]), "remote");
        } catch (ignored) {}
      }
    }

    function attach() {
      if (detached || binding) return;
      binding = new L.CodemirrorBinding(text, editor);
    }

    async function exchange(extra) {
      if (stopped || sending) return;
      sending = true;

      // everything typed since the last call goes in one update
      var mine = outbox.length ? L.Y.mergeUpdates(outbox) : null;
      var pending = outbox;
      outbox = [];

      var body = { since: seq, me: me };
      if (mine) body.update = b64encode(mine);
      if (extra) Object.assign(body, extra);

      try {
        var res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var data = await res.json();

        failures = 0;
        seq = data.seq;
        merge(data.updates);
        sinceSnapshot += (data.updates ? data.updates.length : 0) + (mine ? 1 : 0);

        if (!started) {
          started = true;
          // Exactly one person is told to put the starter text in. Everyone
          // else waits for it, rather than pushing their own copy over it.
          if (data.seed && text.length === 0) {
            text.insert(0, editor.getValue());
          }
          attach();
        }

        onStatus("live");
        onPeople({ here: data.here || 1 });

        if (sinceSnapshot > SNAPSHOT_EVERY) {
          sinceSnapshot = 0;
          collapse();
        }
      } catch (err) {
        // put the edits back so nothing is lost while we are offline
        outbox = pending.concat(outbox);
        failures += 1;
        if (failures >= GIVE_UP_AFTER) {
          onStatus("offline");
          if (!started) { started = true; attach(); }   // let them work alone
        } else {
          onStatus("reconnecting");
        }
      } finally {
        sending = false;
      }
    }

    async function collapse() {
      // hand over the whole document so the server can throw away its
      // list of individual keystrokes
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ whole: b64encode(L.Y.encodeStateAsUpdate(doc)) })
        });
        seq = 1;
      } catch (ignored) {}
    }

    // The steady heartbeat. This is what makes the page update itself:
    // it runs whether or not anybody is typing, so a change somebody
    // else made always turns up within half a second.
    var beat = window.setInterval(function () {
      if (stopped || document.hidden) return;
      exchange();
    }, IDLE_POLL);

    exchange({ ask_seed: true });

    return {
      text: function () { return text.toString(); },
      replaceAll: function (next) {
        doc.transact(function () {
          text.delete(0, text.length);
          text.insert(0, next);
        });
        exchange();          // push it now rather than on the next beat
      },
      stop: function () {
        stopped = true;
        window.clearInterval(beat);
        if (flushTimer) window.clearTimeout(flushTimer);
        if (binding) binding.destroy();
      }
    };
  }

  return { create: create };
})();
