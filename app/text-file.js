/** Read one bounded, strict UTF-8 snapshot before an import parser or store sees it. */
export async function readTextFile(file, { maxBytes, label = 'File' } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('A positive file size limit is required.');
  const size = file?.size;
  if (!Number.isSafeInteger(size) || size < 0) throw new Error(`${label} has an invalid file size.`);
  if (size > maxBytes) throw new Error(`${label} is larger than ${maxBytes / 1024} KB.`);
  if (typeof file.arrayBuffer !== 'function') throw new Error(`${label} could not be read as bytes.`);

  const bytes = await file.arrayBuffer();
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== size || bytes.byteLength > maxBytes) {
    throw new Error(`${label} could not be read completely: the byte length does not match its size.`);
  }
  try {
    // Like File.text(), the decoder accepts and strips an optional UTF-8 BOM.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8. Export it as UTF-8 and try again.`);
  }
}
