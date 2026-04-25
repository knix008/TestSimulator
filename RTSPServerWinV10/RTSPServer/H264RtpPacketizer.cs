using System;
using System.Collections.Generic;

namespace RTSPServer
{
    /// <summary>
    /// H.264 비디오를 RTP 패킷으로 변환하는 클래스
    /// </summary>
    public class H264RtpPacketizer
    {
        private ushort _sequenceNumber;
        private uint _timestamp;
        private readonly uint _ssrc;
        private const int MaxPayloadSize = 1400; // MTU 고려

        public H264RtpPacketizer()
        {
            _sequenceNumber = 0;
            _timestamp = 0;
            _ssrc = (uint)new Random().Next();
        }

        /// <summary>
        /// H.264 NAL unit를 RTP 패킷으로 변환
        /// </summary>
        public List<byte[]> PacketizeNalUnit(byte[] nalUnit)
        {
            var packets = new List<byte[]>();

            if (nalUnit.Length == 0) return packets;

            // NAL unit가 MTU보다 작으면 단일 NAL unit 모드
            if (nalUnit.Length <= MaxPayloadSize)
            {
                packets.Add(CreateSingleNalPacket(nalUnit));
            }
            else
            {
                // NAL unit가 크면 FU-A (Fragmentation Unit) 모드
                packets.AddRange(CreateFragmentedPackets(nalUnit));
            }

            // 타임스탬프 증가 (90kHz clock for H.264)
            _timestamp += 3600; // 40ms per frame for 25fps

            return packets;
        }

        private byte[] CreateSingleNalPacket(byte[] nalUnit)
        {
            var packet = new byte[12 + nalUnit.Length];
            WriteRtpHeader(packet, false);
            Array.Copy(nalUnit, 0, packet, 12, nalUnit.Length);
            _sequenceNumber++;
            return packet;
        }

        private List<byte[]> CreateFragmentedPackets(byte[] nalUnit)
        {
            var packets = new List<byte[]>();
            var nalHeader = nalUnit[0];
            var nalPayload = new byte[nalUnit.Length - 1];
            Array.Copy(nalUnit, 1, nalPayload, 0, nalPayload.Length);

            var fragmentCount = (int)Math.Ceiling((double)nalPayload.Length / MaxPayloadSize);

            for (int i = 0; i < fragmentCount; i++)
            {
                var isFirst = i == 0;
                var isLast = i == fragmentCount - 1;
                var fragmentSize = Math.Min(MaxPayloadSize, nalPayload.Length - i * MaxPayloadSize);
                
                var packet = new byte[12 + 2 + fragmentSize]; // RTP header + FU indicator + FU header + payload
                
                WriteRtpHeader(packet, isLast);
                
                // FU indicator
                packet[12] = (byte)((nalHeader & 0xE0) | 28); // FU-A type = 28
                
                // FU header
                byte fuHeader = (byte)(nalHeader & 0x1F);
                if (isFirst) fuHeader |= 0x80; // Start bit
                if (isLast) fuHeader |= 0x40;  // End bit
                packet[13] = fuHeader;
                
                // Payload
                Array.Copy(nalPayload, i * MaxPayloadSize, packet, 14, fragmentSize);
                
                packets.Add(packet);
                _sequenceNumber++;
            }

            return packets;
        }

        private void WriteRtpHeader(byte[] packet, bool marker)
        {
            // RTP Header (12 bytes)
            packet[0] = 0x80; // V=2, P=0, X=0, CC=0
            packet[1] = (byte)(marker ? 0xE0 : 0x60); // M=marker, PT=96
            
            // Sequence Number
            packet[2] = (byte)(_sequenceNumber >> 8);
            packet[3] = (byte)(_sequenceNumber & 0xFF);
            
            // Timestamp
            packet[4] = (byte)(_timestamp >> 24);
            packet[5] = (byte)((_timestamp >> 16) & 0xFF);
            packet[6] = (byte)((_timestamp >> 8) & 0xFF);
            packet[7] = (byte)(_timestamp & 0xFF);
            
            // SSRC
            packet[8] = (byte)(_ssrc >> 24);
            packet[9] = (byte)((_ssrc >> 16) & 0xFF);
            packet[10] = (byte)((_ssrc >> 8) & 0xFF);
            packet[11] = (byte)(_ssrc & 0xFF);
        }
    }
}
