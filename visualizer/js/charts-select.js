const d3 = require("d3");

const { Store } = require("./store");

const hiddenChartsSubscription = d3.local();
const hiddenChartsStore = new Store([]);

function render(root, { visibleCharts }) {
  if (root.select("h3").empty()) {
    root.append("h3").text("Charts");
  }
  const chartsListSelection = root.select("div").empty()
    ? root.append("div")
    : root.select("div");

  const checkboxes = chartsListSelection
    .attr("class", "list")
    .selectAll("label")
    .data(visibleCharts)
    .enter()
    .append("label")
    .attr("class", "list__chart-item");

  checkboxes.append("input").attr("type", "checkbox");

  checkboxes.append("span").text(chart => chart.yAxisLabelText);

  hiddenChartsStore.subscribeUnique(
    root,
    hiddenChartsSubscription,
    hiddenCharts => {
      checkboxes.merge(checkboxes).each(function(chart) {
        d3.select(this)
          .select("input")
          .property("checked", !hiddenCharts.includes(chart.id))
          .on("change", function() {
            if (this.checked) {
              hiddenChartsStore.dispatch(hiddenCharts =>
                hiddenCharts.filter(hiddenChartId => hiddenChartId !== chart.id)
              );
            } else {
              hiddenChartsStore.dispatch(hiddenCharts => [
                ...hiddenCharts,
                chart.id
              ]);
            }
          });
      });
    }
  );
}

module.exports = { render, hiddenChartsStore };
