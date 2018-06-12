// Set size and margins of graph
var width = window.innerWidth
var height = width * .7
var verticalPad = 20
var horizontalPad = 50
var xScale
var yScale
var xAxis
var yAxis
var timeslices
var circles
var brush

// Create an svg object for the graph
var svg = d3
  .select('#plot')
  .attr('width', width)
  .attr('height', height)

/* ******************************** LOADING ********************************* */
document.getElementById('data-input').addEventListener('change', loadFile, false)

function loadFile() {
  var reader = new FileReader()
  reader.onload = function(event) {
    if (event.target.readyState != 2 || event.target.error) return
    timeslices = JSON.parse(this.result).timeslices
    svg.selectAll('*').remove()
    draw(timeslices)
  }

  var file = document.getElementById('data-input').files[0]
  if (file) {
    reader.readAsText(file)
  }
}

/* ******************************** RESIZING ******************************** */

window.addEventListener('resize', resizeGraph, false)
function resizeGraph () {
  width = window.innerWidth - horizontalPad * 2
  height = .7 * width
  
  xScale.range([horizontalPad, width - verticalPad])
  yScale.range([verticalPad, height - verticalPad * 3])

  
  svg.attr('width', width + horizontalPad * 2)
    .attr('height', height + verticalPad * 2)
  
  xAxis.scale(xScale)
  yAxis.scale(yScale)

  svg.select('#xAxis.axis').attr('transform','translate(0,' + height + ')').call(xAxis)

  svg.select('#yAxis.axis').call(yAxis)

  svg.selectAll('circle')
    .attr('cx', function (d) {
      return xScale(d.totalCycles)
    })
    .attr('cy', function (d) {
      if (isNaN(yScale(d.events.missRates))) {
        return 0
      }
      return yScale(d.events.missRates)
    }
    )

}

/* ****************************** DRAWING *********************************** */
function draw (timeslices) {
  svg.selectAll('*').remove()
  processData(timeslices, chooseResource())
  processData(timeslices, chooseXAxis())
  scatterPlot(densityInfo(timeslices))
}

/* Lets users to choose which resource they want the tool to present and analyze on */
function chooseXAxis () {
  // need work!
  return 'numInstructions'
}

/* Lets users to choose which resource they want the tool to present and analyze on */
function chooseResource () {
  // need work!
  return 'cache'
}

/* This function will take the raw array and a string of a specified property and process the related datum, etc */
function processData (timeslices, resource) {
  switch (resource) {
    case 'numInstructions':
      timeslices[0].instructionsAcc = timeslices[0].numInstructions
      timeslices[0].totalCycles = timeslices[0].numCPUCycles
      for (var i = 1; i < timeslices.length; i++) {
        var cur = timeslices[i]
        cur.totalCycles = cur.numCPUCycles + timeslices[i - 1].totalCycles
        cur.instructionsAcc = cur.numInstructions + timeslices[i - 1].instructionsAcc
        cur.selected = false
      }
      break
    case 'cache':
      timeslices[0].totalCycles = timeslices[0].numCPUCycles
      var total = timeslices[0].events['MEM_LOAD_RETIRED.L3_MISS'] + timeslices[0].events['MEM_LOAD_RETIRED.L3_HIT']
      if(total == 0) {
        timeslices[0].missRates = 0
      } else {
        timeslices[0].missRates = timeslices[0].events['MEM_LOAD_RETIRED.L3_MISS'] / total
      }
      for (let i = 1; i < timeslices.length; i++) {
        let cur = timeslices[i]
        total = cur.events['MEM_LOAD_RETIRED.L3_MISS'] + cur.events['MEM_LOAD_RETIRED.L3_HIT']
        if (total === 0) {
          cur.events.missRates = 0
        } else {
          cur.events.missRates = cur.events['MEM_LOAD_RETIRED.L3_MISS'] / total
        }
        cur.totalCycles = cur.numCPUCycles + timeslices[i - 1].totalCycles
        cur.selected = false
      }
      break
    case 'power':
      // power(timeslices, i)
      break
    case 'branchPredictor':
      // branchPredictor(timeslices, i)
      break
  }
}

