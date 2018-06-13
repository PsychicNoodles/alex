#include <stdio.h>
#include <stdlib.h>

int **alloc_matrix(int num_row, int num_col) {
  int **matrix = (int **)malloc(num_row * sizeof(int *));
  for (int i = 0; i < num_row; i++)
    matrix[i] = (int *)malloc(num_col * sizeof(int));
  return matrix;
}

void read_matrix(int **matrix, int num_row, int num_col) {
  for (int i = 0; i < num_row; i++)
    for (int j = 0; j < num_col; j++) scanf("%d", &matrix[i][j]);
}

int main() {
  int num_row1, num_col1, num_row2, num_col2, sum = 0;

  printf("Enter the number of rows and columns of first matrix\n");
  scanf("%d%d", &num_row1, &num_col1);
  printf("Enter the elements of first matrix\n");
  int **first = alloc_matrix(num_row1, num_col1);
  read_matrix(first, num_row1, num_col1);

  printf("Enter the number of rows and columns of second matrix\n");
  scanf("%d%d", &num_row2, &num_col2);
  int **second = alloc_matrix(num_row2, num_col2);

  if (num_col1 != num_row2)
    printf(
        "Matrices with entered orders can't be multiplied with each other.\n");
  else {
    int **multiply = alloc_matrix(num_row1, num_col2);

    printf("Enter the elements of second matrix\n");
    read_matrix(second, num_row2, num_col2);

    for (int i = 0; i < num_row1; i++) {
      for (int j = 0; j < num_col2; j++) {
        for (int k = 0; k < num_row2; k++) {
          sum = sum + first[i][k] * second[k][j];
        }

        multiply[i][j] = sum;
        sum = 0;
      }
    }

    printf("Product of entered matrices:-\n");

    for (int i = 0; i < num_row1; i++) {
      for (int j = 0; j < num_col2; j++) printf("%d\t", multiply[i][j]);

      printf("\n");
    }
  }
  free(first);
  free(second);
  return 0;
}
