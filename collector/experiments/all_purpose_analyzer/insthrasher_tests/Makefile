CXX := clang++

all: thrasher.exe

thrasher.exe: insthrasher.cpp merge_recurse.o
	$(CXX) -g -o $@ $^

merge_recurse.o: merge_recurse.cpp sorts.h
	$(CXX) -g -o $@ -c $<
