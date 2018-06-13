#include <iostream>
#include <string>

//debug macro
#if defined(NDEBUG)
#define DEBUG(x)
#define DEBUG_CRITICAL(x)
#elif defined(MINDEBUG)
#define DEBUG(x)
#define DEBUG_CRITICAL(x) do { std::clog << x << "\n"; } while(0)
#else
#define DEBUG(x) do { std::clog << x << "\n"; } while(0)
#define DEBUG_CRITICAL(x) do { std::clog << x << "\n"; } while(0)
#endif

bool enable_segfault_trace();
void disable_segfault_trace();

static inline std::string getenv_safe(const char* var,
                                      const char* fallback = "") {
  const char* value = getenv(var);
  if (!value) value = fallback;
  return std::string(value);
}

