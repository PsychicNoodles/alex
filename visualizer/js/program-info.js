const { Store } = require("./store");

const store = new Store({
  programName: "",
  programVersion: ""
});

function render(root, header) {
  const firstPartData = [
    { title: "ALEX Version", value: header.programVersion },
    { title: "Program Name", value: header.programName }
  ];

  const dataWithInput = header.programInput
    ? [...firstPartData, { title: "Program Input", value: header.programInput }]
    : firstPartData;

  const data =
    header.programArgs.length === 0
      ? dataWithInput
      : [
          ...dataWithInput,
          { title: "args", value: header.programArgs.join(" ") }
        ];

  if (root.select("h3").empty()) {
    root.append("h3").text("Program Info");
  }

  const list = root.select("ul").empty()
    ? root.append("ul")
    : root.select("ul");

  const eachListElement = list
    .selectAll("li") // even if they're imaginary at this point
    .data(data.map(d => ({ ...d, value: insertZeroWidthSpaces(d.value) })))
    .enter() // for each of these data
    .append("li");

  eachListElement
    .append("span")
    .attr("class", "title")
    .text(d => `${d.title}:`);

  eachListElement
    .append("span")
    .attr("class", "value")
    .text(d => d.value);
}

/**
 * Add zero with spaces behind all characters that are non-alphanumeric and
 * non-whitespace.
 *
 * This ensures that long paths will have the appropriate line breaks.
 *
 * @param {string} string
 */
function insertZeroWidthSpaces(string) {
  return string.replace(/(?=\S)[\W_]/g, "$&" + String.fromCharCode(0x200b));
}

module.exports = { render, store };
