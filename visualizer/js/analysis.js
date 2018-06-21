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
    const partitioned = partition(data, "selected");
}
