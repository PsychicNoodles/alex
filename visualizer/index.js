//
// visualizer/index.js
// Electron app main file.
//

const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");

const resultFile = process.argv[2];
if (!resultFile) {
  throw new Error("No result file specified.");
}

const result = JSON.parse(fs.readFileSync(resultFile).toString());

ipcMain.on("result-request", event => {
  event.sender.send("result", result);
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

app
  // This event fires when Electron has finished initialization and is ready to
  // create browser windows. Some APIs can only be used after this event occurs.
  .on("ready", async () => {
    win = new BrowserWindow({ width: 1000, height: 820, show: false });

    win.loadFile(`${__dirname}/index.html`);

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
