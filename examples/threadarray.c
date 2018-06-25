#include <stdio.h>
#include <pthread.h>
#include <stdlib.h>

#define NTHREADS 1
void * calculate_sum(void *);
int  counter = 0;

#define N 10000
#define M 5000

int dimensional_array[N][M];


void* calculate_sum(void* args)
{
	int *argPtr = (int*) args;
	int threadindex = *argPtr;
	long *loops = (long *)malloc(sizeof(long));
	*loops = 0;

	for(int i = 0; i <= N-1; i++) {
		if (i % NTHREADS != threadindex) continue;
		for (int j = 0; j <= M-1; j++) {
			int sum = 0;
			for(int k = i-1; k <= i+1; k++) {
				for (int h = j-1; h <= j+1; h++) {
					if (k < 0 || h < 0) continue;
					sum += dimensional_array[h][j];
				}
			}
			dimensional_array[i][j] = sum;
			(*loops)++;
		}
	}

	return loops;
}

int main(void) {
	pthread_t thread_id[NTHREADS];
	int thread_args[NTHREADS];
	int i, j;

	fprintf(stderr, "threadarray: initial pass at array (N=%d, M=%d)\n", N, M);
	for (i = 0; i <= N - 1; i++ )
		for( j = 0; j <= M - 1; j++) {
			dimensional_array[i][j] = i * N + j;
		}

	fprintf(stderr, "threadarray: printing values of array\n");
	for(int i = 0; i <= N-1; i++) {
		for (int j = 0; j <= M-1; j++) {
	 		printf("%10d", dimensional_array[i][j]);
		}
	printf("\n");
	}

	fprintf(stderr, "threadarray: starting threads\n");
	for(i=0; i < NTHREADS; i++) {
		thread_args[i] = i;
		fprintf(stderr, "threadarray: starting thread %d\n", i);
		pthread_create( &thread_id[i], NULL, calculate_sum, &thread_args[i]);
	}

	fprintf(stderr, "threadarray: joining threads\n");
	for(j=0; j < NTHREADS; j++) {
		fprintf(stderr, "threadarray: joining thread %d\n", j);
		long loops;
		pthread_join( thread_id[j], (void*)&loops);
		fprintf(stderr, "threadarray: joined thread %d with result %ld\n", j, loops);
	}

	printf("\n\n\n");

	fprintf(stderr, "threadarray: printing final values\n");
	for(int i = 0; i <= N-1; i++) {
		for (int j = 0; j <= M-1; j++) {
	 		printf("%10d", dimensional_array[i][j]);
		}
	printf("\n");
	}

	fprintf(stderr, "threadarray: 2finished\n");
	fflush(stderr);
}

