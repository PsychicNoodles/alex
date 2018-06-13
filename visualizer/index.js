const { app, BrowserWindow } = require("electron");

const resultFile = process.argv[2];
console.log(`Reading from ${resultFile}`);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

// This event fires when Electron has finished initialization and is ready to
// create browser windows. Some APIs can only be used after this event occurs.
app.on("ready", () => {
  win = new BrowserWindow({ width: 1000, height: 820 });
  win.loadFile(`${__dirname}/index.html`);

  win.on("closed", () => {
    // Dereference the window object so it can be garbage collected
    win = null;
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
