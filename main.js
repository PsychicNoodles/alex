#!/usr/bin/env node

const yargs = require("yargs");
const { spawn } = require("child_process");
const fs = require("fs");
const readline = require("readline");
const tempFile = require("tempfile");
const path = require("path");
const prettyMS = require("pretty-ms");
const moment = require("moment");

process.on("unhandledRejection", err => {
  throw err;
});

const MIN_PERIOD = 1000000;

yargs
  .command(
    "list",
    "List available presets.",
    yargs => yargs.check(validateExtraPositionalArgs({ max: 1 })),
    list
  )
  .command(
    "collect <executable> [args..]",
    "Collect performance data on an executable.",
    yargs =>
      yargs
        .positional("executable", {
          description: "Executable file to profile.",
          type: "string"
        })
        .positional("args", {
          description: "Arguments to be passed to the executable.",
          type: "string"
        })
        .option("presets", {
          alias: "p",
          description:
            "Sensible performance metrics.  Use `list` command to see available presets.",
          type: "array",
          default: ["all"]
        })
        .option("events", {
          alias: "e",
          description: "A list of events to count.",
          type: "array",
          default: []
        })
        .option("in", {
          alias: "i",
          description: "The file to pipe into the stdin of <executable>.",
          type: "string"
        })
        .option("out", {
          description: "The file to pipe the stdout of <executable> into.",
          default: path.join(__dirname, "/out-$timestamp.log")
        })
        .option("err", {
          description: "The file to pipe the stderr of <executable> into.",
          default: path.join(__dirname, "/err-$timestamp.log")
        })
        .option("result", {
          description: "The file to pipe the performance results into.",
          default: path.join(__dirname, "/result-$timestamp.bin")
        })
        .option("visualize", {
          description: "Where to visualize the results.",
          choices: ["window", "no", "ask"],
          default: "ask"
        })
        .option("show-timer", {
          description: "Show a timer indicating the time spent collecting.",
          type: "boolean",
          default: true
        })
        .option("period", {
          description: `The period in CPU cycles.  Must be at least ${MIN_PERIOD}`,
          type: "number",
          default: 10000000
        })
        .check(argv => {
          if (argv.period < MIN_PERIOD) {
            throw new Error(
              `Invalid period: ${argv.period}.  Must be at least ${MIN_PERIOD}.`
            );
          } else {
            return true;
          }
        })
        .option("wattsup-device", {
          description:
            "Use `dmesg` after plugging in the device to see what the USB " +
            "serial port is detected at.",
          default: "ttyUSB0"
        })
        .example(
          "$0 collect --in my-input-file.in -p cache -- ./my-program --arg1 arg2"
        ),
    argv => {
      const timestampString = moment().format("YYYY-MM-DD" + "T" + "HH-mm-ss");
      const normalizeFileName = fileName =>
        fileName
          ? path.resolve(
              process.cwd(),
              fileName.replace("$timestamp", timestampString)
            )
          : undefined;

      collect({
        ...argv,
        inFile: argv.in ? path.resolve(process.cwd(), argv.in) : undefined,
        outFile: normalizeFileName(argv.out),
        errFile: normalizeFileName(argv.err),
        resultOption: normalizeFileName(argv.result),
        presets: argv.presets.filter(Boolean),
        events: argv.events.filter(Boolean),
        visualizeOption: argv.visualize,
        // Manually parse this out, since positional args can't handle "--xxx" args
        executableArgs: process.argv.includes("--")
          ? process.argv.slice(process.argv.indexOf("--") + 2)
          : argv.args
      });
    }
  )
  .command(
    "visualize <file>",
    "Visualize performance data from a file.",
    yargs =>
      yargs
        .positional("file", {
          description: "File to read result data from.",
          type: "string"
        })
        .option("heap-size", {
          description:
            "The maximum size of the JS heap in MB.  Increase if " +
            "visualization freezes while loading large data.",
          type: "number",
          default: 4096
        })
        .check(validateExtraPositionalArgs({ max: 1 })),
    argv => {
      visualize(argv.file, argv.heapSize);
    }
  )
  .command("*", false, yargs =>
    yargs.check(argv => {
      throw new Error(`Unknown command: ${argv._[0]}`);
    })
  )
  .demandCommand(1, "Must specify a command.")
  .check((argv, aliases) => {
    const validKeys = new Set([
      "$0",
      "_",
      ...Object.keys(aliases),
      ...Object.keys(aliases)
        .map(key => aliases[key])
        .reduce((a, b) => [...a, ...b])
    ]);

    const invalidKeys = Object.keys(argv).filter(key => !validKeys.has(key));
    if (invalidKeys.length > 0) {
      const firstInvalidArg =
        (invalidKeys[0].length === 1 ? "-" : "--") + invalidKeys[0];
      throw new Error(`Unknown argument: ${firstInvalidArg}`);
    }

    return true;
  })
  .help()
  .parse();

function validateExtraPositionalArgs({ max }) {
  return argv => {
    if (argv._.length > max) {
      throw new Error(`Unknown argument: ${argv._[1]}`);
    }

    return true;
  };
}

function getAllPresetInfo() {
  return new Promise((resolve, reject) => {
    let output = "";
    spawn(path.join(__dirname, "./collector/build/list-presets"))
      .on("error", reject)
      .stdout.on("data", chunk => {
        output += chunk;
      })
      .on("end", () => {
        try {
          resolve(
            JSON.parse(output).sort((a, b) => a.name.localeCompare(b.name))
          );
        } catch (err) {
          reject(err);
        }
      })
      .on("error", reject);
  });
}

