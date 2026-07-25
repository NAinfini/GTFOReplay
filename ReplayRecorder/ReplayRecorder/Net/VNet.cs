using API;
using Il2CppInterop.Runtime.Attributes;
using System.Runtime.CompilerServices;

namespace ReplayRecorder.Net {
    public static class VNet {
        private class PacketInfo {
            public string name;
            public Action<ulong, ArraySegment<byte>>? onReceive;
            public byte[] header;

            public PacketInfo(string name, byte[] header, Action<ulong, ArraySegment<byte>>? onReceive = null) {
                this.name = name;
                this.header = header;
                this.onReceive = onReceive;
            }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        internal static void Init() { }

        static VNet() {
            SNetUtils.SNetUtils.OnReceive += Receive;
        }

        private static Dictionary<string, PacketInfo> packetMap = new Dictionary<string, PacketInfo>();

        [HideFromIl2Cpp]
        internal static void Receive(ArraySegment<byte> packet, ulong from) {
            int index = 0;

            string packetName = BitHelper.ReadString(packet, ref index);
            if (!packetMap.ContainsKey(packetName)) {
                APILogger.Warn($"Received unknown VNet event, '{packetName}'.");
                return;
            }

            int payloadSize = BitHelper.ReadUShort(packet, ref index);
            APILogger.Debug($"Received {payloadSize} bytes.");
            packetMap[packetName].onReceive?.Invoke(from, new ArraySegment<byte>(packet.Array!, packet.Offset + index, payloadSize));
        }

        [HideFromIl2Cpp]
        public static void Register(string packetName, Action<ulong, ArraySegment<byte>> callback) {
            if (!packetMap.ContainsKey(packetName)) {
                ByteBuffer header = new ByteBuffer();
                BitHelper.WriteBytes(packetName, header);
                byte[] headerBytes = new byte[header.Count];
                Array.Copy(header.Array.Array!, header.Array.Offset, headerBytes, 0, header.Count);

                packetMap.Add(packetName, new PacketInfo(packetName, headerBytes, callback));
            } else {
                packetMap[packetName].onReceive += callback;
            }
        }
    }
}
