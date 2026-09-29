#!/bin/bash
#
#  Python Lab - double-click this file to start.
#
#  macOS opens .command files in Terminal. The first run makes a private
#  Python environment inside this folder and installs two packages into
#  it; after that it just starts.
#
#  Nothing is installed system-wide. Delete the .venv folder to undo it.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  Python Lab"
echo "  ----------"
echo ""

# --- is python3 here at all? ------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  echo "  python3 is not installed."
  echo ""
  echo "  macOS ships it with the developer tools. In Terminal, run:"
  echo ""
  echo "      xcode-select --install"
  echo ""
  echo "  click through the installer, then double-click this file again."
  echo ""
  read -r -p "  Press return to close. "
  exit 1
fi

# --- private environment, made once -----------------------------------
if [ ! -d ".venv" ]; then
  echo "  First run. Setting up (this takes a minute)..."
  echo ""
  python3 -m venv .venv || {
    echo ""
    echo "  Could not create the environment. Try in Terminal:"
    echo "      python3 -m pip install --user virtualenv"
    read -r -p "  Press return to close. "
    exit 1
  }
  ./.venv/bin/python -m pip install --quiet --upgrade pip
  ./.venv/bin/python -m pip install --quiet flask pyngrok || {
    echo ""
    echo "  Could not install the packages. Are you online?"
    read -r -p "  Press return to close. "
    exit 1
  }
  echo "  Done. That only happens once."
  echo ""
fi

# Check the packages every time, not just when the folder is new. The
# first version only installed on first run, so anyone who upgraded kept
# an environment missing whatever the new version needed - and the only
# symptom was a feature quietly not working.
if ! ./.venv/bin/python -c "import flask, pyngrok" >/dev/null 2>&1; then
  echo "  Fetching a missing package..."
  ./.venv/bin/python -m pip install --quiet flask pyngrok
  echo ""
fi

# --- is the authtoken in yet? -----------------------------------------
if ! grep -q 'NGROK_AUTHTOKEN = "..*"' app.py; then
  echo "  Note: no ngrok authtoken in app.py yet, so there will be no"
  echo "  public link. The lab still works on this machine."
  echo ""
fi

./.venv/bin/python app.py "$@"

echo ""
read -r -p "  Stopped. Press return to close this window. "
