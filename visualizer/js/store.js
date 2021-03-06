const isEqual = require("lodash.isequal");

const stream = require("./stream");

/**
 * Represents a piece of state that can be listened to for changes.
 */
class Store {
  constructor(initialState) {
    this._state = initialState;
    this._listeners = new Set();
    this._isFiringListener = false;

    this.stream = stream.fromStreamable(onStateChange => {
      this._listeners.add(onStateChange);
      this._fireListener(onStateChange);

      return () => {
        this._listeners.delete(onStateChange);
      };
    });
  }

  /**
   * Add a listener for changes to the state.
   *
   * The listener will be immediately invoked synchronously when first
   * subscribed and immediately after state is changed with dispatch.
   *
   * @param onStateChange Callback to be passed the value of the state.
   * @return A subscription object with an unsubscribe method to remove the
   *         listener.
   */
  subscribe(onStateChange) {
    return {
      unsubscribe: this.stream.pipe(stream.subscribe(onStateChange))
    };
  }

  /**
   * Attach a subscription to a d3 selection.
   *
   * If subscribeUnique is called multiple times on the same element using the
   * same propertyName, the old subscription will be unsubscribed so that only
   * one subscription is ever present.
   *
   * @param selection A d3 selection of a single element where the subscription
   *                  will be attached.
   * @param propertyName A string or object with toString where the subscription
   *                     will be stored.
   * @param onStateChange The callback to be passed to Store.subscribe.
   */
  subscribeUnique(selection, propertyName, onStateChange) {
    this.stream.pipe(
      stream.subscribeUnique(selection, propertyName, onStateChange)
    );
  }

  /**
   * Get the current state of the store.
   */
  getState() {
    return this._state;
  }

  /**
   * Change the state and notify all subscribers.
   * @param getNextState Should be a pure function that takes the old state
   *                     and returns a new state.
   */
  dispatch(getNextState) {
    const newState = getNextState(this._state);
    if (!isEqual(newState, this._state)) {
      this._state = newState;
      for (const listener of this._listeners) {
        this._fireListener(listener);
      }
    }
  }

  /**
   * @param {(state: any) => void} listener
   */
  _fireListener(listener) {
    if (this._isFiringListener) {
      throw new Error(
        "Cannot call Store#dispatch synchronously in a subscribe function.  " +
          "Consider using window.requestAnimationFrame."
      );
    }

    try {
      this._isFiringListener = true;
      listener(this._state);
    } finally {
      this._isFiringListener = false;
    }
  }
}

module.exports = { Store };
