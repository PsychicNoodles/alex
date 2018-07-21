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
  sdFilter
} = require("./process-data");
const { analyze } = require("./analysis");
const chart = require("./chart");
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
  const sdRange = 4;

  if (processedData.length === 0) {
    alert("timeslices array (maybe after processed) is empty");
    window.close();
  } else {
    //progress bar
    loadingProgressStore.dispatch(state => ({
      ...state,
      progressBarIsVisible: false
    }));

    //set up xAxis elements,vars
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

    //stats side bar
    d3.select("#stats").call(stats.render, {
      processedData
    });

    d3.select("#table-select").call(tableSelect.render);

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

    d3.select("#warning-list").call(warningList.render, {
      warnings: warningRecords,
      cpuTimeOffset
    });

    d3.select("#warnings").call(warnings.render, {
      warningCounts,
      warningRecords
    });

    //charts charts charts
    const { presets } = result.header;
    //make a array containing some information of each chart
    const charts = [
      {
        presetsRequired: ["cache"],
        yAxisLabel: "Cache Miss Rate",
        yFormat: d3.format(".0%"),
        getDependentVariable: d =>
          getEventCount(d, presets.cache.misses) /
            (getEventCount(d, presets.cache.hits) +
              getEventCount(d, presets.cache.misses)) || 0,
        flattenThreads: false
      },
      {
        presetsRequired: ["cpu"],
        yAxisLabel: "Instructions Per Cycle",
        yFormat: d3.format(".2"),
        getDependentVariable: d =>
          getEventCount(d, presets.cpu.instructions) /
            getEventCount(d, presets.cpu.cpuCycles) || 0,
        flattenThreads: false
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabel: "CPU Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodCpu"] || 0,
        flattenThreads: true
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabel: "Memory Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodMemory"] || 0,
        flattenThreads: true
      },
      {
        presetsRequired: ["rapl"],
        yAxisLabel: "Overall Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodOverall"] || 0,
        flattenThreads: true
      },
      {
        presetsRequired: ["wattsup"],
        yAxisLabel: "Wattsup Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => getEventCount(d, presets.wattsup.wattsup),
        flattenThreads: true
      }
    ].filter(({ presetsRequired }) =>
      presetsRequired.every(presetName => presetName in presets)
    );

    //combine yScales (x2), brush and and a chart file ????? into a new var and make a array of them
    const chartsWithYScales = charts.map(chartParams => {
      const { getDependentVariable } = chartParams;
      const normalData = processedData;
      // sdFilter(processedData, getDependentVariable, sdRange);
      const yScale = d3
        .scaleLinear()
        .domain(d3.extent(normalData, getDependentVariable).reverse())
        .range([0, chart.HEIGHT]);

      const yScale_present = d3
        .scaleLinear()
        .domain(yScale.domain())
        .range(yScale.range());

      const brush = d3
        .brushY()
        .extent([[0, 0], [chart.WIDTH * 0.075, chart.HEIGHT]]);

      return {
        ...chartParams,
        yScale,
        yScale_present,
        brush,
        chart
      };
    });

    //update with subscriptions
    stream
      .fromStreamables([
        sourceSelect.hiddenSourcesStore.stream,
        threadSelect.hiddenThreadsStore.stream
      ])
      .pipe(
        stream.subscribe(([hiddenSources, hiddenThreads]) => {
          //first filter with source selection!
          const sourceFilteredData = processedData
            .filter((
              timeslice //keep the timeslices which have at least one frame with its filename not in hiddenSources
            ) =>
              timeslice.stackFrames.some(
                frame => !hiddenSources.includes(frame.fileName)
              )
            )
            .map(timeslice => ({
              //and then remove those frames with a hiddensource
              ...timeslice,
              stackFrames: timeslice.stackFrames.filter(
                frame => !hiddenSources.includes(frame.fileName)
              )
            }));

          //then filter with thread selection
          const fullFilteredData = sourceFilteredData.filter(
            timeslice => !hiddenThreads.includes(timeslice.tid)
          );

          d3.select("#stats").call(stats.render, {
            processedData: fullFilteredData
          });

          const chartsWithPlotData = chartsWithYScales
            .map(chartParams => {
              const {
                getDependentVariable,
                flattenThreads,
                yScale
              } = chartParams;

              const normalData = flattenThreads
                ? sourceFilteredData
                : fullFilteredData;
              // sdFilter(
              //   flattenThreads ? sourceFilteredData : fullFilteredData,
              //   getDependentVariable,
              //   sdRange
              // );

              const plotData = computeRenderableData({
                data: normalData,
                xScale,
                yScale,
                getIndependentVariable,
                getDependentVariable
              });

              return {
                ...chartParams,
                plotData
              };
            })
            .filter(chart => chart.plotData.length > 0);

          const densityMax = Math.max(
            chartsWithPlotData.reduce(
              (currentMax, chartParams) =>
                Math.max(
                  currentMax,
                  d3.max(chartParams.plotData, d => d.densityAvg)
                ),
              0
            ),
            5
          );

          const chartsDataSelection = d3
            .select("#charts")
            .selectAll("div")
            .data(chartsWithPlotData);

          chartsDataSelection
            .enter()
            .append("div")
            .each(function({
              getDependentVariable,
              yAxisLabel,
              yFormat,
              yScale,
              yScale_present,
              brush,
              plotData
            }) {
              d3.select(this).call(chart.create, {
                getIndependentVariable,
                getDependentVariable,
                xAxisLabel,
                yAxisLabel,
                xScale,
                yScale,
                yScale_present,
                brush,
                yFormat,
                plotData,
                densityMax,
                spectrum,
                cpuTimeOffset,
                warningRecords,
                warningsDistinct
              });
            })
            .merge(chartsDataSelection)
            .each(function({
              getDependentVariable,
              yAxisLabel,
              yFormat,
              yScale,
              yScale_present,
              brush,
              plotData
            }) {
              d3.select(this).call(chart.updateData, {
                getIndependentVariable,
                getDependentVariable,
                yAxisLabel,
                xScale,
                yScale,
                yScale_present,
                brush,
                yFormat,
                plotData,
                densityMax,
                spectrum
              });
            });

          chartsDataSelection.exit().remove();

          d3.select("#legend")
            .style("display", "block")
            .call(legend.render, {
              densityMax,
              spectrum
            });
        })
      );

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
            const FUNCTION_NAME_SEPARATOR = " ";

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
                      ? timeslice.stackFrames[0].symName === selectedFunction
                      : true
                ),
              stackFrames =>
                selectedFunction
                  ? stackFrames
                      .map(frame => frame.symName)
                      .reverse()
                      .join(FUNCTION_NAME_SEPARATOR)
                  : stackFrames[0].symName,
              0.05 // TODO: modify this value via UI
            );

            // Compute a cumulative moving average for processing time so we can
            // debounce processing if it is slow
            // https://en.wikipedia.org/wiki/Moving_average#Cumulative_moving_average
            const timeTaken = performance.now() - startTime;
            averageProcessingTime =
              (timeTaken + numProcessingTimeSamples * averageProcessingTime) /
              (numProcessingTimeSamples + 1);
            numProcessingTimeSamples++;

            return {
              functions: functions.map(func => ({
                ...func,
                displayNames: func.name.split(FUNCTION_NAME_SEPARATOR)
              })),
              selectedFunction
            };
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
