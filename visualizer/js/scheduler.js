let frameStartTime = 0;

/** @type {Set<JobQueue>} */
const runningQueues = new Set();

requestAnimationFrame(onFrame);
function onFrame() {
  frameStartTime = Date.now();

  let isFirstCycle = true;
  while (
    isFirstCycle ||
    [...runningQueues].some(queue => queue._hasTimeForMore())
  ) {
    for (const queue of runningQueues) {
      if (queue._hasMoreWork()) {
        if (isFirstCycle || queue._hasTimeForMore()) {
          queue._doNextJob();
        }
      } else {
        runningQueues.delete(queue);
      }
    }

    isFirstCycle = false;
  }

  requestAnimationFrame(onFrame);
}

/**
 * Object to execute a sequence of small jobs in a non-blocking fashion.
 *
 * Jobs are represented as "thunks" or functions of type `() => any`. For best
 * performance, all jobs given to a particular scheduler should take roughly
 * the same amount of time.
 */
class JobQueue {
  /**
   * @param {number} maxWorkPerFrame
   *    Maximum amount of time in ms that the scheduler should keep doing work
   *    after the start of a frame.
   * @param {number} expectedWorkLength
   *    Hint for the expected length of each unit of work scheduled.
   */
  constructor(maxWorkPerFrame = 10, expectedWorkLength = 2) {
    this.maxWorkPerFrame = maxWorkPerFrame;

    this._jobQueue = [];
    this._deferredWorkTimeout = null;
    this._expectedJobLength = expectedWorkLength;

    /**
     * Cancel all scheduled work.
     */
    this.clear = () => {
      cancelAnimationFrame(this._deferredWorkTimeout);
      this._jobQueue = [];
      this._deferredWorkTimeout = null;
    };
  }

  /**
   * Add `work` to the end of the queue to be executed in a non-blocking manner.
   * @param {() => any} job Some small piece of work to do.
   * @returns {Promise<any>} The result of the work.
   */
  add(job) {
    return new Promise((resolve, reject) => {
      const doJob = () => {
        try {
          resolve(job());
        } catch (err) {
          reject(err);
        }
      };

      if (this._hasTimeForMore()) {
        doJob();
      } else {
        this._jobQueue.push(doJob);
        runningQueues.add(this);
      }
    });
  }

  _hasMoreWork() {
    return this._jobQueue.length !== 0;
  }

  _hasTimeForMore() {
    return (
      Date.now() - frameStartTime + this._expectedJobLength <=
      this.maxWorkPerFrame
    );
  }

  _doNextJob() {
    const nextJob = this._jobQueue.shift();
    nextJob();
  }
}

module.exports = { JobQueue };
