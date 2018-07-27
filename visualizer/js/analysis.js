/**
 * Run analyses of data.
 * Fisher's exact test null hypothesis: the given function and other functions
 * are equally likely to be in the selection region.
 * @param timeSlices All the data.
 * @param {(stackFrames: Array) => string} getFunctionName
 *    Get a unique name for a function. All timeslices that resolve to the same
 *    function name will be grouped together.
 * @param threshold
 *    A probability -- any value above this will be considered significant
 *    enough to be highlighted in analysis.
 * @returns Results of the analysis.
 */
function analyze(timeSlices, getFunctionName, threshold) {
  if (!(threshold >= 0) || !(threshold <= 100)) {
    return;
  }
  threshold /= 100;
  const outputData = {
    selectedTotal: 0,
    unselectedTotal: 0,
    functions: []
  };

  const functionsMap = new Map();
  for (const timeSlice of timeSlices) {
    const functionName = getFunctionName(timeSlice.stackFrames);
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
    if (timeSlice.selected) {
      outputData.selectedTotal++;
      functionEntry.time += timeSlice.numCpuTimerTicks;
      functionEntry.observed++;
    } else {
      outputData.unselectedTotal++;
      functionEntry.unselectedCount++;
    }
  }

  outputData.functions = [...functionsMap.values()];

  if (outputData.selectedTotal !== 0 && outputData.unselectedTotal !== 0) {
    outputData.functions.forEach(cur => {
      const curTotal = cur.observed + cur.unselectedCount;
      cur.expected = (curTotal * outputData.selectedTotal) / timeSlices.length;

      const otherObserved = outputData.selectedTotal - cur.observed;
      const otherUnselectedCount =
        outputData.unselectedTotal - cur.unselectedCount;
      cur.probability =
        1 -
        fast_exact_test(
          cur.observed,
          otherObserved,
          cur.unselectedCount,
          otherUnselectedCount
        );

      if (cur.probability >= threshold && cur.observed >= cur.expected) {
        cur.conclusion = "Unusually prevalent";
      } else if (cur.probability >= threshold && cur.observed < cur.expected) {
        cur.conclusion = "Unusually absent";
      } else {
        cur.conclusion = "Insignificant";
      }

      /* console.log(`1A: ${cur.observed}, 1B: ${otherObserved}`);
      console.log(`2A: ${cur.unselectedCount}, 2B: ${otherUnselectedCount}`); */

      /* console.log(
        `Saw ${cur.observed} of ${cur.name}, expected ~${Math.round(
          cur.expected
        )}, probability ${cur.probability}`
      ); */
    });
  }

  outputData.functions.sort((a, b) => {
    const sort1 = b.probability - a.probability;
    const sort2 = b.observed - a.observed;
    const sort3 = b.time - a.time;
    if (sort1 !== 0) {
      return sort1;
    } else if (sort2 !== 0) {
      return sort2;
    } else {
      return sort3;
    }
  });
  return outputData;
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
 * favors the denominator term. */

function fast_exact_test(a, b, c, d) {
  let a_plus_b_fact_pos = b + 1;
  let c_plus_d_fact_pos = c + 1;
  let a_plus_c_fact_pos = a + 1;
  let b_plus_d_fact_pos = d + 1;
  let n_fact_pos = 1;

  const n = a + b + c + d;

  let result = 1;
  let done = false;

  while (!done) {
    if (result > 1 && n_fact_pos <= n) result /= n_fact_pos++;
    else if (a_plus_b_fact_pos <= a + b) result *= a_plus_b_fact_pos++;
    else if (c_plus_d_fact_pos <= c + d) result *= c_plus_d_fact_pos++;
    else if (a_plus_c_fact_pos <= a + c) result *= a_plus_c_fact_pos++;
    else if (b_plus_d_fact_pos <= b + d) result *= b_plus_d_fact_pos++;
    else if (n_fact_pos <= n) result /= n_fact_pos++;
    else done = true;
  }

  return result;
}

module.exports = { analyze };
