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
 * @param {number} params.confidenceThreshold
 *    A fisherProbability from 0 to 1. Any value above this will be considered
 *    significant enough to be highlighted in analysis.
 * @returns {stream.Stream} Results of the analysis.
 */
function analyze({
  timeSlices,
  isVisible,
  isBrushSelected,
  getFunctionName,
  confidenceThreshold
}) {
  const functionsMap = new Map();
  let selectedTotal = 0;
  let unselectedTotal = 0;

  const MAP_BUILD_CHUNK_SIZE = 1000;
  const mapBuildChunkStreams = [];

  performance.mark("functions map build start");
  for (
    let i = 0;
    i < timeSlices.length + MAP_BUILD_CHUNK_SIZE;
    i += MAP_BUILD_CHUNK_SIZE
  ) {
    mapBuildChunkStreams.push(
      createMicroJobStream(() => {
        for (
          let j = i;
          j < i + MAP_BUILD_CHUNK_SIZE && j < timeSlices.length;
          j++
        ) {
          const timeSlice = timeSlices[j];
          if (isVisible(timeSlice)) {
            const functionName = getFunctionName(timeSlice);
            if (!functionsMap.has(functionName)) {
              functionsMap.set(functionName, {
                name: functionName,
                time: 0,
                observed: 0,
                unselectedCount: 0,
                expected: 0,
                fisherProbability: 0,
                logisticRegressionProbability: 0,
                conclusion: ""
              });
            }

            const functionEntry = functionsMap.get(functionName);
            if (isBrushSelected(timeSlice)) {
              selectedTotal++;
              functionEntry.time += timeSlice.numCpuTimerTicks;
              functionEntry.observed++;
            } else {
              unselectedTotal++;
              functionEntry.unselectedCount++;
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
        selectedTotal,
        unselectedTotal,
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
      stream.mergeMap(({ selectedTotal, unselectedTotal, functions }) => {
        if (selectedTotal !== 0 && unselectedTotal !== 0) {
          const logisticRegression = new jsRegression.LogisticRegression({
            alpha: 0.005,
            iterations: 1000,
            lambda: 0.0
          });
          const trainingData = [];
          /* Currently the best move is to loop through all timeslices a second
          time; this is because the implementation of js-regression requires
          that we know ahead of time all the independent variables (in this
          case, each function). There's not much of a way out of this unless we
          reimplement logistic regression very smartly to allow a non-array
          input to it. */
          timeSlices.forEach(timeSlice => {
            const functionName = getFunctionName(timeSlice);
            const row = [];
            /* Set independent variables */
            functionsMap.forEach(func => {
              row.push(func.name === functionName ? 1.0 : 0.0);
            });
            /* Set dependent variable */
            row.push(isBrushSelected(timeSlice) ? 1.0 : 0.0);
            trainingData.push(row);
          });
          //console.log(trainingData);
          const model = logisticRegression.fit(trainingData);
          console.log(model);
          console.log(functionsMap);

          return stream
            .fromStreamables(
              functions.map(func =>
                createMicroJobStream(() => {
                  const curTotal = func.observed + func.unselectedCount;
                  const expected =
                    (curTotal * selectedTotal) /
                    (selectedTotal + unselectedTotal);

                  const otherObserved = selectedTotal - func.observed;
                  const otherUnselectedCount =
                    unselectedTotal - func.unselectedCount;
                  const fisherProbability =
                    1 -
                    fastExactTest(
                      func.observed,
                      otherObserved,
                      func.unselectedCount,
                      otherUnselectedCount
                    );

                  const conclusion =
                    fisherProbability >= confidenceThreshold &&
                    func.observed >= expected
                      ? "Unusually prevalent"
                      : fisherProbability >= confidenceThreshold &&
                        func.observed < expected
                        ? "Unusually absent"
                        : "Insignificant";

                  return {
                    ...func,
                    expected,
                    fisherProbability,
                    conclusion
                  };
                })
              )
            )
            .pipe(stream.take(1));
        } else {
          return stream.fromValue(functions);
        }
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
          (a, b) =>
            b.fisherProbability - a.fisherProbability ||
            b.observed - a.observed ||
            b.time - a.time
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

/**
 * This is a fast implementation of Fisher's exact test. It cancels common
 * factors from the numerator and denominator, and alternates between division
 * and multiplication to prevent overflowing or underflowing.
 *
 * The Wikipedia page for Fisher's exact test shows the following expanded form:
 *   p = (a+b)! * (c+d)! * (a+c)! * (b+d)! /
 *       (a! * b! * c! * d! * (a + b + c + d)!)
 * However, additional cancellation is possible. The first factor in the
 * numerator shares the sub-product of b! with the b! term in the denominator.
 * Each numerator term can cancel one of the factorial terms in the denominator,
 * leaving:
 *   p = product(1+b to a+b) * product(c+1 to c+d)h * product(a+1 to a+c) *
 *       product(1+d to b+d) / (a + b + c + d)!
 * The loop in this function performs a multiplication step in one of the five
 * terms of this simplified expression. If the running tally is above 1, it
 * favors the denominator term.
 */
function fastExactTest(a, b, c, d) {
  let aPlusBFactPos = b + 1;
  let cPlusDFactPos = c + 1;
  let aPlusCFactPos = a + 1;
  let bPlusDFactPos = d + 1;
  let nFactPos = 1;

  const n = a + b + c + d;

  let result = 1;
  let done = false;

  while (!done) {
    if (result > 1 && nFactPos <= n) result /= nFactPos++;
    else if (aPlusBFactPos <= a + b) result *= aPlusBFactPos++;
    else if (cPlusDFactPos <= c + d) result *= cPlusDFactPos++;
    else if (aPlusCFactPos <= a + c) result *= aPlusCFactPos++;
    else if (bPlusDFactPos <= b + d) result *= bPlusDFactPos++;
    else if (nFactPos <= n) result /= nFactPos++;
    else done = true;
  }

  return result;
}

module.exports = { analyze };
