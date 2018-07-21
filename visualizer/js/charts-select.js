const d3 = require("d3");

const { Store } = require("./store");

const hiddenChartsSubscription = d3.local();
const hiddenChartsStore = new Store([]);

function render(root, { chartsWithYScales }) {
  if (root.select("h3").empty()) {
    root.append("h3").text("Charts");
  }
  const chartsListSelection = root.select("div").empty()
    ? root.append("div")
    : root.select("div");

  const checkboxes = chartsListSelection
    .attr("class", "list")
    .selectAll("label")
    .data(chartsWithYScales)
    .enter()
    .append("label")
    .attr("class", "list__chart-item");

  checkboxes.append("input").attr("type", "checkbox");

  checkboxes.append("span").text(chart => chart.yAxisLabel);

  hiddenChartsStore.subscribeUnique(
    root,
    hiddenChartsSubscription,
    hiddenCharts => {
      checkboxes.merge(checkboxes).each(function(chart) {
        d3.select(this)
          .select("input")
          .property("checked", !hiddenCharts.includes(chart))
          .on("change", function() {
            if (this.checked) {
              hiddenChartsStore.dispatch(hiddenCharts =>
                hiddenCharts.filter(hiddenChart => hiddenChart !== chart)
              );
            } else {
              hiddenChartsStore.dispatch(hiddenCharts => [
                ...hiddenCharts,
                chart
              ]);
            }
          });
      });
    }
  );
}

module.exports = { render, hiddenChartsStore };
