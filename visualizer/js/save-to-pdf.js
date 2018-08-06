const d3 = require("d3");
const { remote } = require("electron");
const { promisify } = require("util");
const fs = require("fs");

const stream = require("./stream");

const listenerSubscription = d3.local();

/**
 * @param {d3.Selection} root
 */
function render(root) {
  stream
    .fromDOMEvent(root.node(), "click")
    .pipe(
      stream.debounceMap(() => {
        const browserWindow = remote.getCurrentWindow();
        const webContents = remote.getCurrentWebContents();
        const printToPDF = promisify(webContents.printToPDF.bind(webContents));
        const writeFile = promisify(fs.writeFile);

        return stream
          .fromAsyncThunk(
            () =>
              new Promise(resolve => {
                remote.dialog.showSaveDialog(browserWindow, {}, resolve);
              })
          )
          .pipe(
            stream.mergeMap(fileName =>
              stream
                .fromAsyncThunk(async () => {
                  if (fileName) {
                    try {
                      const data = await printToPDF({});
                      await writeFile(fileName, data);
                      return {
                        isSaving: false,
                        message: { ok: true, text: `Saved to ${fileName}` }
                      };
                    } catch (err) {
                      return {
                        isSaving: false,
                        message: { ok: false, text: err.message }
                      };
                    }
                  } else {
                    return { isSaving: false, message: null };
                  }
                })
                .pipe(stream.startWith({ isSaving: true, message: null }))
            )
          )
          .pipe(
            stream.mergeMap(state => {
              if (state.message) {
                return stream
                  .fromTimeout(2000)
                  .pipe(stream.startWith(state))
                  .pipe(stream.endWith({ ...state, message: null }));
              } else {
                return stream.fromValue(state);
              }
            })
          );
      })
    )
    .pipe(stream.startWith({ isSaving: false, message: null }))
    .pipe(
      stream.subscribeUnique(
        root,
        listenerSubscription,
        ({ isSaving, message }) => {
          root
            .classed("save-to-pdf", true)
            .property("disabled", isSaving)
            .classed("save-to-pdf--saving", isSaving)
            .classed("save-to-pdf--ok", message ? message.ok : true)
            .attr("data-message", message ? message.text : null);
        }
      )
    );
}

module.exports = { render };
