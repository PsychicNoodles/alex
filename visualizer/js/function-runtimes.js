/**
 * Create a table of function runtimes
 */

const d3 = require("d3");

/**
 * @param {d3.Selection} root
 */
function render(root, { functions, functionsAreSelectable, onFunctionSelect }) {
  root.classed("function-runtimes", true);

  root.select(".function-runtimes__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "function-runtimes__header-row");
  headerRowSelection.append("th").text("Function Name");
  headerRowSelection.append("th").text("Conclusion");
  headerRowSelection.append("th").text("Probability");
  headerRowSelection.append("th").text("Expected");
  headerRowSelection.append("th").text("Observed");
  headerRowSelection.append("th").text("CPU Time");

  const MAX_NUM_FUNCTIONS = 100;
  const tableDataSelection = root
    .selectAll(".function-runtimes__data-row")
    .data(functions.slice(0, MAX_NUM_FUNCTIONS));

  tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "function-runtimes__data-row")
    .merge(tableDataSelection)
    .each(function({
      name,
      displayNames,
      conclusion,
      probability,
      expected,
      observed,
      time
    }) {
      const row = d3
        .select(this)
        .selectAll(".function-runtimes__data-column")
        .data([
          null,
          conclusion,
          d3.format(".1%")(probability),
          expected.toFixed(0),
          observed,
          d3.format(".4s")(time)
        ]);

      row
        .enter()
        .append("td")
        .attr("class", "function-runtimes__data-column")
        .merge(row)
        .each((text, i, groups) => {
          if (i === 0) {
            const namePartsSelection = d3
              .select(groups[i])
              .selectAll(".function-runtimes__name-part")
              .data(displayNames);

            namePartsSelection
              .enter()
              .append("span")
              .attr("class", "function-runtimes__name-part")
              .merge(namePartsSelection)
              .text(namePart => namePart);

            namePartsSelection.exit().remove();

            d3.select(groups[i])
              .classed(
                "function-runtimes__data-column--clickable",
                functionsAreSelectable
              )
              .on(
                "click",
                functionsAreSelectable ? () => onFunctionSelect(name) : null
              );
          } else {
            d3.select(groups[i]).text(text);
          }
        });

      row.exit().remove();
    });

  tableDataSelection.exit().remove();
}

module.exports = { render };
