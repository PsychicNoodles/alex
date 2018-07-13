function render(root, { percentage, text, isVisible }) {
  root
    .classed("progress-bar", true)
    .classed("progress-bar--visible", isVisible);

  if (root.select(".progress-bar__bar").empty()) {
    root.append("div").attr("class", "progress-bar__bar");
  }

  if (root.select(".progress-bar__text").empty()) {
    root.append("div").attr("class", "progress-bar__text");
  }

  root
    .select(".progress-bar__bar")
    .style(
      "transform",
      `translateX(${percentage / 2 - 50}%) scaleX(${percentage / 100})`
    );

  root
    .select(".progress-bar__text")
    .text(`${text} (${Math.round(percentage)}%)`);
}

module.exports = { render };
