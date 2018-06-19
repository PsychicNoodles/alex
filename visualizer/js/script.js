/* ******************************* Require ********************************** */
const { ipcRenderer } = require("electron");
const fs = require("fs");

require("bootstrap");

const processData = require("./js/process-data");
const draw = require("./js/draw")

const yAxisLabel = "cache";
const xAxisLabel = "cyclesSoFar";

/* ******************************** Loading ********************************* */
/* This region should deal ONLY with the loading of the data. AFTER this, it
should send off the data to be processed. */
ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, resultFile) => {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile).toString());
  } catch (err) {
    alert(`Invalid result file: ${err.message}`);
    window.close();
  }

  const processedData = processData(result.timeslices, yAxisLabel);
  draw(processedData, xAxisLabel, yAxisLabel);
});

/* *************************** UI to choose xAxis *************************** */
// const button = function() {
//   const dispatch = d3.dispatch("press", "release");

//   const padding = 10;

//   function my(selection) {
//     selection.each(function(d, i) {
//       const g = d3
//         .select(this)
//         .attr("id", "d3-button" + i)
//         .attr("transform", "translate(" + 100 + "," + (d.y + 50) + ")");

//       const text = g.append("text").text(d.label);
//       g.append("defs");
//       const bbox = text.node().getBBox();
//       g.insert("rect", "text")
//         .attr("x", bbox.x - padding)
//         .attr("y", bbox.y - padding)
//         .attr("width", bbox.width + 2 * padding)
//         .attr("height", bbox.height + 2 * padding)
//         .on("mouseover", activate)
//         .on("mouseout", deactivate)
//         .on("click", toggle);

//       // addShadow.call(g.node(), d, i);
//       addGradient.call(g.node(), d, i);
//     });
//   }

//   function addGradient(d, i) {
//     const defs = d3.select(this).select("defs");
//     const gradient = defs
//       .append("linearGradient")
//       .attr("id", "gradient" + i)
//       .attr("x1", "0%")
//       .attr("y1", "0%")
//       .attr("x2", "0%")
//       .attr("y2", "100%");

//     gradient
//       .append("stop")
//       .attr("id", "gradient-start")
//       .attr("offset", "0%");

//     gradient
//       .append("stop")
//       .attr("id", "gradient-stop")
//       .attr("offset", "100%");

//     d3.select(this)
//       .select("rect")
//       .attr("fill", "url(#gradient" + i + ")");
//   }

  // function addShadow(d, i) {
  //   let defs = d3.select(this).select("defs");
  //   let rect = d3
  //     .select(this)
  //     .select("rect")
  //     .attr("filter", "url(#dropShadow" + i + ")");
  //   let shadow = defs
  //     .append("filter")
  //     .attr("id", "dropShadow" + i)
  //     .attr("x", rect.attr("x"))
  //     .attr("y", rect.attr("y"))
  //     .attr("width", rect.attr("width") + offsetX)
  //     .attr("height", rect.attr("height") + offsetY);

  //   shadow
  //     .append("feGaussianBlur")
  //     .attr("in", "SourceAlpha")
  //     .attr("stdDeviation", 2);

  //   shadow
  //     .append("feOffset")
  //     .attr("dx", offsetX)
  //     .attr("dy", offsetY);

  //   let merge = shadow.append("feMerge");

  //   merge.append("feMergeNode");
  //   merge.append("feMergeNode").attr("in", "SourceGraphic");
  // }

//   function activate() {
//     const gradient = d3.select(this.parentNode).select("linearGradient");
//     d3.select(this.parentNode)
//       .select("rect")
//       .classed("active", true);
//     if (!gradient.node()) return;
//     gradient.select("#gradient-start").classed("active", true);
//     gradient.select("#gradient-stop").classed("active", true);
//   }

//   function deactivate() {
//     const gradient = d3.select(this.parentNode).select("linearGradient");
//     d3.select(this.parentNode)
//       .select("rect")
//       .classed("active", false);
//     if (!gradient.node()) return;
//     gradient.select("#gradient-start").classed("active", false);
//     gradient.select("#gradient-stop").classed("active", false);
//   }

//   function toggle(d, i) {
//     if (d3.select(this).classed("pressed")) {
//       release.call(this, d, i);
//       deactivate.call(this, d, i);
//     } else {
//       press.call(this, d, i);
//       activate.call(this, d, i);
//     }
//   }

//   function press(d, i) {
//     dispatch.call("press", this, d, i);
//     d3.select(this).classed("pressed", true);
//     // let shadow = d3.select(this.parentNode).select('filter')
//     // if (!shadow.node()) return;
//     // shadow.select('feOffset').attr('dx', 0).attr('dy', 0);
//     // shadow.select('feGaussianBlur').attr('stdDeviation', 0);
//   }

//   function release(d, i) {
//     dispatch.call("release", this, d, i);
//     my.clear.call(this, d, i);
//   }

//   my.clear = function() {
//     d3.select(this).classed("pressed", false);
//     // let shadow = d3.select(this.parentNode).select('filter')
//     // if (!shadow.node()) return;
//     // shadow.select('feOffset').attr('dx', offsetX).attr('dy', offsetY);
//     // shadow.select('feGaussianBlur').attr('stdDeviation', stdDeviation);
//   };

//   my.on = function() {
//     const value = dispatch.on.apply(dispatch, arguments);
//     return value === dispatch ? my : value;
//   };

//   return my;
// };

// const data = [
//   { label: "cyclesSoFar", x: 0, y: 0 },
//   { label: "instructionsSoFar", x: 0, y: 100 }
// ];

// const buttonFunc = button()
//   .on("press", function(d) {
//     clearAll();
//     xAxisLabel = d.label;
//     const densityMax = draw(timeslices);
//     drawLegend(densityMax);
//   })
//   .on("release", function(d, i) {
//     console.log("Released", d, i, this.parentNode);
//   });

// // Add buttons
// const buttons = d3
//   .select("#buttons")
//   .selectAll(".button")
//   .data(data)
//   .enter()
//   .append("g")
//   .attr("class", "button")
//   .call(buttonFunc);

// function clearAll() {
//   buttons.selectAll("rect").each(function(d, i) {
//     buttonFunc.clear.call(this, d, i);
//   });
// }
