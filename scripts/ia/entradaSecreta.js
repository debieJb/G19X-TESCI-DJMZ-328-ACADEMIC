'use strict';

function leerSecretoOculto(etiqueta, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function' || typeof input.on !== 'function') {
    throw Object.assign(new Error('TTY_REQUIRED'), { code: 'TTY_REQUIRED' });
  }

  output.write(etiqueta);
  const wasRaw = Boolean(input.isRaw);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      input.removeListener('data', onData);
      input.removeListener('error', onError);
      input.setRawMode(wasRaw);
      input.pause();
    };
    const onError = () => {
      cleanup();
      output.write('\n');
      reject(Object.assign(new Error('INPUT_FAILED'), { code: 'INPUT_FAILED' }));
    };
    const onData = chunk => {
      // Raw TTY data is handled byte-by-byte so pasted input cannot be truncated
      // by keypress-event parsing. Only ASCII is retained; other bytes become a
      // rejected marker and are never echoed.
      for (const byte of Buffer.from(chunk)) {
        if (byte === 3) {
          cleanup();
          output.write('\n');
          reject(Object.assign(new Error('INPUT_CANCELLED'), { code: 'INPUT_CANCELLED' }));
          return;
        }
        if (byte === 10 || byte === 13) {
          cleanup();
          output.write('\n');
          resolve(value);
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
        } else if (byte >= 32 && byte <= 126) {
          value += String.fromCharCode(byte);
        } else {
          value += '\uFFFD';
        }
      }
    };
    input.on('data', onData);
    input.once('error', onError);
  });
}

module.exports = { leerSecretoOculto };
