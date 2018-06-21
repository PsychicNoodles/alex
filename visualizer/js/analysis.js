const { partition } = require("lodash");

module.exports = chiSquared;

/**
 * Compares selected data's function use to that of the unselected data.
 * (at least according to my current understanding)
 *
 * @param data all data available, not just selected data
 * @returns not sure yet!
 * @todo Best to test if partition is more performant than a simple loop.
 */
function chiSquared(data) {
    /* Compile a list that contains every function entered by the collector. */
    const collectedFunctions = [];
    data.forEach(datum => {
        if (!(collectedFunctions.includes(datum.function))) {
            collectedFunctions.push(datum.function);
        }
    });
    /* Splits data into one object containing two groups. The first group 
    contains selected data. The second contains unselected data. */
    const partitioned = partition(data, "selected");
    const selected = partitioned[0];
    const unselected = partitioned[1];
}