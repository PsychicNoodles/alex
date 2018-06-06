all: matrixmultiplier.c
	clang -g -Wall -o matrixmultiplier matrixmultiplier.c

threadarray: threadarray.c
	clang -g -Wall -lpthread -o threadarray threadarray.c

clean:
	$(RM) matrixmultiplier threadarray
