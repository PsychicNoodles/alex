#!/bin/bash
# Runs clang-tidy with checks preset or inherited from the environment,
# exiting with 0 if there are no results and 1 if there are

if [ $# -eq 0 ]; then
  echo "Usage: tidy.sh [-l] [-a ARGS] [-h HEADER_DIR] [-f] [-w] [-q] [-c] file"
  echo "  -l: list clang-tidy checks and exit"
  echo "  -a: add additional ARGS for clang-tidy"
  echo "  -h: set header filter to HEADER_DIR, default is target file's directory"
  echo "  -f: enable clang-tidy fix mode"
  echo "  -w: set warnings-as-errors mode for all checks"
  echo "  -q: quiet mode, don't echo output from clang-tidy"
  echo "  -c: print the full clang-tidy command and exit"
  echo "  file: the file to run clang-tidy on"
  exit
fi

TIDY_CHECKS_LIST=(
  "bugprone-*"
  "cppcoreguidelines-*"
  "-cppcoreguidelines-pro-*" # many of these checks prescribe additional libraries
  "-cppcoreguidelines-owning-memory" # requires the additional gsl library
  "google-*"
  "google-global-names-in-headers" # we don't currently namespace everything
  "hicpp-*"
  "-hicpp-vararg" # various vararg c functions are used frequently, ie. fprintf, snprintf
  "-hicpp-no-array-decay" # we don't mind array decay
  "-hicpp-signed-bitwise" # makes it difficult to macro define bitwise parameters
  "llvm-*"
  "-llvm-include-order" # we use a different style guide for include order
  "-llvm-header-guard" # includes too many directories in header guard
  "misc-*"
  "-misc-macro-parentheses" # causes issues with macros that have parameters that use << operator
  "modernize-*"
  "performance-*"
  "readability-*"
  "-readability-implicit-bool-conversion" # we don't mind bool conversion
  "-readability-else-after-return"
)
TIDY_CHECKS=${TIDY_CHECKS:=$(IFS=, ; echo "${TIDY_CHECKS_LIST[*]}")}

fix=""
args=""
warnings_as_errors=""
file="${@: -1}"
header_filter="-header-filter=$(dirname $file)/"
quiet=false
print_command=false

# escaped_file="${file//\//\\/}"
# escaped_file="${escaped_file//./\\.}"
# regex="([\/a-zA-Z]*${escaped_file}:[0-9]+:[0-9]+).*(\[[a-z\-]+\])"

while getopts "la:h:fwqc" opt; do
  case $opt in
    f)
      fix="-fix"
      ;;
    a)
      args=$OPTARG
      ;;
    h)
      header_filter="-header-filter=$OPTARG/"
      ;;
    w)
      warnings_as_errors="-warnings-as-errors='$TIDY_CHECKS'"
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

cmd="clang-tidy $args -extra-arg=-std=c++11 -format-style=file $header_filter -checks='$TIDY_CHECKS' $warnings_as_errors $fix $file -- $file"

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