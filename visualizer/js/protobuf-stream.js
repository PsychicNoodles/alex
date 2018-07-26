const protobuf = require("protobufjs");
const jsonDescriptor = require("./protos.json");

const { Buffer } = require("buffer");
const through2 = require("through2");

const { Header, Timeslice, Warning } = protobuf.Root.fromJSON(
  jsonDescriptor
).nested.alex;

function parser() {
  let buf;
  let dataSize = null;
  let finishedHeader = false,
    finishedTimeslices = false;
  let lastPos = 0;

  function readMessage(reader, callback) {
    if (!finishedHeader) {
      this.push(Header.decode(reader, dataSize));
      finishedHeader = true;
    } else if (!finishedTimeslices) {
      try {
        this.push(Timeslice.decode(reader, dataSize));
      } catch (err) {
        // check if we're onto warnings now
        try {
          // reset pos back to before invalid read
          reader.pos = lastPos;
          this.push(Warning.decode(reader, dataSize));
          finishedTimeslices = true;
        } catch (err) {
          // nope, data must be malformed then
          callback(err);
        }
      }
    } else {
      this.push(Warning.decode(reader, dataSize));
    }
  }

  return through2.obj(
    function(chunk, _, callback) {
      const reader = protobuf.Reader.create(
        buf === undefined ? Buffer.from(chunk) : Buffer.concat([buf, chunk])
      );
      // while the reader contains the next delimiter number (and we need a new one) or contains enough data for the next message
      while (
        dataSize === null
          ? reader.len - reader.pos > 4
          : reader.len - reader.pos >= dataSize
      ) {
        if (dataSize === null) {
          // just started parsing or finished reading a message
          dataSize = reader.uint32();
        } else {
          readMessage.call(this, reader, callback);
          dataSize = null;
        }
        lastPos = reader.pos;
      }

      // save remaining buffer
      buf = reader.buf.slice(reader.pos);
      callback();
    },
    function(callback) {
      if (dataSize !== null) {
        // try reading last item, even though there's supposedly not enough data
        try {
          callback(
            null,
            readMessage.call(this, protobuf.Reader.create(buf), callback)
          );
        } catch (err) {
          callback(err);
        }
      }
    }
  );
}

module.exports = { parser, Header, Timeslice, Warning };
