#include <google/protobuf/io/coded_stream.h>
#include <google/protobuf/io/zero_copy_stream_impl.h>
#include <google/protobuf/text_format.h>
#include <cinttypes>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iostream>
#include "protos/header.pb.h"
#include "protos/timeslice.pb.h"
#include "protos/warning.pb.h"

using google::protobuf::Message;
using google::protobuf::TextFormat;
using google::protobuf::io::CodedInputStream;
using google::protobuf::io::FileInputStream;
using google::protobuf::io::FileOutputStream;
using std::cerr;
using std::cout;
using std::endl;
using std::function;
using std::ifstream;
using std::ios;
using std::string;

template <class T>
void loop_print(CodedInputStream* input, FileOutputStream* out,
                const string& type, int errnum,
                function<bool(const T&)> is_valid) {
  static uint32_t size;
  CodedInputStream::Limit limit;
  static_assert(std::is_base_of<Message, T>::value,
                "loop_print called with a non-Message");
  T msg;
  while (true) {
    if (!input->ReadVarint32(&size)) {
      if (!input->ExpectAtEnd()) {
        exit(0);
      }
      cerr << "failed to parse " << type << ", couldn't read delimiter" << endl;
      exit(errnum);
    }
    limit = input->PushLimit(size);
    if (msg.ParseFromCodedStream(input) && is_valid(msg)) {
      cout << "===" << type << "===" << endl;
      TextFormat::Print(msg, out);
      out->Flush();
      input->PopLimit(limit);
    } else {
      input->PopLimit(limit);
      break;
    }
  }
}

int main(int argc, char** argv) {
  if (argc == 1) {
    cerr << "error: protobuf binary file required" << endl;
    return 1;
  }

  FILE* input_file = fopen(argv[1], "rb");

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

  if (!input.ExpectAtEnd()) {
    loop_print<alex::Timeslice>(
        &input, &out, "Timeslice", 3,
        [](const alex::Timeslice& ts) { return ts.cpu_time() != 0; });
  }

  if (!input.ExpectAtEnd()) {
    loop_print<alex::Warning>(&input, &out, "Warning", 4,
                              [](const alex::Warning& w) {
                                return w.warning_case() != w.WARNING_NOT_SET;
                              });
  }

  finput.Close();
  out.Close();
}
