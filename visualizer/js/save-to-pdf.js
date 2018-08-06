const d3 = require("d3");
const { remote } = require("electron");
const { promisify } = require("util");
const fs = require("fs");

const stream = require("./stream");
const programInfo = require("./program-info");

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
          .fromAsyncThunk(async () => {
            const dataPromise = printToPDF({
              pageSize: "Letter",
              printBackground: true
            });

            const fileNamePromise = new Promise(resolve => {
              remote.dialog.showSaveDialog(
                browserWindow,
                {
                  defaultPath: getDefaultFilename(),
                  filters: [{ extensions: ["pdf"] }]
                },
                resolve
              );
            });

            return {
              data: await dataPromise,
              fileName: await fileNamePromise
            };
          })
          .pipe(
            stream.mergeMap(({ data, fileName }) =>
              stream.fromAsyncThunk(async () => {
                if (fileName) {
                  try {
                    await writeFile(fileName, data);
                    return {
                      isSaving: false,
                      message: { ok: true, text: "Saved", duration: 2000 }
                    };
                  } catch (err) {
                    return {
                      isSaving: false,
                      message: {
                        ok: false,
                        text: err.message,
                        duration: 6000
                      }
                    };
                  }
                } else {
                  return { isSaving: false, message: null };
                }
              })
            )
          )
          .pipe(
            stream.startWith({
              isSaving: true,
              message: { ok: true, text: "Saving...", duration: Infinity }
            })
          )
          .pipe(
            stream.mergeMap(state => {
              if (state.message) {
                return stream
                  .fromTimeout(state.message.duration)
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
            .classed("save-to-pdf--ok", message ? message.ok : true)
            .attr("data-message", message ? message.text : null);
        }
      )
    );
}

function getDefaultFilename() {
  const { programName } = programInfo.store.getState();
  const programNamePrefix = programName
    ? "-" +
      programName
        .split("/")
        .reverse()
        .filter(Boolean)[0]
    : "";
  const dateString = new Date()
    .toISOString()
    .replace(":", "-")
    .replace(/\.\d{3}/, "");

  return `alex${programNamePrefix}_${dateString}.pdf`;
}

module.exports = { render };
