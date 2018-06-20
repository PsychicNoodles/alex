const button = function() {
  function my(selection) {
    selection.each(function(d, i) {
      const label = d3.select(this).text(d);

      const input = label
        .append("input")
        .attr("type", "radio")
        .attr("name", "radio")
        .attr("value", d);

      label.append("span").attr("class", "checkmark");
    });
  }
  return my;
};

const data = ["CPUCyclesAcc", "instructionsAcc"];

const buttonFunc = button();

// Add buttons
const buttons = d3
  .select("#buttons")
  .selectAll(".container")
  .data(data)
  .enter()
  .append("label")
  .attr("class", "container")
  .call(buttonFunc);

document.querySelector("#buttons").addEventListener("change", event => {
  chooseXAxis = event.target.value;
  let densityMax = drawPlot(timeslices);
  legend(densityMax);
});
