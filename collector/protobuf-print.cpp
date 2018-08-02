#include <google/protobuf/io/coded_stream.h>
#include <google/protobuf/io/zero_copy_stream_impl.h>
#include <google/protobuf/text_format.h>
#include <cinttypes>
#include <cstdio>
#include <fstream>
#include <iostream>
#include "protos/header.pb.h"
#include "protos/timeslice.pb.h"
#include "protos/warning.pb.h"

using google::protobuf::TextFormat;
using google::protobuf::io::CodedInputStream;
using google::protobuf::io::FileInputStream;
using google::protobuf::io::FileOutputStream;
using std::cerr;
using std::cout;
using std::endl;
using std::ifstream;
using std::ios;

int main(int argc, char **argv) {
  if (argc == 1) {
    cerr << "error: protobuf binary file required" << endl;
    return 1;
  }

  FILE *input_file = fopen(argv[1], "rb");

  if (input_file == nullptr) {
    cerr << "failed to open " << argv[1] << endl;
    return 1;
  }

  alex::Header header;
  FileInputStream finput(fileno(input_file));
  CodedInputStream input(&finput);
  FileOutputStream out(fileno(stdout));

  // set the limit of the max result file input codedInputStream size to be
  // 256MB
  input.SetTotalBytesLimit(268435456, 0);

  uint32_t size;
  CodedInputStream::Limit limit;
  if (!input.ReadVarint32(&size)) {
    cerr << "failed to parse header, couldn't read delimiter" << endl;
    return 2;
  }
  limit = input.PushLimit(size);
  if (!header.MergeFromCodedStream(&input)) {
    cerr << "failed to parse header" << endl;
    return 2;
  }

  cout << "===Header===" << endl;
  TextFormat::Print(header, &out);
  out.Flush();
  input.PopLimit(limit);

  while (true) {
    if (!input.ReadVarint32(&size)) {
      if (!input.ExpectAtEnd()) {
        return 0;
      }
      cerr << "failed to parse timeslice, couldn't read delimiter" << endl;
      return 3;
    }
    limit = input.PushLimit(size);
    alex::Timeslice ts;
    if (ts.MergeFromCodedStream(&input)) {
      cout << "===Timeslice===" << endl;
      TextFormat::Print(ts, &out);
      out.Flush();
      input.PopLimit(limit);
    } else {
      if (!input.ExpectAtEnd()) {
        input.PopLimit(limit);
        break;
      }
      return 0;
    }
  }

  while (true) {
    if (!input.ReadVarint32(&size)) {
      if (!input.ExpectAtEnd()) {
        return 0;
      }
      cerr << "failed to parse warning, couldn't read delimiter" << endl;
      return 4;
    }
    limit = input.PushLimit(size);
    alex::Warning w;
    if (w.MergeFromCodedStream(&input)) {
      cout << "===Warning===" << endl;
      TextFormat::Print(w, &out);
      out.Flush();
      input.PopLimit(limit);
    } else {
      if (!input.ExpectAtEnd()) {
        input.PopLimit(limit);
        break;
      }
      cerr << "unsure what the remaining data is" << endl;
      return 4;
    }
  }

  finput.Close();
  out.Close();
}