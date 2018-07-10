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

ipcMain.on("result-request", event => {
  event.sender.send("result", resultFile);
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

app
  // This event fires when Electron has finished initialization and is ready to
  // create browser windows. Some APIs can only be used after this event occurs.
  .on("ready", async () => {
    console.info("Creating window...");

    win = new BrowserWindow({
      width: 860,
      height: 900,
      minWidth: 600,
      show: false,
      icon: path.join(__dirname, "./icons/launcher-128x128.png")
    });

    win.loadFile(path.join(__dirname, "./index.html"));

    win
      .on("ready-to-show", () => {
        win.show();
      })

      .on("closed", () => {
        // Dereference the window object so it can be garbage collected
        win = null;
      });
  })

  .on("window-all-closed", () => {
    app.quit();
  });
