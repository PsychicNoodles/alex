function dotProduct(a, b) {
    return a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n);
}

function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

function h(xis, θs) {
    return sigmoid(dotProduct(xis, θs));
}

function cost(xs, ys, θs) {
    return -xs.map((x, i) => {
        const xis = xs[i];
        const yis = ys[i];
        return yis * Math.log(h(xis, θs)) + (1 - yis) * Math.log(1 - h(xis, θs));
    }).reduce((m, n) => m + n) / xs.length;
}

//function gradientDescent(xs, ys, θs, learningRate) {

//}

//function train(data) {

//}