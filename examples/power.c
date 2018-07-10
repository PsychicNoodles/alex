#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void multiply_ints() {
    int num = 1;
    for(int i = 0; i < 1000000; i++) {
        num = num * 3;
    }
}

void multiply_floats() {
    float num = 1.234235245;
    for(int i = 0; i < 1000000; i++) {
        num = num * 3.1231412321;
    }
}

int main() {

    for(int i = 0; i < 10000; i++) {
        multiply_floats();
    }

    for(int i = 0; i < 10000; i++) {
        multiply_ints();
    }
}