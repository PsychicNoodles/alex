const d3 = require("d3");

const { Store } = require("./store");

const timestampDivisorSubscription = d3.local();
const timestampDivisorStore = new Store(1);

const ERROR_DESCRIPTIONS = {
  PERF_RECORD_THROTTLE:
    "Too many samples due to the period being too low, try increasing the period",
  PERF_RECORD_UNTHROTTLE: "Period was high enough and decreased back down",
  PERF_RECORD_LOST:
    "Some events were lost, possibly due to the period being too low"
};

function render(root, { errors, cpuTimeOffset }) {
  root.classed("error-list", true);

  root.select(".error-list__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "error-list__header-row");
  headerRowSelection.append("th").text("Type");

  const timestampUnitsSelect = headerRowSelection
    .append("th")
    .text("Timestamp")
    .append("select");

  timestampUnitsSelect
    .selectAll("option")
    .data([["Nanoseconds", 1], ["Seconds", 1000000000]])
    .enter()
    .append("option")
    .attr("value", d => d[1])
    .text(d => d[0]);

  headerRowSelection.append("th").text("Value");

  const tableDataSelection = root
    .selectAll(".error-list__data-row")
    .data(errors);

  const tableDataSelectionEnter = tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "error-list__data-row")
    .merge(tableDataSelection);

  tableDataSelectionEnter
    .append("td")
    .append("abbr")
    .attr("class", "error-list__data-row-type")
    .attr("title", e => ERROR_DESCRIPTIONS[e.type])
    .text(e => e.type);

  const tableDataTimestamp = tableDataSelectionEnter
    .append("td")
    .attr("class", "error-list__data-row-timestamp");

  tableDataSelectionEnter
    .append("td")
    .attr("class", "error-list__data-row-value")
    .text(e => {
      if (
        e.type === "PERF_RECORD_THROTTLE" ||
        e.type === "PERF_RECORD_UNTHROTTLE"
      ) {
        return `period changed to ${e.period}`;
      } else if (e.type === "PERF_RECORD_LOST") {
        return `lost ${e.lost} events`;
      }
    });

  timestampDivisorStore.subscribeUnique(
    root,
    timestampDivisorSubscription,
    timestampDivisor => {
      tableDataTimestamp.text(e => (e.time - cpuTimeOffset) / timestampDivisor);

      // option elements don't actually get the change event, their parent select does
      timestampUnitsSelect.on("change", function() {
        const opt = this.selectedOptions[0];
        timestampDivisorStore.dispatch(() => opt.value);
      });
    }
  );

  tableDataSelection.exit().remove();
}

module.exports = { render };
