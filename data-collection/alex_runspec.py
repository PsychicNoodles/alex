import subprocess
import sys
import shlex
import os
import time

programs = {"milc"}

current_dir = os.getcwd()

for times in range(0,1):
    for n in programs:
        args = shlex.split ("runspec -a run -i ref -n 1 -c runspec_analyzer.cfg " + n)
        p = subprocess.Popen(args)
        p.wait()
        i = 0
        state = True
        while (state):
            try:
                f = open(os.path.join(current_dir, "runspec_results/result" + str(i) + ".txt"), 'r')
                count = 0
                for l in f:
                    if (count > 100):
                        break
                    count += 1
                f.close ()
                if count > 100:
                    eargs = shlex.split("mv " +
                            os.path.join(current_dir, "runspec_results/result" + str(i) + ".txt") + " " +
                            os.path.join(current_dir, "runspec_results/" + n + time.asctime(time.gmtime()).replace(' ','')+ ".txt"))
                    p = subprocess.Popen(eargs)
                    p.wait()
#                    eargs = shlex.split("Rscript /scratch/mahdigho/Workspace/Research/Charlie-2017/scrambler"\
#                    +"/analyzer/normal/runspec_analyzer.r " +\
#                    "/scratch/mahdigho/Workspace"\
#                    +"/Research/Charlie-2017/scrambler"\
#                    +"/analyzer/normal/runspec_results/" + n + str(times) + str(i))
#                    p = subprocess.Popen(eargs)
#                    p.wait()
                else:
                    eargs = shlex.split("rm " + os.path.join(current_dir, "runspec_results/result" + str(i) + ".txt"))
                    p = subprocess.Popen(eargs)
                    p.wait()
                i += 1
            except OSError:
                state = False
