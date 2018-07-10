all: build/branch-predict build/cache build/fork build/matrixmultiplier build/power build/threadarray

build:
	mkdir -p build

build/branch-predict: branch-predict.cpp | build
	clang++ -g -Wall -rdynamic -lpthread -o build/branch-predict branch-predict.cpp

build/cache: cache.c | build
	clang -g -Wall -o build/cache cache.c

build/fork: fork.c | build
	clang -g -Wall -rdynamic -lpthread -o build/fork fork.c

build/power: power.c | build
	clang -g -Wall -rdynamic -o build/power power.c

build/matrixmultiplier: matrixmultiplier.c | build
	clang -g -Wall -rdynamic -o build/matrixmultiplier matrixmultiplier.c

build/threadarray: threadarray.c | build
	clang -g -Wall -rdynamic -lpthread -o build/threadarray threadarray.c

clean:
	$(RM) -rf build
