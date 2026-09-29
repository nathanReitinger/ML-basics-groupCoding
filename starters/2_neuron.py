# Assignment 2 - Variables
#
# Same NAND gate. Here is the whole truth table, which you worked out
# for yourself in assignment 1:
#
#       input_x   input_y   |   output
#       -----------------------------
#          0         0      |     1
#          0         1      |     1
#          1         0      |     1
#          1         1      |     0
#
# "Not and": the output is 1 unless both inputs are 1.
#
# THE ASSIGNMENT: get that same table out of three numbers instead of
# four written-down answers.
#
# Below is a worked example for a DIFFERENT gate, so you can see the
# shape of the thing. It is an AND gate. It is finished and correct,
# and it is not the gate you have to build.
#
#
#     def and_gate_formula(input_x, input_y):
#       '''function used to give correct output'''
#
#       ## we are 'experts' and therefore know the bias term and weights
#       bias     = -2
#       weight_1 = 1
#       weight_2 = 1
#
#       ## a sum of bias, weight_1 times input_x, weight_2 times input_y
#       answer = bias + (input_x * weight_1) + (input_y * weight_2)
#
#       ## and here is the activation function
#       if answer < 0:   ## if the sum is less than 0, output 0
#         return 0
#       if answer >= 0:  ## if the sum is 0 or more, output 1
#         return 1
#
#
# Now write the same thing for NAND. The activation function is done
# for you, because it is the same for every gate. You write the three
# numbers, and the line that adds them up.


def nand_gate_formula(input_x, input_y):
  '''function used to give correct output'''

  ## TODO 1 of 2 -- these three numbers are wrong. Work them out.
  ##                (the AND example above shows what they look like
  ##                 when they are right, but its numbers are not yours)
  bias     = 0
  weight_1 = 0
  weight_2 = 0

  ## TODO 2 of 2 -- replace the 0 below with the actual sum:
  ##                the bias, plus weight_1 times input_x,
  ##                plus weight_2 times input_y.
  ##
  ##                While it says 0, this gate ignores its inputs and
  ##                answers the same thing every time. Both TODOs have
  ##                to be done before anything works.
  answer = 0

  ## and here is the activation function
  if answer < 0:   ## if the sum is less than 0, output 0
    return 0
  if answer >= 0:  ## if the sum is 0 or more, output 1
    return 1


print("input (0,0) gives output:", nand_gate_formula(0, 0))
print("input (0,1) gives output:", nand_gate_formula(0, 1))
print("input (1,0) gives output:", nand_gate_formula(1, 0))
print("input (1,1) gives output:", nand_gate_formula(1, 1))


# ======================================================================
#  STOP HERE. This part just checks your work.
# ======================================================================

import asyncio

TICK = "\u2713"
CROSS = "\u2717"
CASES = [(0, 0), (0, 1), (1, 0), (1, 1)]
WANT = [1, 1, 1, 0]          ## NAND: 1 unless both inputs are 1


def formula_is_written():
  """If the four inputs never change the answer, the sum is still 0."""
  answers = [nand_gate_formula(x, y) for x, y in CASES]
  return len(set(answers)) > 1


async def check():
  if not formula_is_written():
    print("")
    print("  " + "=" * 56)
    print("  TODO 2 IS NOT DONE YET")
    print("  " + "=" * 56)
    print("")
    print("  Your gate gives the same answer for all four inputs, so the")
    print("  inputs are not reaching it. There are only two ways that")
    print("  happens, so check both:")
    print("")
    print("    1. the answer line still says")
    print("")
    print("           answer = 0")
    print("")
    print("       which ignores the inputs completely. It has to become")
    print("       the real sum: the bias, plus each input times its own")
    print("       weight.")
    print("")
    print("    2. weight_1 and weight_2 are both still 0, so both inputs")
    print("       get multiplied away to nothing before they arrive.")
    print("")
    await asyncio.sleep(0.3)

  print("")
  print("CHECKING YOUR GATE")
  print("")
  print("     x  y     you say     NAND says")
  passed = 0
  yours = []
  for (x, y), want in zip(CASES, WANT):
    got = nand_gate_formula(x, y)
    yours.append(got)
    mark = TICK if got == want else CROSS
    if got == want:
      passed = passed + 1
    print(f"  {mark}  {x}  {y}        {got}            {want}")
    await asyncio.sleep(0.2)
  print("")
  print(f"  {passed} of 4 passed")
  return passed, yours


def hint(yours):
  print("")
  print("HINT")

  if len(set(yours)) == 1:
    print("  See the box at the top: TODO 2 is the thing to fix. The")
    print("  shape you need is in the AND example, two screens up.")
    return

  if yours == [0, 0, 0, 1]:
    print("  That is an AND gate - you have built the example. NAND is the")
    print("  opposite of it: 1 where AND gives 0, and 0 where AND gives 1.")
    print("  Try flipping the signs of all three numbers.")
    return

  if yours == [1, 1, 1, 1]:
    print("  Your gate never says 0. The bias is holding the sum up too")
    print("  high for the inputs to pull it back under. Either lower the")
    print("  bias or make the weights more negative.")
    return

  print("  The sum has to land above 0 for three of the four rows and")
  print("  below 0 for the last one. Write out what your three numbers")
  print("  give for each row and see which one is on the wrong side.")
  print("")
  print("     x=0 y=0   ->   bias                        must be 0 or more")
  print("     x=1 y=0   ->   bias + weight_1             must be 0 or more")
  print("     x=1 y=1   ->   bias + weight_1 + weight_2  must be BELOW 0")


def finish():
  print("")
  print("-" * 56)
  print("Three numbers and one line, and the gate is solved.")
  print("")
  print("Now the thing the table could not do. Those real voltages from")
  print("assignment 1, which were never in any table:")
  print("")

  probes = [(0.98, 0.03), (0.97, 0.96), (0.02, 0.04)]
  wanted = [1, 0, 1]
  got = [nand_gate_formula(x, y) for x, y in probes]

  for (x, y), out in zip(probes, got):
    print(f"   input ({x}, {y}) gives output: {out}")
  print("")

  if got == wanted:
    print("All three right, and not one of them was ever written down.")
    print("The rule just works on numbers it has never seen.")
    return

  print("Some of those are wrong, and it is worth understanding why,")
  print("because your three numbers ARE a correct NAND gate for clean")
  print("0s and 1s - the checker above says so.")
  print("")

  ## (1, 0) passes, but a hair of the second input flips it, which can
  ## only happen if the sum for that row is sitting exactly on zero
  on_the_edge = (nand_gate_formula(1, 0) == 1
                 and nand_gate_formula(1, 0.01) == 0)

  if on_the_edge:
    print("Try it yourself. Feed the gate (1, 0) and it answers")
    print(f"{nand_gate_formula(1, 0)}. Now feed it (1, 0.01) - barely any")
    print(f"different - and it answers {nand_gate_formula(1, 0.01)}.")
    print("")
    print("That tiny nudge flips it, which means the sum for input")
    print("(1, 0) is landing on exactly zero. Your gate passes that row")
    print("only because the activation says '0 or more', so it scrapes")
    print("through on the boundary itself. Any real reading dips under.")
    print("")
    print("There is a RANGE of numbers that work here, not one answer.")
    print("You picked one from the edge of the range. Take one from the")
    print("middle instead - nudge the bias up by half - and run again.")
  else:
    print("Look at which ones failed and work out the sum by hand for")
    print("those inputs. Something is landing on the wrong side of zero.")


score, yours = await check()

if score == 4:
  finish()
  celebrate("Three numbers beat the table. Next: a gate they cannot do.")
else:
  hint(yours)
