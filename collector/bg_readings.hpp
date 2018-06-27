#include <condition_variable>
#include <mutex>

#include <pthread.h>

using namespace std;

struct bg_reading {
  void* result;
  pthread_t thread;
  mutex mtx;
  condition_variable cv;
  bool running;
  bool ready;
};

bool setup_reading(bg_reading* reading, void*(reading_fn)(void*), void* args);
void restart_reading(bg_reading* reading);
void stop_reading(bg_reading* reading);

bool has_result(bg_reading* reading);
void* get_result(bg_reading* reading);