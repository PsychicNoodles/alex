import argparse
import subprocess
from subprocess import PIPE
import sys
import os
import time

error = {1: "Could not kill parent.",
         2: "Could not fork.",
         3: "Could not open file to write results.",
         4: "Could not open perf event.",
         5: "Could not make file descriptor for instruction counter.",
         6: "Could not set file descriptor to ASYNC mode.",
         7: "Could not set signal to file descriptor.",
         8: "Could not set file descriptor to owner.",
         9: "Could not empty sigset.",
         10: "Could not add to sigset.",
         11: "Could not open file descriptor buffer.",
         12: "Could not open semaphores.",
         13: "Could not control perf event."}

TIMESTAMP = int(time.time())

parser = argparse.ArgumentParser(
    description="Run the alex data collection tool on a program")
parser.add_argument('test_program', help="the test program")
parser.add_argument('test_program_args', nargs=argparse.REMAINDER, help="args for the test program")
parser.add_argument('-e', '--event', nargs=1, action='append', required=True, dest="event", help="events to be traced from `perf list`")
parser.add_argument('-p', '--period', default='8', choices=[str(i) for i in range(6, 13)], help="period of instructions (ten to the power of period)")
parser.add_argument('-a', '--alex', type=argparse.FileType(), default="./alex.so", help="the location of the alex shared object")
parser.add_argument('--out', type=argparse.FileType('w'), default="out-%s.log" % TIMESTAMP, help="the file for stdout of the test program")
parser.add_argument('--err', type=argparse.FileType('w'), default="err-%s.log" % TIMESTAMP, help="the file for stderr of the test program")
parser.add_argument('-r', '--res', default="res-%s.json" % TIMESTAMP, help="the file for results of perf analyzer")
parser.add_argument('--echo-out', action='store_true', help="echo the stdout of the test program")
parser.add_argument('--echo-err', action='store_true', help="echo the stderr of the test program")
parser.add_argument('-i', '--input', metavar="in", type=argparse.FileType(), default=PIPE, help="a file that should be piped into stdin of the test program")
args = parser.parse_args()

args.alex.close()  # just used file type to check if it exists


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

env = {
    'ALEX_PERIOD': str(10 ** int(args.period)),
    'ALEX_EVENTS': ','.join(map(lambda x: x[0], args.event)),
    'LD_PRELOAD': args.alex.name,
    'ALEX_RESULT_FILE': args.res
}

print("Running %s with args %s" % (args.test_program, args.test_program_args))
sub = subprocess.Popen([args.test_program] + args.test_program_args, stdout=out, stderr=err, stdin=args.input,
                       env=dict(os.environ.items() + env.items()))
sub.communicate()
print("Test program finished")
if sub.returncode == 0:
    print("Finished successfully!")
elif sub.returncode < 0:
    print("Exited by signal %s" % (sub.returncode * -1))
else:
    print("Exited with error code %s: %s" %
          (sub.returncode, error.get(sub.returncode, "undefined")))

args.out.close()
args.err.close()
if isinstance(args.input, file):
    args.input.close()
