/**
 * A callback that will receive data.
 * @typedef {function(any): void} DataListener
 */

/**
 * An abstract representation of data over time that may or may not end.
 * @typedef {function(DataListener): any} Streamable
 */

/**
 * The last value a finite stream will ever return.
 */
const done = Symbol("stream.done");

/**
 * A stream that emits done immediately without emitting anything else.
 */
const empty = fromStreamable(onData => {
  onData(done);
});

/**
 * A stream that emits anything.
 */
const never = fromStreamable(() => {});

/**
 * Create a new stream from a callback attacher.
 * @param {Streamable} streamable A function that accepts a callback for data.
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

  stream.then = resolve => {
    const values = [];
    if (isDone) {
      resolve(values);
    } else {
      stream(data => {
        if (data === done) {
          resolve(values);
        } else {
          values.push(data);
        }
      });
    }
  };

  return stream;
}

/**
 * Creates a stream that waits a given duration and then emits done.
 *
 * Subscribing to the stream returns timeout ID that can be passed to
 * clearTimeout to cancel the timeout so the stream becomes never-ending.
 *
 * @param {number} duration Time in milliseconds before ending.
 */
function fromTimeout(duration) {
  return fromStreamable(onData => setTimeout(() => onData(done), duration));
}

/**
 * Create a stream of DOM events of a given type.
 * @param {HTMLElement} element To be listened to.
 * @param {string} eventType DOM event type used in addEventListener.
 * @param {*} options Passed to addEventListener.
 */
function fromDOMEvent(element, eventType, options = undefined) {
  return fromStreamable(onData =>
    element.addEventListener(eventType, onData, options)
  );
}

/**
 * Turn a tuple of streamables into a streamable of tuples.
 *
 * Waits until all streamables have emitted a value at least once, then
 * emits whenever any of the contained streams emit.  Emissions after the first
 * will contain stale values for the streams that didn't immediately emit.
 *
 * @param {Streamable[]} streamables Tuple of streamables to be combined.
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
 * Like Array.map but operates on a stream.
 * @param {function(any): any} transformData
 *    A function that accepts an element of the stream and returns the
 *    corresponding element of the new stream.
 */
function map(transformData) {
  return streamable =>
    fromStreamable(onData =>
      streamable(data => {
        if (data === done) {
          onData(done);
        } else {
          onData(transformData(data));
        }
      })
    );
}

/**
 * Don't emit a value if another value is emitted before the timer stream ends.
 * @param {function(any): Streamable} durationSelector
 *    Will be called with each value and should return a stream that will be
 *    subscribed to whenever a value is received.
 */
function debounce(durationSelector) {
  return streamable =>
    fromStreamable(onData => {
      let cancel = () => {};

      return streamable(data => {
        cancel();

        let wasCanceled = false;
        cancel = () => {
          wasCanceled = true;
        };

        durationSelector(data)(timerData => {
          if (timerData === done && !wasCanceled) {
            onData(data);
          }
        });
      });
    });
}

/**
 * Don't emit a value if another value is emitted within the duration.
 * @param {number} duration Time in milliseconds to wait before emitting.
 */
function debounceTime(duration) {
  return debounce(() => fromTimeout(duration));
}

/**
 * Create a stream of the first `amount` events from the input stream.
 * @param {number} amount Number of events to take from the start of the stream.
 */
function take(amount) {
  return streamable =>
    amount === 0
      ? empty
      : fromStreamable(onData => {
          let numTaken = 0;
          return streamable(data => {
            onData(data);
            numTaken++;
            if (numTaken === amount) {
              onData(done);
            }
          });
        });
}

/**
 * Add a callback for each value emitted once the stream is subscribed.
 * @param {DataListener} onData Called for each datum.
 */
function tap(onData) {
  return streamable =>
    fromStreamable(onStreamableData =>
      streamable(data => {
        if (data !== done) {
          onData(data);
        }

        onStreamableData(data);
      })
    );
}

/**
 * Attach a callback to a stream and return the stream's return value.
 * @param {DataListener} onData A callback for data.
 */
function subscribe(onData) {
  return streamable => streamable(onData);
}

module.exports = {
  fromStreamable,
  fromStreamables,
  fromTimeout,
  fromDOMEvent,
  empty,
  never,
  map,
  debounce,
  debounceTime,
  take,
  tap,
  subscribe,
  done
};
