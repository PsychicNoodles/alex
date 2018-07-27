function render(root, header) {
  const data = [
    { title: "Program Name", value: header.programName },
    { title: "Program Version", value: header.programVersion }
  ];

  if (root.select("h3").empty()) {
    root.append("h3").text("Program Info");
  }

  const list = root.select("ul").empty()
    ? root.append("ul")
    : root.select("ul");

  const eachListElement = list
    .selectAll("li") // even if they're imaginary at this point
    .data(data)
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
module.exports = { render };
