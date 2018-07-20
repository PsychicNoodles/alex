#!/bin/bash
# Runs clang-tidy with checks preset or inherited from the environment,
# exiting with 0 if there are no results and 1 if there are

if [ $# -eq 0 ]; then
  echo "Usage: tidy.sh [-l] [-a ARGS] [-f] [-w] [-q] [-c] file"
  echo "  -l: list clang-tidy checks and exit"
  echo "  -a: add additional ARGS for clang-tidy"
  echo "  -f: enable clang-tidy fix mode"
  echo "  -w: set warnings-as-errors mode for all checks"
  echo "  -q: quiet mode, don't echo output from clang-tidy"
  echo "  -c: print the full clang-tidy command and exit"
  echo "  file: the file to run clang-tidy on"
  exit
fi

TIDY_CHECKS=${TIDY_CHECKS:="bugprone-*,cppcoreguidelines-*,-cppcoreguidelines-pro-*,-cppcoreguidelines-owning-memory,google-*,hicpp-*,-hicpp-vararg,-hicpp-no-array-decay,-hicpp-signed-bitwise,llvm-*,-llvm-include-order,misc-*,modernize-*,performance-*,readability-*,-readability-implicit-bool-conversion,-readability-else-after-return"}

fix=""
args=""
warnings_as_errors=""
file="${@: -1}"
quiet=false
print_command=false

# escaped_file="${file//\//\\/}"
# escaped_file="${escaped_file//./\\.}"
# regex="([\/a-zA-Z]*${escaped_file}:[0-9]+:[0-9]+).*(\[[a-z\-]+\])"

while getopts "la:fwqc" opt; do
  case $opt in
    f)
      fix="-fix"
      ;;
    a)
      args=$OPTARG
      ;;
    w)
      warnings_as_errors=$TIDY_CHECKS
      ;;
    q)
      quiet=true
      ;;
    l)
      echo $TIDY_CHECKS
      exit
      ;;
    c)
      print_command=true
      ;;
  esac
done

cmd="clang-tidy $args -extra-arg=-std=c++11 -format-style=file -checks='$TIDY_CHECKS' -warnings-as-errors='$warnings_as_errors' $fix $file -- $file"

if [ "$print_command" = true ]; then
  echo $cmd
  exit
fi

out="$($cmd 2>/dev/null)"

if [[ -z "${out// }" ]]; then
  exit 0
else
  echo "clang-tidy found some problems in $file"
  if [ "$quiet" = false ]; then
    echo "$out"
  fi
  exit 1
fi