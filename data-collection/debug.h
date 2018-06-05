#include <iostream>

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
