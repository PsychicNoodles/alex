const { Reader } = require("protobufjs");
const { Header, Timeslice, StackFrame, Warning } = require("./protos").alex;

const { Buffer } = require("buffer");
const through2 = require("through2");

function processMessage(msg) {
  if (msg instanceof Header) {
    // flatten the nested map shenanigans
    for (const preset in msg.presets) {
      msg.presets[preset] = msg.presets[preset].events;
      for (const event in msg.presets[preset]) {
        msg.presets[preset][event] = msg.presets[preset][event].events;
      }
    }
  }
  return msg;
}

function parser() {
  let buf;
  let dataSize = null,
    repeatedSize = null;
  let finishedHeader = false,
    finishedTimeslices = false;

  function readMessage(reader) {
    if (!finishedHeader) {
      this.push(processMessage(Header.decode(reader, dataSize)));
      finishedHeader = true;
    } else if (!finishedTimeslices) {
      this.push(processMessage(Timeslice.decode(reader, dataSize)));
    } else {
      this.push(processMessage(Warning.decode(reader, dataSize)));
    }
  }

  return through2.obj(
    function(chunk, _, callback) {
      const reader = Reader.create(
        buf === undefined ? Buffer.from(chunk) : Buffer.concat([buf, chunk])
      );
      // while the reader contains the next delimiter number (and we need a new one) or contains enough data for the next message
      while (
        (dataSize === null
          ? reader.len - reader.pos > 4
          : reader.len - reader.pos >= dataSize) &&
        (repeatedSize === null ? true : repeatedSize > 0)
      ) {
        if (dataSize === null) {
          // just started parsing or finished reading a message
          dataSize = reader.uint32();
          // check for end of timeslices
          if (finishedHeader && !finishedTimeslices && dataSize === 0) {
            finishedTimeslices = true;
            repeatedSize = reader.uint32();
          }
        } else {
          readMessage.call(this, reader);
          if (repeatedSize !== null) {
            repeatedSize--;
          }
          dataSize = null;
        }
      }

      // save remaining buffer
      buf = reader.buf.slice(reader.pos);
      callback();
    },
    function(callback) {
      if (dataSize !== null) {
        // try reading last item, even though there's supposedly not enough data
        try {
          callback(null, readMessage.call(this, Reader.create(buf)));
        } catch (err) {
          callback(err);
        }
      } else {
        callback();
      }
    }
  );
}

module.exports = { parser, Header, Timeslice, StackFrame, Warning };
