# Assignment 1 - Hardcoded
#
# A NAND gate takes two inputs and gives back one answer. Each input is
# either 0 or 1. The name is short for "not and", and the rule is:
#
#       the output is 1, UNLESS both inputs are 1
#
# NAND is worth knowing. Every chip in every computer you have ever
# used is built out of these, and nothing else.
#
# THE ASSIGNMENT: there are only four possible inputs, so write all
# four answers down in the table below. Every row says None. Work each
# one out and replace the None with a 0 or a 1.
#
# How to read a row. Each key is a pair of inputs, and the value after
# the colon is the output:
#
#       (  input_x , input_y ):  output
#
#       input_x    the first input, 0 or 1
#       input_y    the second input, 0 or 1
#       output     what the gate answers, 0 or 1
#
# So the first row reads "when input_x is 0 and input_y is 0, the gate
# answers ___". Both inputs are not 1, so by the rule above that answer
# is 1. Write it in, then do the other three.
#
# Press Run any time. The checker walks the four rows one at a time and
# marks each one, so you can go a row at a time if you like.


# ======================================================================
#  YOUR WORK
# ======================================================================

NAND = {
    #  input_x, input_y :  output
    (     0   ,    0    ):  None,   ## TODO
    (     0   ,    1    ):  None,   ## TODO
    (     1   ,    0    ):  None,   ## TODO
    (     1   ,    1    ):  None,   ## TODO
}


# ======================================================================
#  STOP HERE. This part just checks your work.
# ======================================================================

import asyncio

TICK = "\u2713"
CROSS = "\u2717"


def rule(a, b):
    """Not both."""
    if a == 1 and b == 1:
        return 0
    return 1


async def check():
    passed = 0
    print("CHECKING YOUR TABLE")

    for inputs in NAND:
        a = inputs[0]
        b = inputs[1]
        yours = NAND[inputs]
        right = rule(a, b)

        print("")
        print(f"  A = {a}, B = {b}")
        print(f"    both inputs 1?   {'yes' if a == 1 and b == 1 else 'no'}")
        await asyncio.sleep(0.25)
        print(f"    so the answer is {right}")

        if yours is None:
            print(f"    your table says  nothing yet")
            print(f"    {CROSS} still says None")
        elif yours == right:
            passed = passed + 1
            print(f"    your table says  {yours}")
            print(f"    {TICK} pass")
        else:
            print(f"    your table says  {yours}")
            print(f"    {CROSS} wrong")
        await asyncio.sleep(0.25)

    print("")
    print(f"  {passed} of 4 passed")
    return passed


async def the_catch():
    print("")
    print("-" * 56)
    print("Your table is finished. All four inputs, all four answers.")
    print("")
    await asyncio.sleep(0.5)
    print("Now we put the gate in an actual circuit. Real wires carry")
    print("voltages, not perfect 0s and 1s, so the reading comes back")
    print("as 0.98 and 0.03 instead of 1 and 0.")
    print("")
    await asyncio.sleep(0.5)
    print("That is obviously a 1 and a 0. Let's look it up.")
    print("")
    try:
        print("  the table says:", NAND[(0.98, 0.03)])
    except KeyError:
        print("  KeyError: (0.98, 0.03)")
        print("")
        print("  The table did not say no. It had nothing to say at all.")
        print("  It knows four inputs and nothing else, and there are")
        print("  infinitely many readings a real wire can give you.")


score = await check()

if score == 4:
    await the_catch()
    print("")
    print("  A table cannot do this. A rule can. That is assignment 2.")
    celebrate("All four correct. Now for a rule instead of a table.")
