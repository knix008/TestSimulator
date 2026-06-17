using System;
using System.IO;

namespace DBToolsWinV10.Import.VectorIndex;

internal sealed class FaissBinaryReader : IDisposable
{
	private readonly BinaryReader _reader;

	public long Position => _reader.BaseStream.Position;

	public long Length => _reader.BaseStream.Length;

	public FaissBinaryReader(Stream stream)
	{
		_reader = new BinaryReader(stream);
	}

	public uint ReadUInt32() => _reader.ReadUInt32();

	public int ReadInt32() => _reader.ReadInt32();

	public long ReadInt64() => _reader.ReadInt64();

	public bool ReadBool()
	{
		byte value = _reader.ReadByte();
		return value != 0;
	}

	public byte ReadByte() => _reader.ReadByte();

	public float ReadSingle() => _reader.ReadSingle();

	public ulong ReadUInt64() => _reader.ReadUInt64();

	public void Skip(long bytes)
	{
		if (bytes < 0)
			throw new InvalidDataException("잘못된 skip 크기입니다.");

		_reader.BaseStream.Seek(bytes, SeekOrigin.Current);
	}

	public void SkipVector(int elementSize)
	{
		ulong count = ReadSize();
		SkipChecked((long)count * elementSize);
	}

	public void SkipXbVector()
	{
		ulong floatCount = ReadSize();
		SkipChecked((long)floatCount * sizeof(float));
	}

	public ulong ReadSize()
	{
		return _reader.ReadUInt64();
	}

	private void SkipChecked(long bytes)
	{
		if (bytes < 0 || Position + bytes > Length)
			throw new InvalidDataException("Faiss 파일 형식이 예상과 다릅니다.");

		Skip(bytes);
	}

	public void Dispose()
	{
		_reader.Dispose();
	}
}
