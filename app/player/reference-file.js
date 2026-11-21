// Selected-file identity only. No audio decoding, player verification, persistence
// or qualification is performed. Byte buffers live only for this bounded read.
import { sha256Hex } from '../sha256.js';

export const CDJ_REFERENCE_FILE_SCHEMA = 'deckchek.cdj04.reference-file.v1';
export const CDJ_MAX_REFERENCE_BYTES = 32 * 1024 * 1024;

function checkCancelled(signal) {
  if (signal?.aborted) {
    const error = new Error('Reference-file selection was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

/**
 * Hash the exact bytes of one explicitly selected local File, then return only
 * immutable metadata. Cancellation suppresses publication; File.arrayBuffer()
 * and a digest already in progress are not physically aborted or zeroized.
 */
export async function inspectPlayerReferenceFile(file, { signal = null } = {}) {
  checkCancelled(signal);
  const size = file?.size, name = file?.name;
  if (!Number.isSafeInteger(size) || size < 1 || size > CDJ_MAX_REFERENCE_BYTES) {
    throw new RangeError('Choose a nonempty reference file no larger than 32 MiB.');
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 240 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new TypeError('The reference file needs a name of at most 240 characters without control characters.');
  }
  if (typeof file.arrayBuffer !== 'function') throw new TypeError('The selected reference file cannot be read as bytes.');
  const bytes = await file.arrayBuffer();
  checkCancelled(signal);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== size || bytes.byteLength > CDJ_MAX_REFERENCE_BYTES) {
    throw new RangeError('The reference-file read did not match its declared byte length.');
  }
  const sha256 = await sha256Hex(bytes);
  checkCancelled(signal);
  return Object.freeze({
    schemaVersion: CDJ_REFERENCE_FILE_SCHEMA,
    fileName: name,
    byteLength: size,
    digestAlgorithm: 'SHA-256',
    sha256,
    hashBasis: 'selected_file_bytes',
    playbackIdentity: 'unverified',
    bytesRetained: false,
  });
}
