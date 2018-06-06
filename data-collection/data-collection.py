import argparse
import subprocess
from subprocess import PIPE
import sys
import os
import time

TIMESTAMP = int(time.time())

parser = argparse.ArgumentParser(description="Run the alex data collection tool on a program")
parser.add_argument('test_program', help="the test program")
parser.add_argument('test_program_args', nargs=argparse.REMAINDER, help="args for the test program")
parser.add_argument('-a', '--alex', type=file, default="./alex.so", help="the location of the alex shared object")
parser.add_argument('-o', '--out', type=argparse.FileType('w'), default="out-%s" % TIMESTAMP, help="the file for stdout of the test program")
parser.add_argument('-e', '--err', type=argparse.FileType('w'), default="err-%s" % TIMESTAMP, help="the file for stderr of the test program")
parser.add_argument('-r', '--res', default="res-%s" % TIMESTAMP, help="the file for results of perf analyzer")
parser.add_argument('--echo-out', action='store_true', help="echo the stdout of the test program")
parser.add_argument('--echo-err', action='store_true', help="echo the stderr of the test program")
parser.add_argument('-i', '--input', metavar="in", type=file, default=PIPE, help="a file that should be piped into stdin of the test program")
args = parser.parse_args()

args.alex.close() # just used file type to check if it exists

class Tee(object):
  def __init__(self, *files):
    self.files = files
  def write(self, obj):
    for f in self.files:
      f.write(obj)
  def flush(self):
    for f in self.files:
      f.flush()

if args.echo_out:
  out = Tee(args.out, sys.stdout)
else:
  out = args.out

if args.echo_err:
  err = Tee(args.err, sys.stderr)
else:
  err = args.err

print("Running %s with args %s" % (args.test_program, args.test_program_args))
sub = subprocess.Popen([args.test_program] + args.test_program_args, stdout=out, stderr=err, stdin=args.input,
                       env={'LD_PRELOAD': args.alex.name, 'PERF_ANALYZER_RESULT_FILE': args.res})
sub.communicate()
print("Test program finished")
if sub.returncode == 0:
  print("Finished successfully!")
elif sub.returncode < 0:
  print("Exited by signal %s" % (sub.returncode * -1))
else:
  print("Exited with error code %s" % sub.returncode)

args.out.close()
args.err.close()
args.input.close()
