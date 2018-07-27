let frameStartTime = 0;
requestAnimationFrame(onFrame);
function onFrame() {
  frameStartTime = Date.now();
  requestAnimationFrame(onFrame);
}

class Scheduler {
  constructor(maxWorkTime = 10) {
    this._workQueue = [];
    this._workTimeout = null;
    this.maxWorkTime = maxWorkTime;

    this._doQueuedWork = () => {
      clearTimeout(this._workTimeout);

      while (
        this._workQueue.length !== 0 &&
        Date.now() - frameStartTime + this._workQueue[0].expectedWorkTime <=
          this.maxWorkTime
      ) {
        console.log(
          "doing work with remaining time:",
          this.maxWorkTime - (Date.now() - frameStartTime)
        );
        this._workQueue.shift().doWork();
      }

      if (this._workQueue.length !== 0) {
        this._workTimeout = setTimeout(this._doQueuedWork, 0);
      }
    };
  }

  /**
   * Do work now or next frame.
   * @param {() => any} work Some piece of work to do.
   * @param {number} expectedWorkTime A hint for how long `work` will take in ms.
   * @returns {Promise<any>} The result of the work.
   */
  schedule(work, expectedWorkTime = 5) {
    return new Promise((resolve, reject) => {
      const doWork = () => {
        try {
          resolve(work());
        } catch (err) {
          reject(err);
        }
      };

      this._workQueue.push({ doWork, expectedWorkTime });
      this._doQueuedWork();
    });
  }

  /**
   * Cancel all scheduled work.
   */
  clearSchedule() {
    clearTimeout(this._workTimeout);
    this._workQueue = [];
    this._workTimeout = null;
  }
}

module.exports = { Scheduler };
