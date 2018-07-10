/**
 * The last value a finite stream will ever return.
 */
const done = Symbol("stream.done");

/**
 * Create a new stream from a callback attacher.
 * @param streamable A function that accepts a callback for data.
 */
function fromStreamable(streamable) {
  let isDone = false;
  const stream = onData =>
    streamable(data => {
      if (!isDone) {
        onData(data);
      }

      if (data === done) {
        isDone = true;
      }
    });

  stream.pipe = transform => transform(stream);

  return stream;
}

/**
 * Turn a tuple of streamables into a streamable of tuples.
 *
 * Waits until all streamables have emitted a value at least once, then
 * emits whenever any of the contained streams emit.  Emissions after the first
 * will contain stale values for the streams that didn't immediately emit.
 *
 * @param {Array} streamables An array of functions that accept callbacks for data.
 */
function fromStreamables(streamables) {
  const unset = Symbol("unset");

  return fromStreamable(onData => {
    const lastValues = streamables.map(() => unset);
    return streamables.map((streamable, i) =>
      streamable(data => {
        lastValues[i] = data;

        if (lastValues.every(value => value !== unset)) {
          onData([...lastValues]);
        }

        if (lastValues.every(value => value === done)) {
          onData(done);
        }
      })
    );
  });
}

/**
 * Attach a callback to a stream and return the stream's return value.
 * @param onData A callback for data.
 */
function subscribe(onData) {
  return streamable => streamable(onData);
}

module.exports = { fromStreamable, fromStreamables, subscribe, done };
