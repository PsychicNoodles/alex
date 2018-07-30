const stream = require("./stream");
const scheduler = require("./scheduler");

/**
 * Run analyses of data.
 * Fisher's exact test null hypothesis: the given function and other functions
 * are equally likely to be in the selection region.
 * @param {Object} params
 * @param {any[]} params.timeSlices All timeslices to include in the analysis.
 * @param {(timeslice: any) => boolean} params.isSelected
 *    Check if a timeslice is selected.
 * @param {(timeslice: any) => string} params.getFunctionName
 *    Get a unique name for a function. All timeslices that resolve to the same
 *    function name will be grouped together.
 * @param {number} params.threshold
 *    A probability -- any value above this will be considered significant
 *    enough to be highlighted in analysis.
 * @returns {stream.Stream} Results of the analysis.
 */
function analyze({ timeSlices, isSelected, getFunctionName, threshold }) {
  if (!(threshold >= 0) || !(threshold <= 100)) {
    return;
  }
  threshold /= 100;

  const functionsMap = new Map();
  let selectedTotal = 0;
  let unselectedTotal = 0;

  const mapBuildJobs = new scheduler.JobQueue();
  const MAP_BUILD_CHUNK_SIZE = 1000;
  const mapBuildChunkPromises = [];

  performance.mark("functions map build start");
  for (
    let i = 0;
    i < timeSlices.length + MAP_BUILD_CHUNK_SIZE;
    i += MAP_BUILD_CHUNK_SIZE
  ) {
    mapBuildChunkPromises.push(
      mapBuildJobs.add(() => {
        for (
          let j = i;
          j < i + MAP_BUILD_CHUNK_SIZE && j < timeSlices.length;
          j++
        ) {
          const timeSlice = timeSlices[j];
          const functionName = getFunctionName(timeSlice);
          if (!functionsMap.has(functionName)) {
            functionsMap.set(functionName, {
              name: functionName,
              time: 0,
              observed: 0,
              unselectedCount: 0,
              expected: 0,
              probability: 0,
              conclusion: ""
            });
          }

          const functionEntry = functionsMap.get(functionName);
          if (isSelected(timeSlice)) {
            selectedTotal++;
            functionEntry.time += timeSlice.numCPUTimerTicks;
            functionEntry.observed++;
          } else {
            unselectedTotal++;
            functionEntry.unselectedCount++;
          }
        }
      })
    );
  }

  return stream
    .fromPromise(
      Promise.all(mapBuildChunkPromises).then(() => ({
        selectedTotal,
        unselectedTotal,
        functions: [...functionsMap.values()]
      })),
      mapBuildJobs.clear
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
          const functionTestJobs = new scheduler.JobQueue();

          return stream.fromPromise(
            Promise.all(
              functions.map(func =>
                functionTestJobs.add(() => {
                  const curTotal = func.observed + func.unselectedCount;
                  const expected =
                    (curTotal * selectedTotal) / timeSlices.length;

                  const otherObserved = selectedTotal - func.observed;
                  const otherUnselectedCount =
                    unselectedTotal - func.unselectedCount;
                  const probability =
                    1 -
                    fastExactTest(
                      func.observed,
                      otherObserved,
                      func.unselectedCount,
                      otherUnselectedCount
                    );

                  const conclusion =
                    probability >= threshold && func.observed >= expected
                      ? "Unusually prevalent"
                      : probability >= threshold && func.observed < expected
                        ? "Unusually absent"
                        : "Insignificant";

                  return {
                    ...func,
                    expected,
                    probability,
                    conclusion
                  };
                })
              )
            ),
            functionTestJobs.clear
          );
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
            b.probability - a.probability ||
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
 * This is a fast implementation of Fisher's exact test. It cancels common
 * factors from the numerator and denominator, and alternates between division
 * and multiplication to prevent overflowing or underflowing.
 *
 * The wikipedia page for Fisher's Exact Test shows the following expanded form:
 *   p = (a+b)! * (c+d)! * (a+c)! * (b+d)! / (a! * b! * c! * d! * (a + b + c + d)!)
 * However, additional cancellation is possible. The first factor in the numerator
 * shares the sub-product of b! with the b! term in the denominator. Each numerator
 * term can cancel one of the factorial terms in the denominator, leaving:
 *   p = product(1+b to a+b) * product(c+1 to c+d)h * product(a+1 to a+c) * product(1+d to b+d) / (a + b + c + d)!
 *
 * The loop in this function performs a multiplication step in one of the five terms
 * of this simplified expression. If the running tally is above 1, it favors the
 * denominator term.
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
