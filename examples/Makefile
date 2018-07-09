all: build/matrixmultiplier build/threadarray build/fork build/branch-predict

build:
	mkdir -p build

build/matrixmultiplier: matrixmultiplier.c | build
	clang -g -Wall -rdynamic -o build/matrixmultiplier matrixmultiplier.c

build/threadarray: threadarray.c | build
	clang -g -Wall -rdynamic -lpthread -o build/threadarray threadarray.c

build/fork: fork.c | build
	clang -g -Wall -lpthread -o build/fork fork.c

build/branch-predict: branch-predict.cpp | build
	clang++ -g -Wall -rdynamic -o build/branch-predict branch-predict.cpp

clean:
	$(RM) -rf build
