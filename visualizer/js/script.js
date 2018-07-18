const { ipcRenderer } = require("electron");
const d3 = require("d3");
const fs = require("fs");
const progressStream = require("progress-stream");
const streamJSON = require("stream-json");
const JSONAssembler = require("stream-json/Assembler");
const { promisify } = require("util");

const {
  processData,
  computeRenderableData,
  getEventCount,
  SDFilter
} = require("./process-data");
const { analyze } = require("./analysis");
const chart = require("./chart");
const plot = require("./plot");
const functionRuntimes = require("./function-runtimes");
const warningList = require("./warning-list");
const legend = require("./legend");
const stats = require("./stats");
const brushes = require("./brushes");
const sourceSelect = require("./source-select");
const threadSelect = require("./thread-select");
const tableSelect = require("./table-select");
const warnings = require("./warnings");
const stream = require("./stream");
const progressBar = require("./progress-bar");
const { Store } = require("./store");

const loadingProgressStore = new Store({
  percentage: 0,
  progressBarIsVisible: true
});

loadingProgressStore.subscribe(({ percentage, progressBarIsVisible }) => {
  d3.select("#progress").call(progressBar.render, {
    percentage,
    text: "Reading Result File",
    isVisible: progressBarIsVisible
  });
});

ipcRenderer.send("result-request");
ipcRenderer.on("result", async (event, resultFile) => {
  let result;
  try {
    const { size: resultFileSize } = await promisify(fs.stat)(resultFile);

    const jsonTokenStream = fs
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
      .pipe(streamJSON.parser());

    const assembler = await new Promise((resolve, reject) =>
      JSONAssembler.connectTo(jsonTokenStream.on("warning", reject))
        .on("done", resolve)
        .on("warning", reject)
    );

    result = assembler.current;
  } catch (err) {
    alert(`Couldn't load result file: ${err.message}`);
    window.close();
  }

  if (result.error) {
    alert(result.error);
  }
  document.getElementById("title").textContent = result.header.programName;
  const processedData = processData(result.timeslices, result.header);
  const spectrum = d3.interpolateWarm;
  const SDrange = 4;

  if (processedData.length === 0) {
    alert("timeslices array (maybe after processed) is empty");
    window.close();
  } else {
    loadingProgressStore.dispatch(state => ({
      ...state,
      progressBarIsVisible: false
    }));

    const { presets } = result.header;
    const charts = [
      {
        presetsRequired: ["cache"],
        yAxisLabel: "Cache Miss Rate",
        yFormat: d3.format(".0%"),
        getDependentVariable: d =>
          getEventCount(d, presets.cache.misses) /
            (getEventCount(d, presets.cache.hits) +
              getEventCount(d, presets.cache.misses)) || 0
      },
      {
        presetsRequired: ["cpu"],
        yAxisLabel: "Instructions Per Cycle",
        yFormat: d3.format(".2"),
        getDependentVariable: d =>
          getEventCount(d, presets.cpu.instructions) /
            getEventCount(d, presets.cpu.cpuCycles) || 0
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabel: "CPU Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodCpu"] || 0
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabel: "Memory Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodMemory"] || 0
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabel: "Overall Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodOverall"] || 0
      },
      {
        presetsRequired: ["wattsup"],
        yAxisLabel: "Wattsup Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => getEventCount(d, presets.wattsup.wattsup)
      }
    ].filter(({ presetsRequired }) =>
      presetsRequired.every(presetName => presetName in presets)
    );

    const xAxisLabel = "CPU Time Elapsed";
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

    const yScalesByChart = new WeakMap();
    const plotDataByChart = new WeakMap();

    for (const chartParams of charts) {
      const { getDependentVariable } = chartParams;
      const normalData = SDFilter(processedData, getDependentVariable, SDrange);
      const yScaleMax = d3.max(normalData, getDependentVariable);
      const yScaleMin = d3.min(normalData, getDependentVariable);
      const yScale = d3
        .scaleLinear()
        .domain([yScaleMax, yScaleMin])
        .range([0, chart.HEIGHT]);

      const plotData = computeRenderableData({
        data: normalData,
        xScale,
        yScale,
        getIndependentVariable,
        getDependentVariable
      });
      yScalesByChart.set(chartParams, yScale);
      plotDataByChart.set(chartParams, plotData);
    }

    const chartsWithPlotData = charts.filter(
      chart => plotDataByChart.get(chart).length > 0
    );

    const densityMax = Math.max(
      chartsWithPlotData.reduce(
        (currentMax, chartParams) =>
          Math.max(
            currentMax,
            d3.max(plotDataByChart.get(chartParams), d => d.densityAvg)
          ),
        0
      ),
      5
    );

    const warningRecords = result.warning;
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

    let someHighDensity = false;
    for (const chartParams of chartsWithPlotData) {
      const isLowDensity =
        d3.max(plotDataByChart.get(chartParams), d => d.densityAvg) < 2;
      if (!isLowDensity) {
        someHighDensity = true;
      }
      const { getDependentVariable, yAxisLabel, yFormat } = chartParams;
      d3.select("#charts")
        .append("div")
        .call(chart.render, {
          timeslices: processedData,
          getIndependentVariable,
          getDependentVariable,
          xAxisLabel,
          yAxisLabel,
          xScale,
          yScale: yScalesByChart.get(chartParams),
          yFormat,
          plotData: plotDataByChart.get(chartParams),
          densityMax,
          spectrum,
          cpuTimeOffset,
          warningRecords,
          warningsDistinct
        });
    }
    if (someHighDensity) {
      d3.select("#legend").call(legend.render, {
        densityMax,
        spectrum
      });
    } else {
      d3.select("#legend").remove();
    }

    d3.select("#stats").call(stats.render, {
      processedData
    });

    const sourcesSet = new Set(),
      threadsSet = new Set();
    processedData.forEach(timeslice => {
      timeslice.stackFrames.forEach(frame => {
        sourcesSet.add(frame.fileName);
      });
      threadsSet.add(timeslice.tid);
    });

    d3.select("#table-select").call(tableSelect.render);

    d3.select("#source-select").call(sourceSelect.render, {
      sources: [...sourcesSet]
    });

    d3.select("#thread-select").call(threadSelect.render, {
      threads: [...threadsSet]
    });

    d3.select("#warnings").call(warnings.render, {
      warningCounts,
      warningRecords
    });

    d3.select("#warning-list").call(warningList.render, {
      warnings: warningRecords,
      cpuTimeOffset
    });

    const currentSelectedFunctionStore = new Store(null);

    let averageProcessingTime = 0;
    let numProcessingTimeSamples = 0;

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
        stream.debounce(
          () =>
            // If it takes longer a few frames to process, then debounce.
            averageProcessingTime < 40 ? stream.empty : stream.fromTimeout(100)
        )
      )
      .pipe(
        stream.map(
          ({ hiddenSources, hiddenThreads, selections, selectedFunction }) => {
            const startTime = performance.now();
            const { functions } = analyze(
              processedData
                .map(timeslice => {
                  const x = xScale(getIndependentVariable(timeslice));
                  return {
                    ...timeslice,
                    selected:
                      selections.length === 0 ||
                      selections.some(
                        ({ range }) => range[0] <= x && x <= range[1]
                      ),
                    stackFrames: timeslice.stackFrames.filter(
                      frame => !hiddenSources.includes(frame.fileName)
                    )
                  };
                })
                .filter(timeslice => timeslice.stackFrames.length)
                .filter(timeslice => !hiddenThreads.includes(timeslice.tid))
                .filter(
                  timeslice =>
                    selectedFunction
                      ? timeslice.stackFrames.some(
                          frame => frame.symName === selectedFunction
                        )
                      : true
                ),
              stackFrames =>
                selectedFunction
                  ? stackFrames
                      .map(frame => frame.symName)
                      .reverse()
                      .join(" › ")
                  : stackFrames[0].symName
            );

            // Compute a cumulative moving average for processing time so we can
            // debounce processing if it is slow
            // https://en.wikipedia.org/wiki/Moving_average#Cumulative_moving_average
            const timeTaken = performance.now() - startTime;
            averageProcessingTime =
              (timeTaken + numProcessingTimeSamples * averageProcessingTime) /
              (numProcessingTimeSamples + 1);
            numProcessingTimeSamples++;
            console.log(averageProcessingTime);

            return {
              functions,
              selectedFunction,
              hiddenSources,
              hiddenThreads
            };
          }
        )
      )
      .pipe(
        stream.subscribe(
          ({ functions, selectedFunction, hiddenSources, hiddenThreads }) => {
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

            const filterData = data =>
              data
                .filter(timeslice => !hiddenThreads.includes(timeslice.tid))
                .filter(timeslice =>
                  timeslice.stackFrames.some(
                    frame => !hiddenSources.includes(frame.fileName)
                  )
                )
                .map(timeslice => ({
                  ...timeslice,
                  stackFrames: timeslice.stackFrames.filter(
                    frame => !hiddenSources.includes(frame.fileName)
                  )
                }));

            d3.select("#stats").call(stats.render, {
              processedData: filterData(processedData)
            });

            d3.selectAll("#charts .plot").each(function(_, i) {
              d3.select(this).call(plot.toggleCircles, {
                data: filterData(plotDataByChart.get(charts[i]))
              });
            });
          }
        )
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
