#include "sorts.h"


void
recurse_kernel (char * arr, size_t low, size_t high)
{
  if ((high - low) < 2)
  {
    return;
  } // if
  else
  {
    size_t mid = (high - low) / 2 + low;
    recurse_kernel (arr, low, mid);
    recurse_kernel (arr, mid, high);
    size_t l = low;
    size_t u = mid;
    char aux_arr[high-low];
    size_t index = 0;
    while ((l < mid) && (u < high))
    {
      if (arr[l] > arr[u])
      {
       aux_arr[index] = arr[u];
       u++;
       index++;
      } // if
      else
      {
        aux_arr[index] = arr[l];
        l++;
        index++;
      } // else
    } // while
    while (l < mid)
    {
      aux_arr[index] = arr[l];
      l++;
      index++;
    } // while
    while (u < high)
    {
     aux_arr[index] = arr[u];
     u++;
     index++;
    } // while
    index = 0;
    while (index < (high-low))
    {
      arr[low + index] = aux_arr[index];
      index++;
    } // while
  }// else
} // recurse_iter

void
merge_recurse (char * arr, size_t length)
{
  size_t low = 0;
  size_t high = length;
  recurse_kernel (arr, low, high);
} // merge_recurse
