using System.Text;

namespace ScreenCamWin.Core;

/// <summary>Reads video frames from an AVI produced by <see cref="AviContainer"/>.</summary>
internal sealed class AviVideoReader
{
    public int Width { get; private set; }
    public int Height { get; private set; }
    public int Fps { get; private set; } = 30;
    public uint Handler { get; private set; }
    public byte[] Strf { get; private set; } = [];
    public List<byte[]> Frames { get; } = [];

    public static AviVideoReader Open(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var br = new BinaryReader(fs, Encoding.ASCII, leaveOpen: true);

        var reader = new AviVideoReader();
        reader.Parse(fs, br);
        return reader;
    }

    void Parse(FileStream fs, BinaryReader br)
    {
        if (ReadFourCC(br) != "RIFF") throw new InvalidDataException("AVI 파일이 아닙니다.");
        br.ReadUInt32();
        if (ReadFourCC(br) != "AVI ") throw new InvalidDataException("AVI 컨테이너가 아닙니다.");

        long moviStart = -1;
        uint moviSize  = 0;

        while (fs.Position + 8 <= fs.Length)
        {
            long chunkStart = fs.Position;
            string id       = ReadFourCC(br);
            uint size       = br.ReadUInt32();

            if (id is "LIST" or "RIFF")
            {
                string listType = ReadFourCC(br);
                long listEnd = chunkStart + 8 + size;

                if (listType == "hdrl")
                    ParseHdrl(br, listEnd);
                else if (listType == "movi")
                {
                    moviStart = fs.Position;
                    moviSize  = size - 4;
                }

                fs.Position = listEnd;
                continue;
            }

            fs.Position = chunkStart + 8 + size + (size & 1);
        }

        if (moviStart < 0)
            throw new InvalidDataException("AVI movi 섹션을 찾을 수 없습니다.");

        fs.Position = moviStart;
        long moviEnd = moviStart + moviSize;
        while (fs.Position + 8 <= moviEnd)
        {
            string chunkId = ReadFourCC(br);
            uint chunkSize = br.ReadUInt32();

            if (chunkId == "00dc")
            {
                Frames.Add(br.ReadBytes((int)chunkSize));
                if ((chunkSize & 1) != 0)
                    br.ReadByte();
            }
            else
            {
                fs.Position += chunkSize + (chunkSize & 1);
            }
        }

        if (Frames.Count == 0)
            throw new InvalidDataException("AVI에 영상 프레임이 없습니다.");
    }

    void ParseHdrl(BinaryReader br, long listEnd)
    {
        while (br.BaseStream.Position + 8 <= listEnd)
        {
            long chunkStart = br.BaseStream.Position;
            string id       = ReadFourCC(br);
            uint size       = br.ReadUInt32();

            if (id is "LIST" or "RIFF")
            {
                string listType = ReadFourCC(br);
                long innerEnd = chunkStart + 8 + size;

                if (listType == "strl")
                    ParseStrl(br, innerEnd);

                br.BaseStream.Position = innerEnd;
                continue;
            }

            if (id == "avih" && size >= 56)
            {
                br.ReadUInt32();
                br.ReadUInt32();
                br.ReadUInt32();
                br.ReadUInt32();
                br.ReadUInt32();
                Width  = br.ReadInt32();
                Height = br.ReadInt32();
            }

            br.BaseStream.Position = chunkStart + 8 + size;
        }
    }

    void ParseStrl(BinaryReader br, long listEnd)
    {
        bool isVideo = false;

        while (br.BaseStream.Position + 8 <= listEnd)
        {
            long chunkStart = br.BaseStream.Position;
            string id       = ReadFourCC(br);
            uint size       = br.ReadUInt32();

            if (id == "strh" && size >= 56)
            {
                string type = ReadFourCC(br);
                isVideo = type == "vids";
                if (isVideo)
                {
                    Handler = br.ReadUInt32();
                    br.ReadUInt32();
                    br.ReadUInt16();
                    br.ReadUInt16();
                    br.ReadUInt32();
                    br.ReadUInt32();
                    Fps = (int)br.ReadUInt32();
                    if (Fps <= 0) Fps = 30;
                }
                br.BaseStream.Position = chunkStart + 8 + size;
                continue;
            }

            if (id == "strf" && isVideo)
            {
                Strf = br.ReadBytes((int)size);
                isVideo = false;
            }

            br.BaseStream.Position = chunkStart + 8 + size;
        }
    }

    static string ReadFourCC(BinaryReader br)
    {
        Span<byte> b = stackalloc byte[4];
        br.Read(b);
        return Encoding.ASCII.GetString(b);
    }
}