/* This function helps prepare for the scale, finding the max using attr, a string */
function findMax (timeslices, attr) {
  switch (attr) {
    case 'numInstructions':
      return d3.max(timeslices, function (d) {
        return d.numInstructions
      })
    case 'cache':
      var max = d3.max(timeslices, function (d) {
        return d.events.missRates
      })
      return max
    case 'density':
      return d3.max(timeslices, function (d) {
        return d.density
      })
  }
}

// This func will draw the axes
function drawAxes(xScale, yScale) {
  // Create axes and format the ticks on the y-axis as percentages
  var formatAsPercentage = d3.format('.0%')
  var abbrev = d3.format('.0s')
  xAxis = d3.axisBottom(xScale).tickFormat(abbrev)
  yAxis = d3.axisLeft(yScale).tickFormat(formatAsPercentage)

  // Add the axes to the svg object
  svg
    .append('g')
    .attr('id', 'xAxis')
    .attr('class', 'axis')
    .attr('transform', 'translate(0, ' + (height - verticalPad * 2) + ')')
    .call(xAxis)

  svg
    .append('g')
    .attr('id', 'yAxis')
    .attr('class', 'axis')
    .attr('transform', 'translate(' + (horizontalPad - verticalPad) + ', 0)')
    .call(yAxis)

  // Add labels to the axes
  svg
    .select('xAxis')
    .append('text')
    .attr('class', 'x label')
    .attr('text-anchor', 'end')
    .attr('x', width / 2 + horizontalPad)
    .attr('y', height)
    .text(chooseXAxis())

  svg
    .select('yAxis')
    .append('text')
    .attr('class', 'y label')
    .attr('text-anchor', 'end')
    .attr('y', 6)
    .attr('x', (-1 * (height - verticalPad)) / 2)
    .attr('dy', '.75em')
    .attr('transform', 'rotate(-90)')
    .text('Cache miss rate')
}

/* This func makes the scatter plot */
function scatterPlot (timeslices) {
  // Calculate size of x-axis based on number of data points
  var xAxisMax = timeslices[timeslices.length - 1].totalCycles
  var yAxisMax = findMax(timeslices, chooseResource())
  var densityMax = findMax(timeslices, 'density')

  /* Create functions to scale objects vertically and horizontally according to
  the size of the graph */
  xScale = d3
    .scaleLinear()
    .domain([0, xAxisMax])
    .range([horizontalPad, width - verticalPad])
  yScale = d3
    .scaleLinear()
    .domain([yAxisMax, 0])
    .range([verticalPad, height - verticalPad * 3])
  var rainbow = d3.scaleSequential(d3.interpolateRainbow)

  drawAxes(xScale, yScale)

  // Create the points and position them in the graph
  circles = svg
    .selectAll('circle')
    .data(timeslices)
    .enter()
    .append('circle')
    .attr('cx', function (d) {
      return xScale(d.totalCycles)
    })
    .attr('cy', function (d) {
      if(isNaN(yScale(d.events.missRates))) {
        return 0
      }
      return yScale(d.events.missRates)
    }
    )
    .attr('r', 2)
    .style('fill', function (d) {
      return rainbow(Math.log(d.density / densityMax) * 40)
    })

    // Create brush
  brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on('brush', brushed)
    .on('end', createTable)

    // Add brush to svg object
  svg.append('g')
    .call(brush)
    .call(brush.move, [3, 5].map(x))
    .selectAll('.overlay')
    .each(function(d) { d.type = 'selection' })
    .on('mousedown touchstart', brushcentered)
}

/** *************************selector selector selector ********************************************************** */
// Re-center brush when the user clicks somewhere in the graph
function brushcentered() {
  var dx = x(1) - x(0), // Use a fixed width when recentering.
    cx = d3.mouse(this)[0],
    x0 = cx - dx / 2,
    x1 = cx + dx / 2
  d3.select(this.parentNode).call(brush.move, x1 > width ? [width - dx, width] : x0 < 0 ? [0, dx] : [x0, x1])
}

