function createStore(initialValue) {
  let state = initialValue;
  const listeners = new Set();

  return {
    /**
     * Add a listener for changes to the state.
     *
     * The listener will be immediately invoked synchronously when first
     * subscribed and immediately after state is changed with dispatch.
     *
     * @param onStateChange Callback to be passed the value of the state.
     */
    subscribe(onStateChange) {
      listeners.add(onStateChange);
      onStateChange(state);
    },

    /**
     * Remove a listener added with subscribe.
     * @param onStateChange A reference to the same function added with subscribe.
     */
    unsubscribe(onStateChange) {
      listeners.delete(onStateChange);
    },

    /**
     * Get the current state of the store.
     */
    getState() {
      return state;
    },

    /**
     * Change the state and notify all subscribers.
     * @param getNextState Should be a pure function that takes the old state
     *                     and returns a new state.
     */
    dispatch(getNextState) {
      const newState = getNextState(state);
      if (newState !== state) {
        state = newState;
        for (const listener of listeners) {
          listener(state);
        }
      }
    }
  };
}

module.exports = { createStore };
