using System;
using System.Collections.Generic;

namespace RTSPServer
{
    /// <summary>
    /// AAC 오디오를 RTP 패킷으로 변환하는 클래스
    /// </summary>
    public class AacRtpPacketizer
    {
        private ushort _sequenceNumber;
        private uint _timestamp;
        private readonly uint _ssrc;
        private const int MaxPayloadSize = 1400; // MTU 고려
        private const int SampleRate = 44100; // 44.1kHz

        public AacRtpPacketizer()
        {
            _sequenceNumber = 0;
            _timestamp = 0;
            _ssrc = (uint)new Random().Next();
        }

        /// <summary>
        /// AAC 프레임을 RTP 패킷으로 변환
        /// </summary>
        public List<byte[]> PacketizeAacFrame(byte[] aacFrame)
        {
            var packets = new List<byte[]>();

            if (aacFrame.Length == 0) return packets;

            // AAC는 일반적으로 작은 프레임이므로 단일 RTP 패킷으로 전송
            if (aacFrame.Length <= MaxPayloadSize)
            {
                packets.Add(CreateAacPacket(aacFrame, true));
            }
            else
            {
                // 큰 프레임은 분할 (드물지만 처리)
                int offset = 0;
                while (offset < aacFrame.Length)
                {
                    var chunkSize = Math.Min(MaxPayloadSize, aacFrame.Length - offset);
                    var chunk = new byte[chunkSize];
                    Array.Copy(aacFrame, offset, chunk, 0, chunkSize);
                    
                    var isLast = (offset + chunkSize >= aacFrame.Length);
                    packets.Add(CreateAacPacket(chunk, isLast));
                    
                    offset += chunkSize;
                }
            }

            // 타임스탬프 증가 (AAC 프레임당 1024 샘플)
            _timestamp += 1024;

            return packets;
        }

        private byte[] CreateAacPacket(byte[] payload, bool marker)
        {
            // RTP 헤더(12) + AU header section(4) + payload
            var packet = new byte[12 + 4 + payload.Length];
            
            WriteRtpHeader(packet, marker);
            
            // AU-headers-length (16 bits) - AU 헤더의 비트 길이
            packet[12] = 0x00;
            packet[13] = 0x10; // 16 bits (2 bytes)
            
            // AU-header (16 bits) - AU-size(13 bits) + AU-Index(3 bits)
            int auSize = payload.Length;
            packet[14] = (byte)((auSize >> 5) & 0xFF); // 상위 8비트
            packet[15] = (byte)((auSize << 3) & 0xF8); // 하위 5비트 + AU-Index(0)
            
            // Payload
            Array.Copy(payload, 0, packet, 16, payload.Length);
            
            _sequenceNumber++;
            return packet;
        }

        private void WriteRtpHeader(byte[] packet, bool marker)
        {
            // RTP Header (12 bytes)
            packet[0] = 0x80; // V=2, P=0, X=0, CC=0
            packet[1] = (byte)(marker ? 0xE0 | 97 : 97); // M=marker, PT=97 (AAC)
            
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