async function list() {
  const presets = await getAllPresetInfo();
  const maxNameLength = Math.max(...presets.map(preset => preset.name.length));
  const presetToString = preset =>
    `  ${preset.name.padEnd(maxNameLength)}  ${preset.description || ""}`;

  console.info("Available Presets:");
  console.info(
    presetToString({
      name: "all",
      description: "Shortcut for all available presets."
    })
  );
  console.info(
    presets
      .filter(preset => preset.isAvailable)
      .map(presetToString)
      .join("\n")
  );
  console.info("");
  console.info("Unavailable Presets:");
  console.info(
    presets
      .filter(preset => !preset.isAvailable)
      .map(presetToString)
      .join("\n")
  );
}

async function collect({
  presets,
  events,
  resultOption,
  executable,
  executableArgs,
  period,
  inFile,
  outFile,
  errFile,
  visualizeOption,
  showTimer,
  wattsupDevice
}) {
  const resultFile = resultOption || tempFile(".bin");

  const allPresetInfo = await getAllPresetInfo();
  const presetsSet = new Set([
    ...presets.filter(preset => preset !== "all"),
    ...(presets.includes("all")
      ? allPresetInfo.filter(info => info.isAvailable).map(info => info.name)
      : [])
  ]);

  for (const preset of presetsSet) {
    const presetInfo = allPresetInfo.find(info => info.name === preset);
    if (!presetInfo) {
      console.error(`Invalid preset: ${preset}`);
      console.error("Try `alex list` to see a list of available presets.");
      process.exit(1);
    } else if (!presetInfo.isAvailable) {
      console.error(`Preset unavailable: ${preset}`);
      console.error("This is most likely due to a lack of hardware support.");
      console.error("Try `alex list` to see a list of available presets.");
      process.exit(1);
    }
  }

  let startTime = Date.now();
  let progressInterval;
  process.on("SIGUSR2", () => {
    console.info("Collecting performance data...");

    if (showTimer) {
      const MS_PER_SEC = 1000;
      startTime = Date.now();
      progressInterval = setInterval(() => {
        // Clear previous progress message
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        const time = prettyMS(Math.max(Date.now() - startTime, 0), {
          verbose: true,
          secDecimalDigits: 0
        });
        process.stdout.write(`It's been ${time}. Still going...`);
      }, 1 * MS_PER_SEC);
    }
  });

  console.info(
    "$ " +
      [executable, ...executableArgs].join(" ") +
      (inFile ? ` < ${inFile}` : "")
  );
  console.info("Waiting for collection to start...");

  const collector = spawn(executable, executableArgs, {
    env: {
      ...process.env,
      COLLECTOR_PERIOD: period,
      COLLECTOR_PRESETS: [...presetsSet].join(","),
      COLLECTOR_EVENTS: events.join(","),
      COLLECTOR_RESULT_FILE: resultFile,
      COLLECTOR_WATTSUP_DEVICE: wattsupDevice,
      COLLECTOR_NOTIFY_START: "yes",
      LD_PRELOAD: path.join(__dirname, "./collector/build/collector.so"),
      COLLECTOR_INPUT: inFile ? inFile : ""
    }
  });

  collector.on("error", err => {
    console.error(`Couldn't start collection: ${err.message}`);
    process.exit(1);
  });

  // Pipe through inputs and outputs

  if (inFile) {
    fs.createReadStream(inFile)
      .pipe(collector.stdin)
      .on("error", err =>
        console.error(`Problem connecting to program stdin: ${err.message}`)
      );
  } else {
    process.stdin.pipe(collector.stdin);
  }

  if (outFile) {
    collector.stdout
      .pipe(fs.createWriteStream(outFile))
      .on("error", err =>
        console.error(`Problem connecting to program stdout: ${err.message}`)
      );
  } else {
    collector.stdout.pipe(process.stdout);
  }

  if (errFile) {
    collector.stderr
      .pipe(fs.createWriteStream(errFile))
      .on("error", err =>
        console.error(`Problem connecting to program stderr: ${err.message}`)
      );
  } else {
    collector.stderr.pipe(process.stderr);
  }

  collector.on("exit", async code => {
    clearInterval(progressInterval);

    // Clear out progress message
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    const timeSpent = prettyMS(Date.now() - startTime, { verbose: true });
    console.info(`Finished after collecting for ${timeSpent}.`);

    const errorCodes = {
      1: "Internal error.",
      2: "There was a problem with the result file.",
      3: "There was a problem with the executable file.",
      4: "There was a problem with the debug symbols file.",
      5: "There was a problem accessing an environment variable.",
      6: "There was a problem opening the event name.",
      7: "Invalid parameter(s) for collector"
    };

    if (code in errorCodes) {
      console.error(errorCodes[code]);
      console.error(`Check ${errFile || "error logs"} for details`);
    } else {
      if (resultOption) {
        console.info(`Results saved to ${resultFile}`);
      }

      if (visualizeOption === "window") {
        visualize(resultFile);
      } else if (visualizeOption === "ask") {
        const readlineInterface = readline.createInterface(
          process.stdin,
          process.stdout
        );

        readlineInterface.question(
          "Would you like to see a visualization of the results ([yes]/no)? ",
          answer => {
            if (answer !== "no") {
              visualize(resultFile);
            }

            readlineInterface.close();
          }
        );
      } else if (visualizeOption === "no") {
        process.exit(0);
      }
    }
  });
}

function visualize(resultFile, heapSize) {
  spawn(
    path.join(__dirname, "./node_modules/.bin/electron"),
    [path.join(__dirname, "./visualizer"), resultFile, heapSize],
    { stdio: ["ignore", "inherit", "ignore"] }
  );
}
