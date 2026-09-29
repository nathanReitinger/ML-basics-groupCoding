# START HERE — macOS

Your domain is already set: **stroller-coastal-earthly.ngrok-free.dev**

---

## Step 1 — paste your authtoken

Open **app.py** in any editor. Near the top you will see this:

```python
#   PASTE YOUR NGROK AUTHTOKEN ON THE NEXT LINE AND YOU ARE DONE.
NGROK_AUTHTOKEN = ""
```

Get the token from https://dashboard.ngrok.com/get-started/your-authtoken,
paste it between the quotes, and save:

```python
NGROK_AUTHTOKEN = "2abcDEFghiJKLmnoPQRstuVWXyz_1A2b3C4d5E6f7G8h9"
```

That is the only edit you have to make.

---

## Step 2 — start it

**Double-click `start.command`.**

The first time, macOS may refuse to open it because it came from the internet.
If it does: **right-click the file → Open → Open**. You only have to do that
once.

That is the whole thing. The first run takes a minute while it sets itself up,
and every run after is instant.

### Or from Terminal, if you prefer

Copy these four lines in one go. The first two only ever need running once.

```bash
cd ~/Downloads/python-lab
python3 -m venv .venv
./.venv/bin/python -m pip install flask pyngrok
./.venv/bin/python app.py
```

Afterwards, starting it again is just:

```bash
cd ~/Downloads/python-lab
./.venv/bin/python app.py
```

---

## Step 3 — read the URLs off the screen

```
----------------------------------------------------------------
  Python Lab

  Students     https://stroller-coastal-earthly.ngrok-free.dev
  You          https://stroller-coastal-earthly.ngrok-free.dev/instructor
               password: admin

  This machine http://localhost:5000
----------------------------------------------------------------
```

Write the student link on the board. Press **Ctrl+C** in the Terminal window
to stop the server at the end of class.

---

## Before the first class

Two things worth doing while nobody is watching.

**Warm the cache.** Open the student link yourself and press Run on assignment
3. The first run downloads Python-in-the-browser and scikit-learn, which takes
a while on a cold cache. Doing it once beforehand means you are not watching a
progress bar in front of thirty people.

**Warn them about the ngrok splash.** The first visit on a free ngrok account
shows a click-through page. Students press **Visit Site** once and never see it
again — but tell them beforehand, or thirty hands go up at the same moment.

---

## When something goes wrong

**"Port 5000 is already busy"**

An older copy is still running. In Terminal:

```bash
pkill -f app.py
```

Then start it again. If that does not do it, macOS itself may be using port
5000 for AirPlay Receiver — turn it off in **System Settings → General →
AirDrop & Handoff → AirPlay Receiver**, or change `PORT = 5000` near the top of
`app.py` to `5001`.

**"NGROK DID NOT START"**

The message tells you which of the three usual causes it was. Most often it is
a stray space or quote in the pasted token. If an old tunnel is stuck:

```bash
pkill -f ngrok
```

**You would rather use the ngrok app directly**

If you already have ngrok installed, you do not need pyngrok at all. Set
`USE_NGROK = False` in `app.py`, start the lab, then in a **second** Terminal
window:

```bash
brew install ngrok
ngrok config add-authtoken YOUR_TOKEN_HERE
ngrok http --url=stroller-coastal-earthly.ngrok-free.dev 5000
```

**"python3: command not found"**

macOS keeps Python behind the developer tools. In Terminal:

```bash
xcode-select --install
```

Click through the installer, then try again.

**Working offline, no public link**

```bash
./.venv/bin/python app.py --local
```

Everything still works; students on the same wifi reach you at your Mac's LAN
address instead, which the banner prints.

---

## Starting the class over

Group work lives in `lab.db`, next to `app.py`. Delete that file and everything
resets — groups, code, and the three assignments reload from `starters/`.

```bash
cd ~/Downloads/python-lab
rm lab.db
```
