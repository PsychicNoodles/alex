//
// visualizer/index.js
// Electron app main file.
//

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

console.info("Starting app...");

const resultFile = process.argv[2];
if (!resultFile) {
  throw new Error("No result file specified.");
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

const heapSize = process.argv[3] || 4096;
app.commandLine.appendSwitch("js-flags", `--max-old-space-size=${heapSize}`);

ipcMain.on("result-request", event => {
  event.sender.send("result", resultFile);
});

app
  // This event fires when Electron has finished initialization and is ready to
  // create browser windows. Some APIs can only be used after this event occurs.
  .on("ready", () => {
    console.info("Creating window...");

    win = new BrowserWindow({
      width: 960,
      height: 900,
      minWidth: 600,
      show: false,
      icon: path.join(__dirname, "./icons/launcher-64x64.png")
    });

    win.loadFile(path.join(__dirname, "./index.html"));

    Promise.all([
      new Promise(resolve => ipcMain.on("result-request", resolve)),
      new Promise(resolve => win.on("ready-to-show", resolve))
    ]).then(() => {
      win.show();
    });

    win.on("closed", () => {
      // Dereference the window object so it can be garbage collected
      win = null;
    });
  })

  .on("window-all-closed", () => {
    app.quit();
  });
