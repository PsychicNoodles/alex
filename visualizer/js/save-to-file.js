const d3 = require("d3");
const { remote } = require("electron");
const { promisify } = require("util");
const fs = require("fs");

const stream = require("./stream");
const programInfo = require("./program-info");

const listenerSubscription = d3.local();

/**
 * @param {d3.Selection} root
 * @param {Object} props
 * @param {string} props.fileType
 * @param {string} props.filePrefix
 * @param {() => Promise<string>} props.generateFileData
 */
function render(root, { fileType, filePrefix = "", generateFileData }) {
  stream
    .fromDOMEvent(root.node(), "click")
    .pipe(
      stream.debounceMap(() =>
        stream
          .fromAsyncThunk(
            () =>
              new Promise(resolve => {
                remote.dialog.showSaveDialog(
                  remote.getCurrentWindow(),
                  {
                    defaultPath: getDefaultFilename(filePrefix, fileType),
                    filters: [{ extensions: [fileType] }]
                  },
                  resolve
                );
              })
          )
          .pipe(
            stream.mergeMap(fileName =>
              stream.fromAsyncThunk(async () => {
                if (fileName) {
                  try {
                    const data = await generateFileData();
                    await promisify(fs.writeFile)(fileName, data);
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
          )
      )
    )
    .pipe(stream.startWith({ isSaving: false, message: null }))
    .pipe(
      stream.subscribeUnique(
        root,
        listenerSubscription,
        ({ isSaving, message }) => {
          root
            .classed("save-to-file", true)
            .property("disabled", isSaving)
            .classed("save-to-file--ok", message ? message.ok : true)
            .attr("data-message", message ? message.text : null);
        }
      )
    );
}

function getDefaultFilename(prefix, fileType) {
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

  return `alex${programNamePrefix}${prefix}_${dateString}.${fileType}`;
}

module.exports = { render };
