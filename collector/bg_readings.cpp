#include "bg_readings.hpp"
#include "clone.hpp"
#include "debug.hpp"
#include "util.hpp"

struct reading_fn_args {
  void *(*reading_fn)(void *);
  void *args;
  bg_reading *reading;
};

void *reading_fn_wrapper(void *raw_args) {
  pthread_t t = pthread_self();
  DEBUG(t << ": in reading_fn_wrapper");
  auto *args = static_cast<reading_fn_args *>(raw_args);
  auto reading = args->reading;
  unique_lock<mutex> lock(reading->mtx);
  DEBUG(t << ": waiting for notification to start");
  reading->cv.wait(lock, [&reading] { return reading->ready; });
  DEBUG(t << ": received notification to start");
  while (reading->running) {
    lock.unlock();
    DEBUG(t << ": running function");
    reading->result = args->reading_fn(args->args);
    DEBUG(t << ": stored result " << ptr_fmt(reading->result)
            << ", acquiring lock");
    lock.lock();
    if (!reading->running) {
      DEBUG(t << ": received notifiction to stop while function was running");
      lock.unlock();
    } else {
      if (reading->ready) {
        DEBUG(t << ": ready was set to true while waiting for the lock");
      } else {
        DEBUG(t << ": locked, setting ready to false");
        reading->ready = false;
        DEBUG(t << ": waiting for ready signal");
        reading->cv.wait(
            lock, [&reading] { return reading->ready || !reading->running; });
      }
      if (reading->running) {
        DEBUG(t << ": received notification to continue");
      } else {
        DEBUG(t << ": received notification to stop");
      }
    }
  }
  delete args;
  return nullptr;
}

bool setup_reading(bg_reading *reading, void *(reading_fn)(void *),
                   void *args) {
  DEBUG("setting up background reading");
  pthread_t t;

  reading->result = nullptr;
  reading->running = true;
  reading->ready = false;

  auto *rf_args = new reading_fn_args;
  rf_args->reading_fn = reading_fn;
  rf_args->args = args;
  rf_args->reading = reading;

  if ((errno = real_pthread_create(&t, nullptr, reading_fn_wrapper, rf_args)) !=
      0) {
    perror("failed to create background reading thread");
    return false;
  }
  reading->thread = t;
  DEBUG("reading thread is " << t);

  return true;
}

void restart_reading(bg_reading *reading) {
  if (reading->ready) {
    DEBUG("background tid " << reading->thread << " was already running");
    return;
  }
  DEBUG("restarting reading for tid " << reading->thread);
  unique_lock<mutex> lock(reading->mtx);
  reading->ready = true;
  lock.unlock();
  reading->cv.notify_one();
}

void stop_reading(bg_reading *reading) {
  if (!reading->running) {
    DEBUG("background tid " << reading->thread << " was already stopped!");
    return;
  }
  DEBUG("stopping reading for tid " << reading->thread);
  unique_lock<mutex> lock(reading->mtx);
  reading->running = false;
  reading->ready = true;
  lock.unlock();
  reading->cv.notify_one();
  pthread_join(reading->thread, nullptr);
}

bool has_result(bg_reading *reading) {
  return reading->running && reading->result != nullptr;
}

void *get_result(bg_reading *reading) {
  if (!reading->running) {
    DEBUG("background tid " << reading->thread
                            << " was not running, cannot get result!");
    return nullptr;
  }
  void *ret = reading->result;
  DEBUG("result for tid " << reading->thread << " is " << ptr_fmt(ret));
  reading->result = nullptr;
  return ret;
}