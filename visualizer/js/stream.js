/**
 * A callback that will receive data.
 * @typedef {{(data: any): void}} DataListener
 */

/**
 * An abstract representation of data over time that may or may not end.
 *
 * Returns an unsubscribe function.
 *
 * @typedef {{(onData: DataListener): function(): void}} Streamable
 */

/**
 * An immutable transformation over a stream.
 * @typedef {{(streamable: Streamable): Stream}} StreamTransform
 */

/**
 * A streamable with some helper methods and extra guarantees.
 *
 * Guarantees:
 *  - Once `done` is emitted, nothing will ever be emitted again.
 *  - Once `done` is emitted, the stream will be unsubscribed eventually.
 *  - Once the stream is unsubscribed, it will emit `done` if it hasn't already.
 *
 * @typedef {{(onData: DataListener): function(): void, pipe: (transform: StreamTransform) => Stream}} Stream
 */

/**
 * The last value a finite stream will ever return.
 */
const done = Symbol("stream.done");

const isStream = Symbol("isStream");

/**
 * Emits done immediately when subscribed to without emitting anything else.
 * @type {Stream}
 */
const empty = fromStreamable(onData => {
  onData(done);
  return () => {};
});

/**
 * Never emits anything.
 * @type {Stream}
 */
const never = fromStreamable(() => () => {});

/**
 * Create a new stream from a streamable.
 * @param {Streamable} streamable To be wrapped.
 * @returns {Stream}
 */
function fromStreamable(streamable) {
  if (streamable[isStream]) {
    return streamable;
  } else {
    const stream = onData => {
      let isDone = false;

      const offData = streamable(data => {
        if (!isDone) {
          onData(data);
        }

        if (data === done) {
          isDone = true;
          requestIdleCallback(() => {
            offData();
          });
        }
      });

      return () => {
        offData();
        if (!isDone) {
          onData(done);
          isDone = true;
        }
      };
    };

    stream.pipe = transform => transform(stream);

    stream[isStream] = true;

    return stream;
  }
}

/**
 * Creates a stream that waits a given duration and then emits done.
 * @param {number} duration Time in milliseconds before ending.
 * @returns {Stream}
 */
function fromTimeout(duration) {
  return fromStreamable(onData => {
    const timeout = setTimeout(() => onData(done), duration);
    return () => {
      clearTimeout(timeout);
    };
  });
}

/**
 * Create a stream of DOM events of a given type.
 * @param {HTMLElement} element To be listened to.
 * @param {string} eventType DOM event type used in addEventListener.
 * @param {*} options Passed to addEventListener.
 * @returns {Stream}
 */
function fromDOMEvent(element, eventType, options = undefined) {
  return fromStreamable(onData => {
    element.addEventListener(eventType, onData, options);
    return () => {
      element.removeEventListener(eventType, onData, options);
    };
  });
}

/**
 * Turn a tuple of streamables into a streamable of tuples.
 *
 * Waits until all streamables have emitted a value at least once, then
 * emits whenever any of the contained streams emit.  Emissions after the first
 * will contain stale values for the streams that didn't immediately emit.
 *
 * @param {Streamable[]} streamables Tuple of streamables to be combined.
 * @returns {Stream}
 */
