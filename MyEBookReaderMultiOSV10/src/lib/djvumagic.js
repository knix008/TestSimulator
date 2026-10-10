/** True when the bytes are a DjVu document, whatever the file is called. */
export function looksLikeDjvu(data) {
  // AT&T FORM <4-byte size> DJVU / DJVM / DJVI / THUM
  if (!data || data.length < 16) return false;
  if (data[0] !== 0x41 || data[1] !== 0x54 || data[2] !== 0x26 || data[3] !== 0x54) return false;
  if (data[4] !== 0x46 || data[5] !== 0x4f || data[6] !== 0x52 || data[7] !== 0x4d) return false;
  const kind = String.fromCharCode(data[12], data[13], data[14], data[15]);
  return kind === 'DJVU' || kind === 'DJVM' || kind === 'DJVI' || kind === 'THUM';
}
