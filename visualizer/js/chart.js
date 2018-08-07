const d3 = require("d3");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const plot = require("./plot");
const brushes = require("./brushes");
const warnings = require("./warnings");
const legend = require("./legend");
const saveToFile = require("./save-to-file");
const { computeRenderableData } = require("./process-data");
const stream = require("./stream");

const WIDTH = 500;
const HEIGHT = 250;

const yScaleSubscription = d3.local();
const plotAndFunctionSubscription = d3.local();

const stylesFileContents = promisify(fs.readFile)(
  path.join(__dirname, "../css/chart-svg.css"),
  { encoding: "utf8" }
);

/**
 * @param {d3.Selection} root
 * @param {Object} props
 * @param {string} props.xAxisLabelText
 * @param {string} props.yAxisLabelText
 */
function render(
  root,
  {
    getIndependentVariable,
    getDependentVariable,
    xAxisLabelText,
    yAxisLabelText,
    chartId,
    xScale,
    yScale,
    yFormat,
    filteredData,
    spectrum,
    cpuTimeOffset,
    warningRecords,
    warningsDistinct,
    currentYScaleStore,
    processedData,
    selectedFunctionStream
  }
) {
  root.classed("chart", true);
  root.attr("id", chartId);

  const svg = root.select("svg.chart__svg").empty()
    ? root
        .append("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("class", "chart__svg")
        .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    : root.select("svg.chart__svg");

  //warnings
  if (root.select("g.warning-lines").empty()) {
    svg.append("g").call(warnings.renderLines, {
      xScale,
      warningRecords,
      warningsDistinct,
      cpuTimeOffset
    });
  }

  //chartPlot
  const chartPlot = root.select("g.plot").empty()
    ? svg.append("g")
    : svg.select("g.plot");

  //xaxis
  const xAxis = root.select("g.chart__axis--x").empty()
    ? svg
        .append("g")
        .attr("class", "chart__axis chart__axis--x")
        .attr("transform", `translate(0, ${HEIGHT})`)
    : svg.select("g.chart__axis--x");

  xAxis.call(d3.axisBottom(xScale).tickFormat(d3.format(".2s")));

  root.select(".chart__axis-label--x").empty()
    ? svg
        .append("text")
        .attr("class", "chart__axis-label chart__axis-label--x")
        .attr("text-anchor", "middle")
        .attr("x", WIDTH / 2)
        .attr("y", HEIGHT + 50)
        .text(xAxisLabelText)
    : svg.select("chart__axis-label--x");

  //still in progress still in progress still in progress
  if (yAxisLabelText === "L3 Cache Miss Rate") {
    const hitExtent = d3
      .extent(processedData, d => d.events["MEM_LOAD_RETIRED.L3_HIT"])
      .reverse();
    const missExtent = d3
      .extent(processedData, d => d.events["MEM_LOAD_RETIRED.L3_MISS"])
      .reverse();
    const hitScale = d3
      .scaleLinear()
      .domain(hitExtent)
      .range([0, 125]);
    const missScale = d3
      .scaleLinear()
      .domain(missExtent)
      .range([250, 125]);

    if (root.select("svg.bg").empty()) {
      svg
        .append("svg")
        .classed("bg", true)
        .selectAll(".line")
        .data(processedData)
        .enter()
        .append("line")
        .attr("class", "line")
        .attr("x1", d => xScale(getIndependentVariable(d)))
        .attr("x2", d => xScale(getIndependentVariable(d)))
        .attr("y1", d => hitScale(d.events["MEM_LOAD_RETIRED.L3_HIT"]))
        .attr("y2", d => missScale(d.events["MEM_LOAD_RETIRED.L3_MISS"]))
        .style("stroke-width", 0.5)
        .style("stroke", "green")
        .style("stroke-opacity", 0.5);
    }
  }
  //ignore this part if you are not xinya

  //brushes
  if (root.select("g.brushes").empty()) {
    svg.append("g").call(brushes.render);
  }

  if (root.select(".chart__save").empty()) {
    root
      .append("button")
      .attr("class", "chart__save")
      .text("Save As SVG")
      .call(saveToFile.render, {
        fileType: "svg",
        filePrefix:
          "-" + yAxisLabelText.toLocaleLowerCase().replace(/\s+/g, "-"),
        generateFileData: async () => {
          const LEFT_MARGIN = 100;
          const RIGHT_MARGIN = 100;
          const TOP_MARGIN = 20;
          const BOTTOM_MARGIN = 100;

          const viewX = -LEFT_MARGIN;
          const viewY = -TOP_MARGIN;
          const viewW = WIDTH + LEFT_MARGIN + RIGHT_MARGIN;
          const viewH = HEIGHT + TOP_MARGIN + BOTTOM_MARGIN;

          /** @type {SVGElement} */
          const svgNode = root
            .select(".chart__svg")
            .node()
            .cloneNode(true);
          svgNode.setAttribute(
            "viewBox",
            `${viewX} ${viewY} ${viewW} ${viewH}`
          );

          const background = document.createElement("rect");
          background.setAttribute("id", "chart-background");
          background.setAttribute("fill", "#ffffff");
          background.setAttribute("x", viewX);
          background.setAttribute("y", viewY);
          background.setAttribute("width", viewW);
          background.setAttribute("height", viewH);
          svgNode.insertBefore(background, svgNode.firstChild);

          const styles = document.createElement("style");
          styles.innerHTML = await stylesFileContents;
          svgNode.appendChild(styles);

          return svgNode.outerHTML;
        }
      });
  }

  const plotDataStream = currentYScaleStore.stream.pipe(
    stream.map(currentYScale =>
      computeRenderableData({
        data: filteredData,
        xScale,
        yScale: currentYScale,
        getIndependentVariable,
        getDependentVariable
      })
    )
  );

  stream.fromStreamables([currentYScaleStore.stream, plotDataStream]).pipe(
    stream.subscribeUnique(
      root,
      yScaleSubscription,
      ([currentYScale, plotData]) => {
        const densityMax =
          Math.max(d3.max(plotData, d => d.densityAvg), 5) || 0;

        chartPlot.call(plot.render, {
          data: plotData,
          xGetter: d => xScale(getIndependentVariable(d)),
          yGetter: d => currentYScale(getDependentVariable(d)),
          densityMax,
          spectrum
        });

        //yAxis
        const yAxis = root.select("g.chart__axis--y").empty()
          ? svg.append("g").attr("class", "chart__axis chart__axis--y")
          : svg.select("g.chart__axis--y");

        yAxis.call(d3.axisLeft(currentYScale).tickArguments([10, yFormat]));

        root.select(".chart__axis-label--y").empty()
          ? svg
              .append("text")
              .attr("class", "chart__axis-label chart__axis-label--y")
              .attr("text-anchor", "middle")
              .attr("y", -1 * yAxis.node().getBBox().width - 10)
              .attr("x", -(HEIGHT / 2))
              .attr("transform", "rotate(-90)")
              .text(yAxisLabelText)
          : svg
              .select(".chart__axis-label--y")
              .text(yAxisLabelText)
              .attr("y", -1 * yAxis.node().getBBox().width - 10);

        //side bar
        const sideBar = root.select("g.chart__sideBar").empty()
          ? svg
              .append("g")
              .attr("class", "chart__sideBar")
              .attr("transform", `translate(${WIDTH * 1.01}, 0)`)
          : svg.select("g.chart__sideBar");

        const sideBarPlot = sideBar.select("g.plot").empty()
          ? sideBar.append("g")
          : sideBar.select("g.plot");

        sideBarPlot.call(plot.render, {
          data: plotData,
          xGetter: d => xScale(getIndependentVariable(d) * 0.075),
          yGetter: d => yScale(getDependentVariable(d)),
          densityMax,
          spectrum
        });

        //brush
        const brush = d3.brushY().extent([[0, 0], [WIDTH * 0.075, HEIGHT]]);
        brush.on("end", brushed);

        const sideBarBrush = sideBar.select("g.sideBar-brush").empty()
          ? sideBar
              .append("g")
              .attr("class", "sideBar-brush")
              .call(brush)
              .call(brush.move, currentYScale.domain().map(d => yScale(d)))
          : sideBar.select("g.sideBar-brush");

        sideBarBrush
          .selectAll(".handle")
          .attr("fill", "#666")
          .attr("fill-opacity", 0.8);

        function brushed() {
          const s = d3.event.selection || yScale.range();
          const newDomain = s.map(yScale.invert, yScale).map(n => n.toFixed(7));
          const oldDomain = currentYScale.domain().map(n => n.toFixed(7));
          if (oldDomain[0] !== newDomain[0] || oldDomain[1] !== newDomain[1]) {
            currentYScaleStore.dispatch(() =>
              d3
                .scaleLinear()
                .domain(newDomain)
                .range(yScale.range())
            );
          }
        }

        //legend
        const chartLegend = root.select("g.chart__legend").empty()
          ? svg
              .append("g")
              .attr("class", "chart__legend")
              .attr("transform", `translate(${WIDTH * 0.7}, ${HEIGHT + 1.1})`)
          : svg.select("g.chart__legend");

        chartLegend.call(legend.render, {
          densityMax,
          spectrum
        });
      }
    )
  );

  stream.fromStreamables([plotDataStream, selectedFunctionStream]).pipe(
    stream.subscribeUnique(
      root,
      plotAndFunctionSubscription,
      ([plotData, selectedFunction]) => {
        chartPlot
          .selectAll("circle")
          .data(plotData)
          .style(
            "opacity",
            d =>
              selectedFunction === null ? 1 : d.funcInfo[selectedFunction] || 0
          );
      }
    )
  );
}

module.exports = { render, WIDTH, HEIGHT };
