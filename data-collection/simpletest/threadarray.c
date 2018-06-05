#include <stdio.h>
#include <pthread.h>

#define NTHREADS 4
void * calculate_sum(void *);
int  counter = 0;

#define N 10
#define M 10

int dimensional_array[N][M];


void* calculate_sum(void* args)
{
	int *argPtr = (int*) args;
	int threadindex = *argPtr;

	for(int i = 0; i <= N-1; i++) {
		if (i % NTHREADS != threadindex) continue;
		for (int j = 0; j <= M-1; j++) {
			int sum = 0;		
			for(int k = i-1; k <= i+1; k++) {
				for (int h = j-1; h <= j+1; h++) {
					if (k < 0 || h < 0) break;
					sum += dimensional_array[h][j];
				}
			}
			dimensional_array[i][j] = sum;
		}
	}
}

int main(void) {
	pthread_t thread_id[NTHREADS];
	int thread_args[NTHREADS];
	int i, j;

	for (i = 0; i <= N - 1; i++ )
		for( j = 0; j <= M - 1; j++) {
			dimensional_array[i][j] = i * N + j;
		}

	for(int i = 0; i <= N-1; i++) {
		for (int j = 0; j <= M-1; j++) {		
	 		printf("%5d", dimensional_array[i][j]);
		}
	printf("\n");
	}

	for(i=0; i < NTHREADS; i++) {
		thread_args[i] = i;
		pthread_create( &thread_id[i], NULL, calculate_sum, &thread_args[i]);
	}

	int sum = 0;
	for(j=0; j < NTHREADS; j++) {
		pthread_join( thread_id[j], NULL);
	}
	for(int i = 0; i <= N-1; i++) {
		for (int j = 0; j <= M-1; j++) {		
	 		printf("%5d", dimensional_array[i][j]);
		}
	printf("\n");
	}	
	
}

