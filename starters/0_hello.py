# Assignment 0 - Hello
#
# Nothing hard here. This one exists so you can check that the editor,
# the Run button and the output panel all work before anything matters.
#
# THE ASSIGNMENT: make the computer say something.
#
# The line below calls print, which puts text on the screen. The
# brackets are empty, so at the moment it prints nothing at all.
#
# Put some words inside the brackets, between quote marks, like this:
#
#       print("good morning")
#
# Then press the green Run button, or Ctrl+Enter.


print()


# ======================================================================
#  STOP HERE. This part just checks your work.
# ======================================================================

import asyncio

TICK = "\u2713"
CROSS = "\u2717"


async def check():
    said = lab_output().strip()

    print("CHECKING")
    print("")
    await asyncio.sleep(0.3)

    if said == "":
        print(f"  {CROSS} nothing came out")
        print("")
        print("  Your print has nothing in its brackets, so there is")
        print("  nothing for it to say. Put some words in, inside quote")
        print("  marks, and run it again:")
        print("")
        print('      print("good morning")')
        return False

    print(f"  {TICK} the computer said: {said}")
    await asyncio.sleep(0.3)
    print(f"  {TICK} the editor works")
    await asyncio.sleep(0.3)
    print(f"  {TICK} the Run button works")
    await asyncio.sleep(0.3)
    print(f"  {TICK} the output panel works")
    print("")
    print("  All four. Everything on this page is doing its job.")
    return True


worked = await check()

if worked:
    print("")
    print("-" * 56)
    print("Three things worth knowing before you go on:")
    print("")
    print("  1. The Instructions button at the top right opens a panel")
    print("     with notes for each assignment. It starts closed so the")
    print("     code has room.")
    print("  2. The two A buttons beside it make everything bigger or")
    print("     smaller. Use them.")
    print("  3. Ctrl+Enter runs your code without touching the mouse.")
    celebrate("It works. On to the first real one.")
