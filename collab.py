"""
Live editing over plain HTTP.

Every (group, assignment) pair is a room holding a numbered list of
edits. There is one operation, and it does both halves of the job at
once: here is my edit, now give me everything I have not seen. A
keystroke and a refresh are the same request.

    POST /api/doc/3   {"since": 41, "update": "<base64>"}
    ->                {"seq": 43, "updates": ["<base64>", ...]}

No sockets. The first version of this used WebSockets and needed an
extra package to work; when that package was missing the page quietly
fell back to editing alone, and the only symptom was having to refresh
to see anybody else. Polling cannot fail that way - if the request
works at all, the sync works.

The edits themselves are opaque here. The browsers hold the document in
Yjs, which merges two people typing in the same line at the same moment
into one answer they both arrive at, so this end never has to decide
who wins.
"""

import threading
import time

_rooms = {}
_lock = threading.RLock()


class Room:
    def __init__(self, key):
        self.key = key
        self.edits = []          # edit N is at index N - 1
        self.dirty = False
        self.seeded = False      # has the starter text been put in
        self.visitors = {}       # token -> last seen, for the headcount

    # --- storage -------------------------------------------------------

    def blob(self):
        """The whole log as one length-prefixed BLOB for the docstate row."""
        out = bytearray()
        for chunk in self.edits:
            out += len(chunk).to_bytes(4, "big") + chunk
        return bytes(out)

    def load(self, blob):
        self.edits = []
        i = 0
        while i + 4 <= len(blob):
            size = int.from_bytes(blob[i:i + 4], "big")
            i += 4
            if i + size > len(blob):
                break                     # truncated; keep what is readable
            self.edits.append(blob[i:i + size])
            i += size
        self.seeded = bool(self.edits)

    # --- the one operation ---------------------------------------------

    def exchange(self, since, update, token):
        """Take an edit if there is one, hand back everything after
        `since`. Returns (seq, [edits], people_here)."""
        with _lock:
            if since < 0:
                since = 0
            if since > len(self.edits):
                since = len(self.edits)    # a client from a reset room

            # read before writing, so nobody is handed their own edit back
            waiting = self.edits[since:]

            if update:
                self.edits.append(update)
                self.dirty = True

            if token:
                self.visitors[token] = time.time()
                stale = [t for t, seen in self.visitors.items()
                         if time.time() - seen > 12]
                for t in stale:
                    del self.visitors[t]

            return len(self.edits), waiting, len(self.visitors)

    def replace_with(self, update):
        """One client has sent the whole document, so the log of single
        keystrokes can be thrown away and replaced by it."""
        with _lock:
            self.edits = [update]
            self.dirty = True
            return len(self.edits)

    def claim_seed(self):
        """True for exactly one caller: whoever should insert the starter
        text. Everyone else waits for it to arrive."""
        with _lock:
            if self.seeded:
                return False
            self.seeded = True
            return True


def room_for(group_id, task_id, read_blob):
    key = (int(group_id), int(task_id))
    with _lock:
        room = _rooms.get(key)
        if room is None:
            room = Room(key)
            stored = read_blob(key[0], key[1])
            if stored:
                room.load(stored)
            _rooms[key] = room
        return room


def pending_saves():
    with _lock:
        return [(r.key, r.blob()) for r in _rooms.values() if r.dirty]


def mark_saved(keys):
    with _lock:
        for key in keys:
            room = _rooms.get(key)
            if room:
                room.dirty = False


def drop_idle():
    """Forget rooms nobody has touched for a while, whose edits are
    already on disk, so a long day does not slowly fill memory."""
    with _lock:
        for key in [k for k, r in _rooms.items()
                    if not r.dirty and not r.visitors]:
            del _rooms[key]


def headcount():
    with _lock:
        return {key: len(room.visitors) for key, room in _rooms.items()}
