// Port of Import/VectorIndex/FaissBinaryReader.cs — little-endian binary cursor.
export class BinaryCursor {
  private readonly view: DataView;
  position = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  private need(count: number): void {
    if (this.position + count > this.length) {
      throw new RangeError('파일 끝을 넘어 읽으려고 했습니다.');
    }
  }

  readUInt32(): number {
    this.need(4);
    const v = this.view.getUint32(this.position, true);
    this.position += 4;
    return v;
  }

  readInt32(): number {
    this.need(4);
    const v = this.view.getInt32(this.position, true);
    this.position += 4;
    return v;
  }

  readInt64(): number {
    this.need(8);
    const v = this.view.getBigInt64(this.position, true);
    this.position += 8;
    return Number(v);
  }

  readUInt64(): number {
    this.need(8);
    const v = this.view.getBigUint64(this.position, true);
    this.position += 8;
    return Number(v);
  }

  readBool(): boolean {
    return this.readByte() !== 0;
  }

  readByte(): number {
    this.need(1);
    return this.bytes[this.position++];
  }

  readSingle(): number {
    this.need(4);
    const v = this.view.getFloat32(this.position, true);
    this.position += 4;
    return v;
  }

  skip(bytes: number): void {
    if (bytes < 0) throw new Error('잘못된 skip 크기입니다.');
    this.position += bytes;
    if (this.position > this.length) throw new RangeError('파일 끝을 넘어 이동했습니다.');
  }

  private skipChecked(bytes: number): void {
    if (bytes < 0 || this.position + bytes > this.length) {
      throw new Error('Faiss 파일 형식이 예상과 다릅니다.');
    }
    this.skip(bytes);
  }

  readSize(): number {
    return this.readUInt64();
  }

  skipVector(elementSize: number): void {
    const count = this.readSize();
    this.skipChecked(count * elementSize);
  }

  skipXbVector(): void {
    const floatCount = this.readSize();
    this.skipChecked(floatCount * 4);
  }
}
