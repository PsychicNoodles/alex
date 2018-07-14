#!/usr/bin/env node

const yargs = require("yargs");
const { spawn } = require("child_process");
const fs = require("fs");
const readline = require("readline");
const tempFile = require("tempfile");
const path = require("path");
const ProgressBar = require("progress");
const { promisify } = require("util");
const progressStream = require("progress-stream");
const { parser: streamJSONParser } = require("stream-json");
const { stringer: streamJSONStringer } = require("stream-json/Stringer");
const StreamJSONAssembler = require("stream-json/Assembler");

process.on("unhandledRejection", err => {
  throw err;
});

yargs
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
          description: "Sensible performance metrics.",
          type: "array",
          default: ["all"]
        })
        .option("events", {
          alias: "e",
          description: "A list of events to count.",
          type: "array"
        })
        .describe("in", "The file to pipe into the stdin of <executable>.")
        .option("out", {
          description: "The file to pipe the stdout of <executable> into.",
          default: `out-${Date.now()}.log`
        })
        .option("err", {
          description: "The file to pipe the stderr of <executable> into.",
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
        })
        .option("wattsupDevice", {
          description:
            'Use "dmesg" after plugging in the device to see what the USB serial port is detected at.',
          default: "ttyUSB0"
        }),
    argv => {
      collect({
        ...argv,
        inFile: argv.in,
        outFile: argv.out,
        errFile: argv.err,
        resultOption: argv.result,
        events: argv.events || [],
        executableArgs: argv.args,
        visualizeOption: argv.visualize
      });
    }
  )
  .command(
    "visualize <file>",
    "Visualize performance data from a file.",
    yargs =>
      yargs.positional("file", {
        description: "File to read result data from.",
        type: "string"
      }),
    argv => {
      visualize(argv.file);
    }
  )
  .demandCommand()
  .help().argv;

function collect({
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
  wattsupDevice
}) {
  const rawResultFile = tempFile(".json");
  const resultFile = resultOption || tempFile(".json");

  console.info("Collecting performance data...");

  const MS_PER_SEC = 1000;
  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const numSeconds = Math.round((Date.now() - startTime) / MS_PER_SEC);
    const s = numSeconds === 1 ? "" : "s";

    // Clear previous progress message
    process.stdout.clearLine();
    process.stdout.cursorTo(0);

    process.stdout.write(`It's been ${numSeconds} second${s}. Still going...`);
  }, 1 * MS_PER_SEC);

  const collector = spawn(executable, executableArgs, {
    env: {
      ...process.env,
      COLLECTOR_PERIOD: period,
      COLLECTOR_PRESETS: presets.join(","),
      COLLECTOR_EVENTS: events.join(","),
      COLLECTOR_RESULT_FILE: rawResultFile,
      COLLECTOR_WATTSUP_DEVICE: wattsupDevice,
      LD_PRELOAD: path.join(__dirname, "./collector/collector.so")
    }
  });

  // Keep track so we can wait on this before quitting
  Promise.all([
    new Promise(resolve => collector.stdout.on("end", resolve)),
    new Promise(resolve => collector.stderr.on("end", resolve))
  ]);

  // Pipe through inputs and outputs

  if (inFile) {
    const fileStream = fs.createReadStream(inFile);
    fileStream.on("open", () => {
      fileStream.pipe(collector.stdin);
    });
  } else {
    process.stdin.pipe(collector.stdin);
  }

  if (outFile) {
    const fileStream = fs.createWriteStream(outFile);
    fileStream.on("open", () => {
      collector.stdout.pipe(fileStream);
    });
  } else {
    collector.stdout.pipe(process.stdout);
  }

  if (errFile) {
    const fileStream = fs.createWriteStream(errFile);
    fileStream.on("open", () => {
      collector.stderr.pipe(fileStream);
    });
  } else {
    collector.stderr.pipe(process.stderr);
  }

  collector.on("exit", async code => {
    clearInterval(progressInterval);

    const numSeconds = (Date.now() - startTime) / MS_PER_SEC;

    // Clear out progress message
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.info(`Finished after collecting for ${numSeconds} seconds.`);

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
      const { size: resultFileSize } = await promisify(fs.stat)(rawResultFile);
      console.log(resultFileSize);

      const progressBar = new ProgressBar(
        "Processing Results [:bar] :percent",
        {
          complete: "#",
          width: 20,
          total: resultFileSize
        }
      );

      let resultsProcessed = false;
      try {
        await new Promise((resolve, reject) => {
          const tokenStream = fs
            .createReadStream(rawResultFile)
            .pipe(
              progressStream(
                { length: resultFileSize, time: 100 },
                ({ delta }) => {
                  progressBar.tick(delta);
                }
              )
            )
            .pipe(streamJSONParser())
            .on("error", reject);

          const LARGE_FILE_SIZE = 0x10000000; // 256 MB
          if (resultFileSize > LARGE_FILE_SIZE) {
            // If it is a large file, don't stringify it all at once.
            tokenStream
              .pipe(streamJSONStringer())
              .on("error", reject)
              .pipe(fs.createWriteStream(resultFile))
              .on("finish", resolve)
              .on("error", reject);
          } else {
            // If it isn't huge, we can afford to load it into memory and stringify it
            StreamJSONAssembler.connectTo(tokenStream)
              .on("done", ({ current }) => {
                fs.writeFile(
                  resultFile,
                  JSON.stringify(current, null, 2),
                  err => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve();
                    }
                  }
                );
              })
              .on("error", reject);
          }
        });
        resultsProcessed = true;
      } catch (err) {
        console.error(`Couldn't process result file: ${err.message}`);
        fs.copyFileSync(rawResultFile, resultFile);
      }

      if (resultOption) {
        console.info(`Results saved to ${resultFile}`);
      }

      if (resultsProcessed) {
        if (visualizeOption === "window") {
          visualize(resultFile);
        } else if (visualizeOption === "ask") {
          const readline_interface = readline.createInterface(
            process.stdin,
            process.stdout
          );
          readline_interface.question(
            "Would you like to see a visualization of the results ([yes]/no)? ",
            answer => {
              if (answer !== "no") {
                visualize(resultFile);
              }

              readline_interface.close();
            }
          );
        }
      }
    }
  });
}

function visualize(resultFile) {
  spawn(
    path.join(__dirname, "./node_modules/.bin/electron"),
    [path.join(__dirname, "./visualizer"), resultFile],
    { stdio: "inherit" }
  );
}
