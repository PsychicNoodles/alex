#include <stdio.h>
#include <stdlib.h>

void main() {
    int arr[1000];
    int arr2[1000];
    for(int i = 0; i < 1000; i++) {
        arr[i] = i;
        arr2[i] = arr[i] * i;
    }

    for(int i = 0; i < 1000; i++) {
        int n = arr[i] + arr2[i];
    }

    float floatArr[1000];
    float floatArr2[1000];

    for(int i = 0; i < 1000; i++) {
        floatArr[i] = i / 3.12314134;
        floatArr2[i] = floatArr[i] * 5.13413123;
    }
}