function fromStreamables(streamables) {
  const unset = Symbol("unset");

  return fromStreamable(onData => {
    const lastValues = streamables.map(() => unset);
    const offDataFunctions = streamables.map((streamable, i) =>
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

    return () => {
      for (const offData of offDataFunctions) {
        offData();
      }
    };
  });
}

/**
 * @param {Promise} promise
 */
function fromPromise(promise, cancel = () => {}) {
  return fromStreamable(onData => {
    promise.then(
      data => {
        onData(data);
        onData(done);
      },
      err => {
        throw err;
      }
    );

    return cancel;
  });
}

/**
 * Like Array.map but operates on a stream.
 * @param {function(any): any} transformData
 *    A function that accepts an element of the stream and returns the
 *    corresponding element of the new stream.
 * @returns {StreamTransform}
 */
function map(transformData) {
  const unset = Symbol("unset");

  return streamable => {
    let lastEmittedValue = unset;
    let lastTransformedValue;
    return fromStreamable(onData =>
      streamable(data => {
        if (data === done) {
          onData(done);
        } else {
          if (data !== lastEmittedValue) {
            lastEmittedValue = data;
            lastTransformedValue = transformData(data);
          }

          onData(lastTransformedValue);
        }
      })
    );
  };
}

/**
 * Like Array.filter but operates on a stream.
 * @param {function(any): boolean} shouldKeep
 *    A function that accepts an element of the stream and returns whether it
 *    should be emitted in the result stream.
 * @returns {StreamTransform}
 */
function filter(shouldKeep) {
  const unset = Symbol("unset");

  return streamable => {
    let lastEmittedValue = unset;
    let shouldKeepLastEmitted;
    return fromStreamable(onData =>
      streamable(data => {
        if (data === done) {
          onData(done);
        } else {
          if (data !== lastEmittedValue) {
            lastEmittedValue = data;
            shouldKeepLastEmitted = shouldKeep(data);
          }

          if (shouldKeepLastEmitted) {
            onData(lastEmittedValue);
          }
        }
      })
    );
  };
}

/**
 * Don't emit a value if another value is emitted before the timer stream ends.
 * @param {function(any): Streamable} durationSelector
 *    Will be called with each value and should return a stream that will be
 *    subscribed to whenever a value is received to await completion.
 * @returns {StreamTransform}
 */
function debounce(durationSelector) {
  return streamable =>
    fromStreamable(onData => {
      let cancel = () => {};
      const offData = streamable(data => {
        let wasCanceled = false;

        const offDuration = durationSelector(data)(timerData => {
          if (timerData === done && !wasCanceled) {
            onData(data);
          }
        });

        cancel();
        cancel = () => {
          wasCanceled = true;
          offDuration();
        };
      });

      return () => {
        cancel();
        offData();
      };
    });
}

/**
 * Don't emit a value if another value is emitted within the duration.
 * @param {number} duration Time in milliseconds to wait before emitting.
 * @returns {StreamTransform}
 */
function debounceTime(duration) {
  return debounce(() => fromTimeout(duration));
}

/**
 * Like debounce, but emits the results of the timer stream instead.
 * @param {function(any): Streamable} project
 *    Will be called with each value and should return a stream that will be
 *    subscribed to whenever a value is received.
 * @returns {StreamTransform}
 */
function debounceMap(project) {
  return streamable =>
    fromStreamable(onData => {
      let cancel = () => {};
      const offData = streamable(data => {
        cancel();
        cancel = fromStreamable(project(data))(timerData => {
          if (timerData !== done) {
            onData(timerData);
          }
        });
      });

      return () => {
        cancel();
        offData();
      };
    });
}

/**
 * Like map, but subscribes to the result of `project` instead of emitting it.
 * @param {function(any): Streamable} project
 *    Will be called with each value and should return a stream that will be
 *    subscribed to whenever a value is received.
 * @returns {StreamTransform}
 */
function mergeMap(project) {
  return streamable =>
    fromStreamable(onData => {
      let isDone = false;
      const innerOffDataFunctions = new Set();
      const offData = streamable(data => {
        if (data === done) {
          isDone = true;
          if (innerOffDataFunctions.size === 0) {
            onData(done);
          }
        } else {
          let endedSynchronously = false;
          let innerOffData = null;
          innerOffData = fromStreamable(project(data))(innerData => {
            if (innerData === done) {
              if (innerOffData) {
                innerOffDataFunctions.delete(innerOffData);
              } else {
                endedSynchronously = true;
              }
              if (isDone && innerOffDataFunctions.size === 0) {
                onData(done);
              }
            } else {
              onData(innerData);
            }
          });

          if (endedSynchronously) {
            innerOffDataFunctions.add(innerOffData);
          }
        }
      });

      return () => {
        for (const innerOffData of innerOffDataFunctions) {
          innerOffData();
        }
        offData();
      };
    });
}

/**
 * Create a stream of the first `amount` events from the input stream.
 * @param {number} amount Number of events to take from the start of the stream.
 * @returns {StreamTransform}
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
 * @param {DataListener} onData Called for each value emitted, but not `done`.
 * @returns {StreamTransform}
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
 * @param {() => void} onDone A callback for stream completion.
 * @returns {(Streamable) => () => void}
 */
function subscribe(onData, onDone = () => {}) {
  return streamable =>
    fromStreamable(streamable)(data => {
      if (data === done) {
        onDone();
      } else {
        onData(data);
      }
    });
}

/**
 * Attach a subscription to a d3 selection.
 *
 * If subscribeUnique is called multiple times on the same element using the
 * same propertyName, the old subscription will be unsubscribed so that only
 * the latest subscription is ever present.
 *
 * @param {d3.Selection} selection A d3 selection of a single element where the subscription will be attached.
 * @param {string|{toString(): string}} propertyName A string or object with toString where the subscription will be stored.
 * @param {DataListener} onData The data callback to be passed to stream.subscribe.
 * @param {() => void} onDone The done callback to be passed to stream.subscribe.
 * @returns {(streamable: Streamable) => void}
 */
function subscribeUnique(selection, propertyName, onData, onDone = undefined) {
  return streamable => {
    const oldSubscription = selection.property(propertyName);
    if (oldSubscription) {
      oldSubscription.unsubscribe();
    }

    selection.property(propertyName, {
      unsubscribe: fromStreamable(streamable).pipe(subscribe(onData, onDone))
    });
  };
}

module.exports = {
  fromStreamable,
  fromStreamables,
  fromTimeout,
  fromDOMEvent,
  fromPromise,
  empty,
  never,
  map,
  filter,
  debounce,
  debounceTime,
  debounceMap,
  mergeMap,
  take,
  tap,
  subscribe,
  subscribeUnique,
  done
};
