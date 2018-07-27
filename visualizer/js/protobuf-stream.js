const { Reader } = require("protobufjs");
const { Header, Timeslice, Warning } = require("./protos").alex;

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
  let dataSize = null;
  let finishedHeader = false,
    finishedTimeslices = false;
  let lastPos = 0;

  function readMessage(reader, callback) {
    if (!finishedHeader) {
      this.push(processMessage(Header.decode(reader, dataSize)));
      finishedHeader = true;
    } else if (!finishedTimeslices) {
      try {
        this.push(processMessage(Timeslice.decode(reader, dataSize)));
      } catch (err) {
        // check if we're onto warnings now
        try {
          // reset pos back to before invalid read
          reader.pos = lastPos;
          this.push(processMessage(Warning.decode(reader, dataSize)));
          finishedTimeslices = true;
        } catch (err) {
          // nope, data must be malformed then
          callback(err);
        }
      }
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
          callback(null, readMessage.call(this, Reader.create(buf), callback));
        } catch (err) {
          callback(err);
        }
      } else {
        callback();
      }
    }
  );
}

module.exports = { parser, Header, Timeslice, Warning };
