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
  getEventCount
} = require("./process-data");
const { analyze } = require("./analysis");
const chart = require("./chart");
const functionRuntimes = require("./function-runtimes");
const errorList = require("./error-list");
const legend = require("./legend");
const stats = require("./stats");
const brushes = require("./brushes");
const sourceSelect = require("./source-select");
const threadSelect = require("./thread-select");
const tableSelect = require("./table-select");
const errors = require("./errors");
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
      JSONAssembler.connectTo(jsonTokenStream.on("error", reject))
        .on("done", resolve)
        .on("error", reject)
    );

    result = assembler.current;
  } catch (err) {
    alert(`Couldn't load result file: ${err.message}`);
    window.close();
  }

  const processedData = processData(result.timeslices, result.header);
  const errorRecords = result.error;

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
    const yScaleMax = d3.max(processedData, getDependentVariable);
    const yScale = d3
      .scaleLinear()
      .domain([yScaleMax, 0])
      .range([0, chart.HEIGHT]);

    const plotData = computeRenderableData({
      data: processedData,
      xScale,
      yScale,
      getIndependentVariable,
      getDependentVariable
    });

    yScalesByChart.set(chartParams, yScale);
    plotDataByChart.set(chartParams, plotData);
  }

  const densityMax = charts.reduce(
    (currentMax, chartParams) =>
      Math.max(
        currentMax,
        d3.max(plotDataByChart.get(chartParams), d => d.densityAvg)
      ),
    0
  );

  const spectrum = d3.interpolateWarm;

  const errorCountsMap = new Map();
  errorRecords.forEach(error => {
    if (errorCountsMap.has(error.type)) {
      errorCountsMap.set(error.type, errorCountsMap.get(error.type) + 1);
    } else {
      errorCountsMap.set(error.type, 1);
    }
  });
  const errorCounts = [...errorCountsMap];
  const errorsDistinct = [...errorCountsMap.keys()];

  let someHighDensity = false;
  for (const chartParams of charts) {
    const isLowDensity =
      d3.max(plotDataByChart.get(chartParams), d => d.densityAvg) <= 2;
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
        errorRecords,
        errorsDistinct
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

  const sourcesSet = new Set();
  const threadsSet = new Set();
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

  d3.select("#errors").call(errors.render, {
    errorCounts,
    errorRecords
  });

  d3.select("#error-list").call(errorList.render, {
    errors: errorRecords,
    cpuTimeOffset
  });

  let averageProcessingTime = 0;
  let numProcessingTimeSamples = 0;

  stream
    .fromStreamables([
      sourceSelect.hiddenSourcesStore.stream,
      threadSelect.hiddenThreadsStore.stream,
      brushes.selectionStore.stream,
      tableSelect.selectedTableStore.stream
    ])
    .pipe(
      // Only update the function runtimes table if it is selected.
      stream.filter(
        ([, , , selectedTable]) => selectedTable.id === "#function-runtimes"
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
      stream.map(([hiddenSources, hiddenThreads, { selections }]) => {
        const startTime = performance.now();
        const result = analyze(
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

        return result;
      })
    )
    .pipe(
      stream.subscribe(({ functionList }) => {
        d3.select("#function-runtimes").call(functionRuntimes.render, {
          functionList
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
});
