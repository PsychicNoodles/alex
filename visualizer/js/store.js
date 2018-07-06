/**
 * Represents a piece of state that can be listened to for changes.
 */
class Store {
  constructor(initialState) {
    this._state = initialState;
    this._listeners = new Set();
  }

  /**
   * Add a listener for changes to the state.
   *
   * The listener will be immediately invoked synchronously when first
   * subscribed and immediately after state is changed with dispatch.
   *
   * @param onStateChange Callback to be passed the value of the state.
   * @return A subscription object with an unsubscribe method to remove the listener.
   */
  subscribe(onStateChange) {
    this._listeners.add(onStateChange);
    onStateChange(this._state);

    return {
      unsubscribe() {
        this._listeners.delete(onStateChange);
      }
    };
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
    if (newState !== this._state) {
      this._state = newState;
      for (const listener of this._listeners) {
        listener(this._state);
      }
    }
  }
}

module.exports = { Store };
