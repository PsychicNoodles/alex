function render(root, header) {
  if (root.select("h3").empty()) {
    root.append("h3").text("Program Info");
  }

  const list = root.select("ul").empty()
    ? root.append("ul")
    : root.select("ul");

  const listElements = list
    .selectAll("li")
    .data(header => [
      { key: "Program Name", value: header.programName },
      { key: "Program Version", value: header.programVersion }
    ])
    .attr("textContent", datum => datum.key);
}
module.exports = { render };
