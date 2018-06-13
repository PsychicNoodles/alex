#include <stdlib.h>
#include <stdint.h>

#define SWAP(X, Y, TYPE) {TYPE Z = X; X = Y; Y = Z;}


/* Recursive merge sort function:                                             */
/* arr is an array of uint64_t.                                               */
/* length is the size of arr.                                                 */
void
merge_recurse (char * arr, size_t length);


/* Recursive merge sort kernel:                                               */
/* arr is an array of uint64_t.                                               */
/* low is the low index we wish to start sorting from, inclusive.             */
/* high is the high index we wish to start sorting upto, exclusive.           */
void
recurse_kernel (char * arr, size_t low, size_t high);
