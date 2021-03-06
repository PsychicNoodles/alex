const { ipcRenderer, remote } = require("electron");
const d3 = require("d3");
const fs = require("fs");
const progressStream = require("progress-stream");
const protobufStream = require("./protobuf-stream");
const { Header, Timeslice, Warning } = protobufStream;
const { promisify } = require("util");

const { processData, getEventCount, sdDomain } = require("./process-data");
const { analyze } = require("./analysis");
const chart = require("./chart");
const functionRuntimes = require("./function-runtimes");
const warningList = require("./warning-list");
const stats = require("./stats");
const programInfo = require("./program-info");
const brushes = require("./brushes");
const sourceSelect = require("./source-select");
const threadSelect = require("./thread-select");
const tableSelect = require("./table-select");
const chartsSelect = require("./charts-select");
const overflowDropdown = require("./overflow-dropdown");
const warnings = require("./warnings");
const progressBar = require("./progress-bar");
const saveToFile = require("./save-to-file");
const stream = require("./stream");
const { Store } = require("./store");

const loadingProgressStore = new Store({
  percentage: 0,
  progressBarIsVisible: true
});

loadingProgressStore.subscribe(({ percentage, progressBarIsVisible }) => {
  const roundedPercentage = Math.round(percentage);
  d3.select("#progress").call(progressBar.render, {
    percentage,
    roundedPercentage,
    text:
      roundedPercentage === 100 ? "Processing Data..." : "Reading Result File",
    isVisible: progressBarIsVisible
  });
});

d3.select("#save-to-pdf").call(saveToFile.render, {
  fileType: "pdf",
  generateFileData: () => {
    const webContents = remote.getCurrentWebContents();
    const printToPDF = promisify(webContents.printToPDF.bind(webContents));
    return printToPDF({
      pageSize: "Letter",
      printBackground: true
    });
  }
});

d3.select("#overflow-dropdown").call(overflowDropdown.render);
d3.select("#table-select").call(tableSelect.render);