// Create a table of the points selected by the brush
function createTable() {
  d3.selectAll('.row_data').remove()
  d3.select('table').style('visibility', 'visible')

  var circlesSelected = d3.selectAll('.brushed').data()

  if(circlesSelected.length > 0) {
    timeslices.forEach(function(d) {
      if(d.selected) {
        var formatRate = d3.format('.1%')
        var data = [d.totalCycles, d.events['MEM_LOAD_RETIRED.L3_MISS'], d.events['MEM_LOAD_RETIRED.L3_HIT'], formatRate(d.events.missRates)]
      
        d3.select('table')
          .append('tr')
          .attr('class', 'row_data')
          .selectAll('td')
          .data(data)
          .enter()
          .append('td')
          .attr('align', (d, i) => i == 0 ? 'left' : 'right')
          .text(d => d)
      }
    })
  }
}

// Re-color the circles in the region that was selected by the user
function brushed() {
  if(d3.event.selection != null) {
    circles.attr('class', 'circle')
    var brushArea = d3.brushSelection(this)

    circles.filter(function () {
      var cx = d3.select(this).attr('cx')
      return brushArea[0] <= cx && cx <= brushArea[1] 
    })
      .attr('class', 'brushed')

    for(var i = 0; i < timeslices.length; i++) {
      timeslices[i].selected = false
    }
    
    timeslices.map(function (d) {
      if(brushArea[0] <= xScale(d.totalCycles) && xScale(d.totalCycles) <= brushArea[1]) {
        d.selected = true
      }
    })
  }
}

var x = d3.scaleLinear()
  .domain([0, 10])
  .range([0, width])

// Collect a list of nodes to draw rectangles, adding extent and depth data
function getDepth (cur, depth) {
  if (cur !== undefined) {
    if (!cur.length) { // this is a leaf
      cur.depth = depth
    } else {
      depth++
      cur.depth = depth
      getDepth(cur[0], depth)
      getDepth(cur[1], depth)
      getDepth(cur[2], depth)
      getDepth(cur[3], depth)
    }
  }
}

/** ************************************* coloring coloring coloring ************************************************************* */

// Calculates how many points are in this node
function getDensity (cur) {
  if (cur === undefined) {
    return 0
  }
  if (!cur.length) {
    return 1
  } else {
    return (getDensity(cur[0]) + getDensity(cur[1]) + getDensity(cur[2]) + getDensity(cur[3]))
  }
}

// Used for finding a data representing the whole node in one unit square
function findJustOneLeaf (node) {
  if (node !== undefined) {
    if (!node.length) { // Is a leaf
      return node
    } else {
      var temp = findJustOneLeaf(node[0])
      if (temp != null) {
        return temp
      }
      temp = findJustOneLeaf(node[1])
      if (temp != null) {
        return temp
      }

      temp = findJustOneLeaf(node[2])
      if (temp != null) {
        return temp
      }

      temp = findJustOneLeaf(node[3])
      if (temp != null) {
        return temp
      }
    }
  } else {
    return null
  }
}

// This function will make a array of the density information and the "fake" xAxis and yAxis information
function densityInfo (timeslices) { // for now, just take in missRates, and InstrustionsAcc
  var quadtree = d3.quadtree(timeslices, function (d) { return d.instructionsAcc }, function (d) { return d.events.missRates }) // build a quadtree with all datum
  var result = [] // the array used for holding the "picked" datum with their density

  // add depth information into the datum
  getDepth(quadtree.root(), -1)

  // making sure that the max depth level goes down to pixels
  var depthStd = Math.round(Math.log(width * height) / Math.log(4)) // round up!

  // now go to the depthStd deep node and count the density and record the information to result[]
  quadtree.visit(function (node) {
    if (node === undefined) {
      return true
    }
    if (!node.length) { // is a leaf
      if (node.data != null) {
        node.data.density = 1
        result.push(node.data)
      }
      return true // stop traverse
    } else {
      if (node.depth < depthStd) {
        return false // keep searching the children
      } else {
        var density = getDensity(node)
        var fakeData = findJustOneLeaf(node)
        fakeData.data.density = density
        result.push(fakeData.data)
        return true // stop searching the children
      }
    }
  })
  return result
}
