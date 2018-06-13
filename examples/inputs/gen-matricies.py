import sys
import random

if len(sys.argv) < 4:
  print("Usage: %s output-name matrix-rows matrix-cols" % sys.argv[0])
  sys.exit(1)

def calc(rows, cols):
  out.write("%s %s\n" % (rows, cols))
  for _ in range(rows):
    line = ""
    for _ in range(cols):
      line += str(random.randint(1, cols)) + " "
    out.write(line[:-1] + "\n")

with open(sys.argv[1], "w") as out:
  calc(int(sys.argv[2]), int(sys.argv[3])) 
  calc(int(sys.argv[2]), int(sys.argv[3])) 
