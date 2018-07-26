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
  sdDomain
} = require("./process-data");
const { analyze } = require("./analysis");
const chart = require("./chart");
const functionRuntimes = require("./function-runtimes");
const warningList = require("./warning-list");
const stats = require("./stats");
const brushes = require("./brushes");
const sourceSelect = require("./source-select");
const threadSelect = require("./thread-select");
const tableSelect = require("./table-select");
const chartsSelect = require("./charts-select");
const warnings = require("./warnings");
const stream = require("./stream");
const progressBar = require("./progress-bar");
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
    text: roundedPercentage === 100 ? "Parsing Data..." : "Reading Result File",
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
    window.close();
  }

  d3.select("#title").text(result.header.programName);
  const processedData = processData(result.timeslices, result.header);
  const spectrum = d3.interpolateWarm;
  const sdRange = 3;

  if (processedData.length === 0) {
    alert(
      result.timeslices.length === 0
        ? "No data in result file.  Perhaps the program terminated too quickly."
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
        id: "cacheMissRate",
        yAxisLabelText: "Cache Miss Rate",
        yFormat: d3.format(".0%"),
        getDependentVariable: d =>
          getEventCount(d, presets.cache.misses) /
            (getEventCount(d, presets.cache.hits) +
              getEventCount(d, presets.cache.misses)) || 0,
        flattenThreads: false
      },
      {
        presetsRequired: ["cpu"],
        id: "instructionsPerCycle",
        yAxisLabelText: "Instructions Per Cycle",
        yFormat: d3.format(".3"),
        getDependentVariable: d =>
          getEventCount(d, presets.cpu.instructions) /
            getEventCount(d, presets.cpu.cpuCycles) || 0,
        flattenThreads: false
      },
      {
        presetsRequired: ["rapl"],
        id: "cpuPower",
        yAxisLabelText: "CPU Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodCpu"] || 0,
        flattenThreads: true
      },
      {
        presetsRequired: ["rapl"],
        id: "memoryPower",
        yAxisLabelText: "Memory Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodMemory"] || 0,
        flattenThreads: true
      },
      {
        presetsRequired: ["rapl"],
        id: "overallPower",
        yAxisLabelText: "Overall Power",
        yFormat: d3.format(".2s"),
        getDependentVariable: d => d.events["periodOverall"] || 0,
        flattenThreads: true
      },
      {
        presetsRequired: ["wattsup"],
        id: "wattsupPower",
        yAxisLabelText: "Wattsup Power",
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
      const yScale = d3
        .scaleLinear()
        .domain(d3.extent(normalData, getDependentVariable).reverse())
        .range([0, chart.HEIGHT]);

      const brush = d3
        .brushY()
        .extent([[0, 0], [chart.WIDTH * 0.075, chart.HEIGHT]]);

      return {
        ...chartParams,
        yScale,
        brush,
        chart
      };
    });

    //update with subscriptions
    const filteredDataStream = stream
      .fromStreamables([
        sourceSelect.hiddenSourcesStore.stream,
        threadSelect.hiddenThreadsStore.stream
      ])
      .pipe(
        stream.map(([hiddenSources, hiddenThreads]) => {
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
            })); //make a new array

          //then filter with thread selection
          const fullFilteredData = sourceFilteredData.filter(
            //keep whose tid is not in hiddenThreads
            timeslice => !hiddenThreads.includes(timeslice.tid)
          );

          return { sourceFilteredData, fullFilteredData };
        })
      );

    filteredDataStream.pipe(
      stream.subscribe(({ fullFilteredData }) => {
        //re-render stats side bar
        d3.select("#stats").call(stats.render, {
          processedData: fullFilteredData
        });
      })
    );

    const currentYScalesStore = new Store(
      chartsWithYScales.reduce((currentYScales, chartParams) => {
        const { yAxisLabelText, yScale, getDependentVariable } = chartParams;

        return {
          ...currentYScales,
          [yAxisLabelText]: d3
            .scaleLinear()
            .domain(
              sdDomain(processedData, getDependentVariable, sdRange, yScale)
            )
            .range(yScale.range())
        };
      }, {})
    );

    stream
      .fromStreamables([
        currentYScalesStore.stream,
        chartsSelect.hiddenChartsStore.stream,
        filteredDataStream
      ])
      .pipe(
        stream.subscribe(
          ([
            currentYScales,
            hiddenCharts,
            { fullFilteredData, sourceFilteredData }
          ]) => {
            const chartsWithPlotData = chartsWithYScales
              .map(chartParams => {
                const {
                  yAxisLabelText,
                  getDependentVariable,
                  flattenThreads
                } = chartParams;

                const filteredData = flattenThreads
                  ? sourceFilteredData
                  : fullFilteredData;

                const plotData = computeRenderableData({
                  data: filteredData,
                  xScale,
                  yScale: currentYScales[yAxisLabelText],
                  getIndependentVariable,
                  getDependentVariable
                });

                const densityMaxLocal =
                  Math.max(d3.max(plotData, d => d.densityAvg), 5) || 0;

                return {
                  ...chartParams,
                  densityMaxLocal,
                  plotData
                };
              })
              .filter(chartParams => chartParams.plotData.length > 0);

            const visibleCharts = chartsWithPlotData.filter(
              chart => !hiddenCharts.includes(chart.id)
            );

            const chartsDataSelection = d3
              .select("#charts")
              .selectAll("div")
              .data(visibleCharts);

            chartsDataSelection
              .enter()
              .append("div")
              .merge(chartsDataSelection)
              .each(function({
                getDependentVariable,
                yAxisLabelText,
                yFormat,
                yScale,
                densityMaxLocal,
                brush,
                plotData
              }) {
                d3.select(this).call(chart.render, {
                  getIndependentVariable,
                  getDependentVariable,
                  xAxisLabelText,
                  yAxisLabelText,
                  xScale,
                  yScale,
                  brush,
                  yFormat,
                  plotData,
                  densityMax: densityMaxLocal,
                  spectrum,
                  cpuTimeOffset,
                  warningRecords,
                  warningsDistinct,
                  currentYScale: currentYScales[yAxisLabelText],
                  onYScaleDomainChange: newDomain => {
                    currentYScalesStore.dispatch(currentYScales => ({
                      ...currentYScales,
                      [yAxisLabelText]: d3
                        .scaleLinear()
                        .domain(newDomain)
                        .range(yScale.range())
                    }));
                  }
                });
              });

            chartsDataSelection.exit().remove();

            d3.select("#charts-select").call(chartsSelect.render, {
              visibleCharts
            });
          }
        )
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
            const FUNCTION_NAME_SEPARATOR = "//";

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
              document.getElementById("confidence-level-input").value // TODO: modify this value via UI
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
