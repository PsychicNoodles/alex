let frameStartTime = 0;
requestAnimationFrame(onFrame);
function onFrame() {
  frameStartTime = Date.now();
  requestAnimationFrame(onFrame);
}

/**
 * Object to execute a sequence of small jobs in a non-blocking fashion.
 *
 * Jobs are represented as "thunks" or functions of type () => any. For best
 * performance, all jobs given to a particular scheduler should take roughly
 * the same amount of time.
 */
class Scheduler {
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
    this.clearSchedule = () => {
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
  schedule(job) {
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
        this._deferQueuedWork();
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

  _deferQueuedWork() {
    if (this._hasMoreWork()) {
      cancelAnimationFrame(this._deferredWorkTimeout);
      this._deferredWorkTimeout = requestAnimationFrame(() => {
        do {
          if (this._hasMoreWork()) {
            console.log(
              "doing work with remaining time:",
              this.maxWorkPerFrame - (Date.now() - frameStartTime)
            );
            const doNextJob = this._jobQueue.shift();
            doNextJob();
          }
        } while (this._hasMoreWork() && this._hasTimeForMore());

        this._deferQueuedWork();
      });
    }
  }
}

module.exports = { Scheduler };