ipcRenderer.send("result-request");
ipcRenderer.on("result", async (event, resultFile) => {
  let protobufMessageStream;
  try {
    const { size: resultFileSize } = await promisify(fs.stat)(resultFile);

    protobufMessageStream = fs
      .createReadStream(resultFile)
      .pipe(
        progressStream(
          {
            length: resultFileSize,
            time: 100
          },
          ({ percentage }) => {
            loadingProgressStore.dispatch(state => ({
              ...state,
              percentage
            }));
          }
        )
      )
      .pipe(protobufStream.parser());
  } catch (err) {
    alert(`Couldn't load result file: ${err.message}`);
    window.close();
  }

  /** @type {Promise<{events: string[], presets: Object}>} */
  const headerPromise = new Promise((resolve, reject) => {
    let didReceiveData = false;
    protobufMessageStream
      .once("data", d => {
        // should always be a header, but verify anyway
        if (d instanceof Header) {
          didReceiveData = true;
          resolve(d);
        } else {
          reject(new Error("File must begin with a header."));
        }
      })
      .on("end", () => {
        if (!didReceiveData) {
          reject(new Error("No header found in file."));
        }
      })
      .on("error", reject);
  });

  const timeslicesPromise = new Promise((resolve, reject) => {
    const timeslices = [];
    return protobufMessageStream
      .on("data", d => {
        if (d instanceof Timeslice) timeslices.push(d);
      })
      .on("end", () => resolve(timeslices))
      .on("error", reject);
  });

  const warningsPromise = new Promise((resolve, reject) => {
    const warnings = [];
    protobufMessageStream
      .on("data", d => {
        if (d instanceof Warning) warnings.push(d);
      })
      .on("end", () => resolve(warnings))
      .on("error", reject);
  });

  Promise.all([headerPromise, timeslicesPromise, warningsPromise]).catch(
    err => {
      alert(err);
      window.close();
    }
  );

  headerPromise.then(header => programInfo.store.dispatch(() => header));

  loadingProgressStore.stream
    .pipe(stream.filter(state => !state.progressBarIsVisible))
    .pipe(stream.take(1))
    .pipe(stream.mergeMap(() => stream.fromPromise(headerPromise)))
    .pipe(
      stream.subscribe(header => {
        d3.select("#program-info").call(programInfo.render, header);
      })
    );

  const [timeslices, header] = await Promise.all([
    timeslicesPromise,
    headerPromise
  ]);

  const PROGRESS_BAR_TRANSITION_DURATION = 250;
  await new Promise(resolve =>
    setTimeout(resolve, PROGRESS_BAR_TRANSITION_DURATION)
  );

  const processedData = processData(timeslices, header);

  const spectrum = d3.interpolateWarm;
  const sdRange = 3;

  const timeslicesLength = (await timeslicesPromise).length;
  if (processedData.length <= 10) {
    alert(
      timeslicesLength <= 10
        ? timeslicesLength === 0
          ? "No data in result file.  Perhaps the program terminated too quickly."
          : "Too little data in result file. Perhaps the program terminated too quickly."
        : "No usable data in result file."
    );
    window.close();
  } else {
    //progress bar
    loadingProgressStore.dispatch(state => ({
      ...state,
      progressBarIsVisible: false
    }));

    //set up xAxis elements,vars
    const xAxisLabelText = "CPU Time Elapsed";
    const cpuTimeOffset = processedData[0].cpuTime;
    const getIndependentVariable = d => d.cpuTime - cpuTimeOffset;

    const xScaleMin = getIndependentVariable(processedData[0]);
    const xScaleMax = getIndependentVariable(
      processedData[processedData.length - 1]
    );
    const xScale = d3
      .scaleLinear()
      .domain([xScaleMin, xScaleMax])
      .range([0, chart.WIDTH]);

    //stats side bar
    d3.select("#stats").call(stats.render, {
      processedData,
      originalLength: timeslicesLength
    });

    //sources & thread
    const sourcesSet = new Set(),
      threadsSet = new Set();
    processedData.forEach(timeslice => {
      timeslice.stackFrames.forEach(frame => {
        sourcesSet.add(frame.fileName);
      });
      threadsSet.add(timeslice.tid);
    });

    d3.select("#source-select").call(sourceSelect.render, {
      sources: [...sourcesSet]
    });

    d3.select("#thread-select").call(threadSelect.render, {
      threads: [...threadsSet]
    });

    //warnings
    const warningRecords = await warningsPromise;
    const warningCountsMap = new Map();
    warningRecords.forEach(warning => {
      if (warningCountsMap.has(warning.type)) {
        warningCountsMap.set(
          warning.type,
          warningCountsMap.get(warning.type) + 1
        );
      } else {
        warningCountsMap.set(warning.type, 1);
      }
    });

    const warningCounts = [...warningCountsMap];
    const warningsDistinct = [...warningCountsMap.keys()];

    d3.select("#warning-list").call(warningList.render, {
      warnings: warningRecords,
      cpuTimeOffset
    });

    d3.select("#warnings").call(warnings.render, {
      warningCounts,
      warningRecords
    });

    const { presets, events } = header;

    const charts = [
      {
        presetsRequired: ["cache"],
        yAxisLabelText: "L3 Cache Miss Rate",
        chartId: "l3-cache-miss-rate",
        yFormat: "%",
        getDependentVariable: d =>
          getEventCount(d, presets.cache.misses) /
            (getEventCount(d, presets.cache.hits) +
              getEventCount(d, presets.cache.misses)) || 0,
        flattenThreads: false,
        overlayPlots: [
          {
            name: "Total Accesses",
            color: "gray",
            getDependentVariable: d =>
              (getEventCount(d, presets.cache.hits) +
                getEventCount(d, presets.cache.misses)) /
              d.numCpuTimerTicks
          }
        ]
      },
      {
        presetsRequired: ["cache"],
        yAxisLabelText: "L2 Cache Miss Rate",
        chartId: "l2-cache-miss-rate",
        yFormat: "%",
        getDependentVariable: d =>
          getEventCount(d, presets.cache.misses) /
            (getEventCount(d, presets.cache.hits2) +
              getEventCount(d, presets.cache.misses2)) || 0,
        flattenThreads: false,
        overlayPlots: [
          {
            name: "Total Accesses",
            color: "gray",
            getDependentVariable: d =>
              (getEventCount(d, presets.cache.hits2) +
                getEventCount(d, presets.cache.misses2)) /
              d.numCpuTimerTicks
          }
        ]
      },
      {
        presetsRequired: ["branches"],
        yAxisLabelText: "Branch Predictor Miss Rate",
        chartId: "branch-predictor-miss-rate",
        yFormat: "%",
        getDependentVariable: d =>
          getEventCount(d, presets.branches.branchMisses) /
            getEventCount(d, presets.branches.branches) || 0,
        flattenThreads: false,
        overlayPlots: []
      },
      {
        presetsRequired: ["cpu"],
        yAxisLabelText: "Instructions Per Cycle",
        chartId: "instructions-per-cycle",
        yFormat: "",
        getDependentVariable: d =>
          getEventCount(d, presets.cpu.instructions) /
            getEventCount(d, presets.cpu.cpuCycles) || 0,
        flattenThreads: false,
        overlayPlots: []
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabelText: "Overall Power (Watts)",
        chartId: "overall-power",
        yFormat: "s",
        getDependentVariable: d => d.events.periodOverall,
        flattenThreads: true,
        overlayPlots: []
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabelText: "CPU Power (Watts)",
        chartId: "cpu-power",
        yFormat: "s",
        getDependentVariable: d => d.events.periodCpu,
        flattenThreads: true,
        overlayPlots: []
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabelText: "Memory Power (Watts)",
        chartId: "memory-power",
        yFormat: "s",
        getDependentVariable: d => d.events.periodMemory,
        flattenThreads: true,
        overlayPlots: []
      },
      {
        presetsRequired: ["wattsup"],
        yAxisLabelText: "Wattsup Power (Watts)",
        chartId: "wattsup-power",
        yFormat: "",
        getDependentVariable: d => getEventCount(d, presets.wattsup.wattsup),
        flattenThreads: true,
        overlayPlots: []
      },
      ...events.map(eventName => ({
        presetsRequired: [],
        yAxisLabelText: `Event: ${eventName.toLowerCase()}`,
        chartId: `event-${eventName.toLowerCase().replace(/\W+/g, "-")}`,
        yFormat: "s",
        getDependentVariable: d => d.events[eventName],
        flattenThreads: false,
        overlayPlots: []
      }))
    ].filter(({ presetsRequired }) =>
      presetsRequired.every(presetName => presetName in presets)
    );

    //render the side bar to choose which charts to render
    d3.select("#charts-select").call(chartsSelect.render, {
      charts
    });

    //combine yScales (x2), brush and and a chart file ????? into a new var and make a array of them
    const chartsWithYScales = charts.map(chartParams => {
      const { getDependentVariable } = chartParams;
      const yScale = d3
        .scaleLinear()
        .domain(d3.extent(processedData, getDependentVariable).reverse())
        .range([0, chart.HEIGHT]);

      return {
        ...chartParams,
        yScale,
        currentYScaleStore: new Store(
          d3
            .scaleLinear()
            .domain(
              sdDomain(processedData, getDependentVariable, sdRange, yScale)
            )
            .range(yScale.range())
        ),
        overlayPlots: chartParams.overlayPlots.map(overlayPlot => ({
          ...overlayPlot,
          yScale: d3
            .scaleLinear()
            .domain(
              d3
                .extent(processedData, overlayPlot.getDependentVariable)
                .reverse()
            )
            .range([chart.HEIGHT / 2, chart.HEIGHT])
        }))
      };
    });

    const currentSelectedFunctionStore = new Store(null);

    //update with subscriptions
    stream
      .fromStreamables([
        sourceSelect.hiddenSourcesStore.stream,
        threadSelect.hiddenThreadsStore.stream
      ])
      .pipe(
        stream.map(([hiddenSources, hiddenThreads]) => {
          //first filter with source selection!
          const sourceFilteredData = processedData
            .map(timeslice => ({
              ...timeslice,
              stackFrames: timeslice.stackFrames.filter(
                frame => !hiddenSources.includes(frame.fileName)
              )
            }))
            .filter(timeslice => timeslice.stackFrames.length > 0);

          //then filter with thread selection
          const fullFilteredData = sourceFilteredData.filter(
            //keep whose tid is not in hiddenThreads
            timeslice => !hiddenThreads.includes(timeslice.tid)
          );

          return { sourceFilteredData, fullFilteredData };
        })
      )
      .pipe(
        stream.subscribe(({ fullFilteredData, sourceFilteredData }) => {
          const chartsWithFilteredData = chartsWithYScales.map(chartParams => {
            const {
              chartId,
              getDependentVariable,
              flattenThreads
            } = chartParams;

            const selectionFilteredData = flattenThreads
              ? sourceFilteredData
              : fullFilteredData;

            const filteredData =
              chartId === "overall-power" ||
              chartId === "cpu-power" ||
              chartId === "memory-power"
                ? selectionFilteredData.filter(
                    d => getDependentVariable(d) !== 0
                  )
                : selectionFilteredData;

            return {
              ...chartParams,
              filteredData
            };
          });
          // .filter(chartParams => chartParams.filteredData.length > 0);

          const chartsDataSelection = d3
            .select("#charts")
            .selectAll("div")
            .data(chartsWithFilteredData);

          chartsDataSelection
            .enter()
            .append("div")
            .merge(chartsDataSelection)
            .each(function(chartParams) {
              //seem like we need to seperate out the calculation of the plotdata and make plotdata a field of chartsWithFilteredData, we can create the div first, and then for each div(root), subscribeunique a storestream and inside the subscribefunc, we add plotdata as a field to charts, then return charts and do the next thing
              d3.select(this).call(chart.render, {
                ...chartParams,
                getIndependentVariable,
                xAxisLabelText,
                xScale,
                spectrum,
                cpuTimeOffset,
                warningRecords,
                warningsDistinct,
                selectedFunctionStream: currentSelectedFunctionStore.stream
              });
            });
        })
      );

    chartsSelect.hiddenChartsStore.stream.pipe(
      stream.subscribe(hiddenCharts => {
        d3.selectAll(".chart")
          .classed("chart--hidden", false)
          .filter(function() {
            return hiddenCharts.includes(d3.select(this).attr("id"));
          })
          .classed("chart--hidden", true);
      })
    );

    stream
      .fromStreamables([
        sourceSelect.hiddenSourcesStore.stream,
        threadSelect.hiddenThreadsStore.stream,
        brushes.selectionStore.stream,
        currentSelectedFunctionStore.stream,
        tableSelect.selectedTableStore.stream
      ])
      .pipe(
        stream.map(
          ([
            hiddenSources,
            hiddenThreads,
            { selections },
            selectedFunction,
            selectedTable
          ]) => ({
            hiddenSources,
            hiddenThreads,
            selections,
            selectedFunction,
            selectedTable
          })
        )
      )
      .pipe(
        // Only update the function runtimes table if it is selected.
        stream.filter(
          ({ selectedTable }) => selectedTable.id === "#function-runtimes"
        )
      )
      .pipe(
        stream.debounceMap(
          ({ hiddenSources, hiddenThreads, selections, selectedFunction }) => {
            const FUNCTION_NAME_SEPARATOR = "//";

            performance.mark("analysis start");
            return analyze({
              timeSlices: processedData,
              // Pass in higher order function instead of Array#filter on
              // processed data to avoid unnecessary allocations and GC
              isVisible: timeslice => {
                // Avoiding Array#some because closures cause allocations and GC
                let hasUnHiddenFrame = false;
                let endsWithSelectedFunction = false;
                for (const frame of timeslice.stackFrames) {
                  if (!hiddenSources.includes(frame.fileName)) {
                    if (selectedFunction && frame.symbol === selectedFunction) {
                      endsWithSelectedFunction = true;
                    }
                    hasUnHiddenFrame = true;
                    break;
                  }
                }

                return (
                  !hiddenThreads.includes(timeslice.tid) &&
                  hasUnHiddenFrame &&
                  (!selectedFunction || endsWithSelectedFunction)
                );
              },
              isBrushSelected:
                selections.length === 0
                  ? () => true
                  : timeslice => {
                      const x = xScale(getIndependentVariable(timeslice));
                      // Again, avoiding Array#some for performance reasons
                      for (const { range } of selections) {
                        if (range[0] <= x && x <= range[1]) {
                          return true;
                        }
                      }
                      return false;
                    },
              getFunctionName: selectedFunction
                ? timeslice => {
                    // Use for loop instead of map >> filter >> reverse >> join
                    // to minimize allocations
                    let name = "";
                    let isFirst = true;
                    for (
                      let i = timeslice.stackFrames.length - 1;
                      i >= 0;
                      i--
                    ) {
                      const frame = timeslice.stackFrames[i];
                      if (!hiddenSources.includes(frame.fileName)) {
                        if (isFirst) {
                          isFirst = false;
                        } else {
                          name += FUNCTION_NAME_SEPARATOR;
                        }

                        name += frame.symbol;
                      }
                    }

                    return name;
                  }
                : timeslice => {
                    for (const frame of timeslice.stackFrames) {
                      if (!hiddenSources.includes(frame.fileName)) {
                        return frame.symbol;
                      }
                    }
                  }
            })
              .pipe(
                stream.tap(() => {
                  performance.mark("analysis end");
                  performance.measure(
                    "analysis",
                    "analysis start",
                    "analysis end"
                  );
                })
              )
              .pipe(
                stream.map(functions => ({
                  functions: functions.map(func => ({
                    ...func,
                    displayNames: func.name.split(FUNCTION_NAME_SEPARATOR)
                  })),
                  selectedFunction
                }))
              );
          }
        )
      )
      .pipe(
        stream.subscribe(({ functions, selectedFunction }) => {
          d3.select("#function-runtimes-back-button")
            .classed(
              "function-runtimes-back-button--visible",
              !!selectedFunction
            )
            .on("click", () => {
              currentSelectedFunctionStore.dispatch(() => null);
            });

          d3.select("#function-runtimes").call(functionRuntimes.render, {
            functions,
            functionsAreSelectable: !selectedFunction,
            onFunctionSelect: name => {
              currentSelectedFunctionStore.dispatch(() => name);
            }
          });
        })
      );

    tableSelect.selectedTableStore.stream
      .pipe(stream.map(table => table.id))
      .pipe(
        stream.subscribe(id => {
          d3.select(id).style("display", "table");
          d3.selectAll("#tables-wrapper table")
            .filter(`:not(${id})`)
            .style("display", "none");
        })
      );
  }
});
