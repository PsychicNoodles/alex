const stream = require("./stream");
const jsRegression = require("js-regression");

/**
 * Run analyses of data.
 * Fisher's exact test null hypothesis: the given function and other functions
 * are equally likely to be in the selection region.
 * @param {Object} params
 * @param {any[]} params.timeSlices All timeslices in the dataset.
 * @param {(timeslice: any) => boolean} params.isVisible
 *    Check if a timeslice should be included in the analysis.
 * @param {(timeslice: any) => boolean} params.isBrushSelected
 *    Check if a timeslice is selected.
 * @param {(timeslice: any) => string} params.getFunctionName
 *    Get a unique name for a function. All timeslices that resolve to the same
 *    function name will be grouped together.
 * @returns {stream.Stream} Results of the analysis.
 */
function analyze({ timeSlices, isVisible, isBrushSelected, getFunctionName }) {
  const functionsMap = new Map();

  const MAP_BUILD_CHUNK_SIZE = 1000;
  const mapBuildChunkStreams = [];
  const timeSlicesLength = timeSlices.length;

  performance.mark("functions map build start");
  for (
    let i = 0;
    i < timeSlicesLength + MAP_BUILD_CHUNK_SIZE;
    i += MAP_BUILD_CHUNK_SIZE
  ) {
    mapBuildChunkStreams.push(
      createMicroJobStream(() => {
        for (
          let j = i;
          j < i + MAP_BUILD_CHUNK_SIZE && j < timeSlicesLength;
          j++
        ) {
          const timeSlice = timeSlices[j];
          if (isVisible(timeSlice)) {
            const functionName = getFunctionName(timeSlice);
            if (!functionsMap.has(functionName)) {
              functionsMap.set(functionName, {
                name: functionName,
                time: 0,
                probability: 0
              });
            }

            if (isBrushSelected(timeSlice)) {
              functionsMap.get(functionName).time += timeSlice.numCpuTimerTicks;
            }
          }
        }
      })
    );
  }

  return stream
    .fromStreamables(mapBuildChunkStreams)
    .pipe(stream.take(1))
    .pipe(
      stream.map(() => ({
        functions: [...functionsMap.values()]
      }))
    )
    .pipe(
      stream.tap(() => {
        performance.mark("functions map build end");
        performance.measure(
          "functions map build",
          "functions map build start",
          "functions map build end"
        );

        performance.mark("functions analysis start");
      })
    )
    .pipe(
      stream.mergeMap(({ functions }) => {
        const logisticRegression = new jsRegression.LogisticRegression({
          alpha: 0.005,
          iterations: 1000,
          lambda: 0.0
        });
        const trainingData = [];
        /* Currently the best move is to loop through all timeslices a second
        time; this is because the implementation of js-regression requires
        that we know ahead of time all the independent variables (in this
        case, each function) and their setting for each time slice. This might
        be avoidable. */
        let timeSlice = {};
        for (let i = 0; i < timeSlicesLength; i++) {
          timeSlice = timeSlices[i];
          const functionName = getFunctionName(timeSlice);
          const row = [];
          // Set independent variables
          functions.forEach(func => {
            row.push(func.name === functionName ? 1.0 : 0.0);
          });
          // Set dependent variable
          row.push(isBrushSelected(timeSlice) ? 1.0 : 0.0);
          trainingData.push(row);
        }
        const model = logisticRegression.fit(trainingData);
        // Convert from log-odds to probability... I think.
        const odds = model.theta.map(
          element => 1 / (1 + Math.pow(Math.E, -element))
        );

        let oddsIndex = 1;
        functions.forEach(func => {
          func.probability = odds[oddsIndex++];
        });

        // Testing
        //console.log(trainingData);
        //console.log(model);
        //console.log(odds);
        //console.log(functions);
        return stream.fromValue(functions);
      })
    )
    .pipe(
      stream.tap(() => {
        performance.mark("functions analysis end");
        performance.measure(
          "functions analysis",
          "functions analysis start",
          "functions analysis end"
        );

        performance.mark("functions sort start");
      })
    )
    .pipe(
      stream.map(functions =>
        [...functions].sort(
          (a, b) => b.probability - a.probability || b.time - a.time
        )
      )
    )
    .pipe(
      stream.tap(() => {
        performance.mark("functions sort end");
        performance.measure(
          "functions sort",
          "functions sort start",
          "functions sort end"
        );
      })
    );
}

/**
 * Create a stream that will add `job` to the event queue.
 *
 * Subscribing to the stream will queue up `job`. The stream will emit the
 * return value of `job`, and then immediately finish. Unsubscribe from the
 * stream to cancel `job`.
 *
 * @param {() => any} job
 *    A fairly small piece of work that should take less than a few milliseconds.
 */
function createMicroJobStream(job) {
  return stream.fromStreamable(onData => {
    const timeout = setTimeout(() => {
      const result = job();
      onData(result);
      onData(stream.done);
    });

    return () => {
      clearTimeout(timeout);
    };
  });
}

module.exports = { analyze };
