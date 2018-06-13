const yargs = require("yargs");
const { spawn } = require("child_process");
const fs = require("fs");
const readline = require("readline");
const tempfile = require("tempfile");

const { argv } = yargs
  .usage("usage: alex [OPTIONS] -- EXECUTABLE [EXECUTABLE_ARGS...]")
  .option("preset", {
    alias: "p",
    description: "Sensible performance metrics.",
    choices: ["cpu", "cache"],
    default: "cpu"
  })
  .option("events", {
    alias: "e",
    description: "A list of events to count.",
    type: "array"
  })
  .describe("in", "The file to pipe into the stdin of EXECUTABLE.")
  .option("out", {
    description: "The file to pipe the stdout of EXECUTABLE into.",
    default: `out-${Date.now()}.log`
  })
  .option("err", {
    description: "The file to pipe the stderr of EXECUTABLE into.",
    default: `err-${Date.now()}.log`
  })
  .option("result", {
    description: "The file to pipe the performance results into.",
    default: `result-${Date.now()}.json`
  })
  .option("visualize", {
    description: "Where to visualize the results.",
    choices: ["window", "no", "ask"],
    default: "ask"
  })
  .option("period", {
    description: "The period in CPU cycles",
    type: "number",
    default: 10000000
  });

collect();

function collect() {
  const executable = argv._[0];
  const executableArgs = argv._.slice(1);

  let presetEvents = [];
  if (argv.preset === "cpu") {
    presetEvents = [];
  } else if (argv.preset === "cache") {
    presetEvents = ["MEM_LOAD_RETIRED.L3_MISS", "MEM_LOAD_RETIRED.L3_HIT"];
  } else {
    console.error("Invalid preset:", preset);
  }

  const otherEvents = argv.events || [];

  const resultFile = argv.result || tempfile(".json");

  const collector = spawn(executable, executableArgs, {
    env: {
      ...process.env,
      COLLECTOR_PERIOD: argv.period,
      COLLECTOR_EVENTS: [...presetEvents, ...otherEvents].join(","),
      COLLECTOR_RESULT_FILE: resultFile,
      LD_PRELOAD: `${__dirname}/collector/collector.so`
    }
  });

  // Keep track so we can wait on this before quitting
  const collectorDone = Promise.all([
    new Promise(resolve => collector.stdout.on("end", resolve)),
    new Promise(resolve => collector.stderr.on("end", resolve))
  ]);

  // Pipe through inputs and outputs

  if (argv.in) {
    const fileStream = fs.createReadStream(argv.in);
    fileStream.on("open", () => {
      fileStream.pipe(collector.stdin);
    });
  } else {
    process.stdin.pipe(collector.stdin);
  }

  if (argv.out) {
    const fileStream = fs.createWriteStream(argv.out);
    fileStream.on("open", () => {
      collector.stdout.pipe(fileStream);
    });
  } else {
    collector.stdout.pipe(process.stdout);
  }

  if (argv.err) {
    const fileStream = fs.createWriteStream(argv.err);
    fileStream.on("open", () => {
      collector.stderr.pipe(fileStream);
    });
  } else {
    collector.stderr.pipe(process.stderr);
  }

  collector.on("exit", code => {
    const errorCodes = {
      1: "Could not kill parent.",
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
      13: "Could not control perf event."
    };

    if (code in errorCodes) {
      console.error(errorCodes[code]);
    } else {
      console.info("Successfully collected data.");
      if (argv.result) {
        console.info(`Results saved to ${resultFile}`);
      }

      if (argv.visualize === "window") {
        visualize(resultFile);
      } else if (argv.visualize === "ask") {
        const interface = readline.createInterface(
          process.stdin,
          process.stdout
        );
        interface.question(
          "Would you like to see a visualization of the results ([yes]/no)? ",
          answer => {
            if (answer !== "no") {
              visualize(resultFile);
            }

            interface.close();
          }
        );
      }
    }
  });
}

function visualize(resultFile) {
  spawn(
    `${__dirname}/node_modules/.bin/electron`,
    [`${__dirname}/visualizer`, resultFile],
    { stdio: "ignore" }
  );
}
