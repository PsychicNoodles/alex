#include <stdio.h>
#include <stdlib.h>

int main()
{
  int num_row1, num_col1, num_row2, num_col2, sum = 0;
 
  printf("Enter the number of rows and columns of first matrix\n");
  scanf("%d%d", &num_row1, &num_col1);
  printf("Enter the elements of first matrix\n");
  int ** first = (int **)malloc(num_row1 * sizeof(int *));
    for (int i=0; i<num_row1; i++)
         first[i] = (int *)malloc(num_col1 * sizeof(int));

  for (int i = 0 ; i < num_row1 ; i++ )
    for (int j = 0 ; j < num_col1 ; j++ )
      scanf("%d", &first[i][j]);

  printf("Enter the number of rows and columns of second matrix\n");
  scanf("%d%d", &num_row2, &num_col2);
  int ** second = (int **)malloc(num_row2 * sizeof(int *));
    for (int i=0; i<num_row2; i++)
         second[i] = (int *)malloc(num_col2 * sizeof(int));


  if (num_col1 != num_row2)
    printf("Matrices with entered orders can't be multiplied with each other.\n");
  else
  {
    int ** multiply = (int **)malloc(num_row1 * sizeof(int *));
    for (int i=0; i<num_row1; i++)
         multiply[i] = (int *)malloc(num_col2 * sizeof(int));

    printf("Enter the elements of second matrix\n");
 
    for (int i = 0 ; i < num_row2 ; i++ )
      for (int j = 0 ; j < num_col2 ; j++ )
        scanf("%d", &second[i][j]);
 
    for (int i = 0 ; i < num_row1 ; i++ )
    {
      for (int j = 0 ; j < num_col2 ; j++ )
      {
        for (int k = 0 ; k < num_row2 ; k++ )
        {
          sum = sum + first[i][k]*second[k][j];
        }
 
        multiply[i][j] = sum;
        sum = 0;
      }
    }
 
    printf("Product of entered matrices:-\n");
 
    for (int i = 0 ; i < num_row1 ; i++ )
    {
      for (int j = 0 ; j < num_col2 ; j++ )
        printf("%d\t", multiply[i][j]);
 
      printf("\n");
    }
  }
  free(first);
  free(second);	
  return 0;
}