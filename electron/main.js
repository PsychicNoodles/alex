const { app, BrowserWindow } = require("electron");
const yargs = require("yargs");
const { spawn } = require("child_process");
const fs = require("fs");

const { argv } = yargs
  .usage("usage: alex -- <executable> [<executable args>...]")
  .default("out", `out-${Date.now()}.log`)
  .default("err", `err-${Date.now()}.log`);

const executable = argv._[0];
const executableArgs = argv._.slice(1);

const dataCollector = spawn(executable, executableArgs, {
  env: {
    ...process.env,
    ALEX_PERIOD: Math.pow(10, 7),
    ALEX_EVENTS: "MEM_LOAD_RETIRED.L3_MISS",
    LD_PRELOAD: "../data-collection/alex.so",
    ALEX_RESULT_FILE: `./result-${Date.now()}.json`
  }
});

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
    createWindow();
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
