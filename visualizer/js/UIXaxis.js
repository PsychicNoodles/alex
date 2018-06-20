let button = function() {
  function my(selection) {
    selection.each(function(d, i) {
      let label = d3
        .select(this)
        .text(d);

      let input = label.append("input")
        .attr("type", "radio")
        .attr("name", "radio")
        .attr("value", d)
        ;

      label.append("span")
      .attr("class","checkmark");

    });
  }
  return my;
};

let data = ["CPUCyclesAcc","instructionsAcc"];

let buttonFunc = button()
  ;

// Add buttons
let buttons = d3
  .select("#buttons")
  .selectAll(".container")
  .data(data)
  .enter()
  .append("label")
  .attr("class", "container")
  .call(buttonFunc);


  document.querySelector("#buttons").addEventListener("change",function(event) {
    chooseXAxis = event.target.value;
    let densityMax = drawPlot(timeslices);
    legend(densityMax);
  })