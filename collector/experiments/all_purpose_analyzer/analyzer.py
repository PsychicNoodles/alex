import subprocess
import sys
import shlex
import os
import argparse

args = sys.argv

error = {1:"Could not kill parent.", 2:"Could not fork.",
		3:"Could not open file to write results.",
		4:"Could not open perf event.",
		5:"Could not make file descriptor for instruction counter.",
		6:"Could not set file descriptor to ASYNC mode.",
		7:"Could not set signal to file descriptor.",
		8:"Could not set file descriptor to owner.",
		9:"Could not empty sigset.",
		10:"Could not add to sigset.",
		11:"Could not open file descriptor buffer."}

anParser = argparse.ArgumentParser(
					usage = 'analyzer [program ...] [-h] [-n ...] [-e ...] [-f ...] [-d ...]',
					description='Analyze a program using the given events')

anParser.add_argument('program', nargs = '+',
					help = 'The program to be analyzed')
anParser.add_argument('-n', '--number', nargs = '?', const = '1', default = '1',
					choices = ['1', '2', '3'],
					help = 'The number of events to be analyzed, max of 3. \n Default is set to 1.',
					dest = 'count')
anParser.add_argument('--destination', '-d', nargs = '?', const = './',
					default = './', help = 'The destination to record the results. \n Default is set to current directory',
					dest = 'destination')
anParser.add_argument('-f', '--frequency', nargs = '?', const = '7',
					default = '7', help = 'The frequency of instructions, as ten to the power of enter number. \n Default is set to 7.',
					dest = 'frequency', choices = [str(i) for i in range(6, 13)])
anParser.add_argument('-e', '--event', nargs = 1, action = 'append',
					help = 'The events to be traced. Up to three. The flag has to be used for each individual event.',
					required = True, dest = "event")

args = anParser.parse_args(args)
my_env = os.environ.copy()
my_env['exe_path'] = args.program.pop(0)
my_env['number'] = args.count
my_env['destination'] = args.destination
my_env['frequency'] = str(10**int(args.frequency))
for i in range(0, int(args.count)):
	 my_env['event'+str(i)] = args.event[i][0]

my_env["LD_PRELOAD"] = "./analyzer.so"
p = subprocess.Popen(args.program, env = my_env)

p.wait()

if p.returncode != 0:
	print("{0}".format(error[p.returncode]))
	#in this case delete file maybe?
	#TODO: make the error value an environment variable so that you can also
	#	also check for program return values
