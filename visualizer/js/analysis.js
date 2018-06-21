const { partition } = require("lodash");

module.exports = chiSquared;

/**
 * Compares selected data's function use to that of the unselected data.
 * (at least according to my current understanding)
 *
 * @param data all data available, not just selected data
 * @returns not sure yet!
 */
function chiSquared(data) {
    /* Splits data into one object containing two groups. The first group 
    contains selected data. The second contains unselected data. */
    const partitioned = partition(data, "selected");
}