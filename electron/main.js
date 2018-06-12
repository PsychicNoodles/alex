const { app, BrowserWindow } = require("electron");
const yargs = require("yargs");
const { spawn } = require("child_process");
const fs = require("fs");
const readline = require("readline");

const { argv } = yargs
  .usage("usage: alex [OPTIONS] -- EXECUTABLE [EXECUTABLE_ARGS...]")
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
    default: 1000000
  })
  .option("events", {
    alias: "e",
    description: "A list of events to count.",
    type: "array",
    demandOption: true
  });

// Create child process

const executable = argv._[0];
const executableArgs = argv._.slice(1);

const dataCollector = spawn(executable, executableArgs, {
  env: {
    ...process.env,
    ALEX_PERIOD: argv.period,
    ALEX_EVENTS: argv.events.join(","),
    ALEX_RESULT_FILE: argv.result,
    LD_PRELOAD: "../data-collection/alex.so"
  }
});

// Pipe through inputs and outputs

if (argv.in) {
  const fileStream = fs.createReadStream(argv.in);
  fileStream.on("open", () => {
    fileStream.pipe(dataCollector.stdin);
  });
} else {
  process.stdin.pipe(dataCollector.stdin);
}

if (argv.out) {
  const fileStream = fs.createWriteStream(argv.out);
  fileStream.on("open", () => {
    dataCollector.stdout.pipe(fileStream);
  });
} else {
  dataCollector.stdout.pipe(process.stdout);
}

if (argv.err) {
  const fileStream = fs.createWriteStream(argv.err);
  fileStream.on("open", () => {
    dataCollector.stderr.pipe(fileStream);
  });
} else {
  dataCollector.stderr.pipe(process.stderr);
}

dataCollector.on("exit", code => {
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
    console.info(`Results saved to ${argv.result}`);

    if (argv.visualize === "window") {
      createWindow();
    } else if (argv.visualize === "ask") {
      const interface = readline.createInterface(process.stdin, process.stdout);
      interface.question(
        "Would you like to see a visualization of the results (yes/no)? ",
        answer => {
          if (answer === "no") {
            console.info("Exiting.");
            app.quit();
            process.exit();
          } else {
            createWindow();
          }

          interface.close();
        }
      );
    }
  }
});

// Electron Setup

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
const appReady = new Promise(resolve => app.on("ready", resolve));

async function createWindow() {
  await appReady;

  win = new BrowserWindow({ width: 1520, height: 820 });
  win.loadFile("../visualizer/index.html");

  win.on("closed", () => {
    // Dereference the window object so it can be garbage collected
    win = null;
  });

  return win;
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});
