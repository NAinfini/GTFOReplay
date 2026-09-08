using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;

namespace ReplayRecorder.Steam {
    // Test logger only; the production TCP implementation is linked without loading Steam/Unity.
    internal static class SteamPacketIO {
        internal static readonly ConcurrentBag<Exception> Errors = new();
        internal static void Report(string operation, Exception error) => Errors.Add(error);
        internal static void Guard(string operation, Action action) {
            try { action(); } catch (Exception error) { Report(operation, error); }
        }
    }
}
internal static class NetworkTests {
    public static async Task Run() {
        using var server = new ReplayRecorder.TCPServer(16);
        var accepted = new TaskCompletionSource<EndPoint>(TaskCreationOptions.RunContinuationsAsynchronously);
        var received = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        var disconnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        server.onAccept += endpoint => accepted.TrySetResult(endpoint);
        server.onReceive += (data, endpoint) => {
            if (data[0] == 255) throw new IOException("injected TCP callback fault");
            received.TrySetResult(data.ToArray());
        };
        server.onDisconnect += _ => disconnected.TrySetResult();
        server.onClose += () => { };
        var endpoint = (IPEndPoint)server.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        using var client = new TcpClient();
        await client.ConnectAsync(endpoint.Address, endpoint.Port);
        var remote = await accepted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var stream = client.GetStream();
        foreach (byte value in new byte[] { 3, 0, 0, 0, 4, 5, 6 }) await stream.WriteAsync(new byte[] { value });
        var packet = await received.Task.WaitAsync(TimeSpan.FromSeconds(5));
        if (!packet.SequenceEqual(new byte[] { 4, 5, 6 })) throw new Exception("TCP framing changed payload");
        await server.SendTo(new byte[] { 8, 9 }, remote);
        byte[] reply = new byte[6];
        int offset = 0;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (offset < reply.Length) {
            int count = await stream.ReadAsync(reply.AsMemory(offset), timeout.Token);
            if (count == 0) throw new Exception("TCP response ended early");
            offset += count;
        }
        if (!reply.SequenceEqual(new byte[] { 2, 0, 0, 0, 8, 9 })) throw new Exception("TCP send framing failed");
        await stream.WriteAsync(new byte[] { 1, 0, 0, 0, 255 });
        await disconnected.Task.WaitAsync(TimeSpan.FromSeconds(5));
        if (!ReplayRecorder.Steam.SteamPacketIO.Errors.Any(error => error.Message == "injected TCP callback fault")) throw new Exception("TCP callback error was not logged");
        accepted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        using var nextClient = new TcpClient();
        await nextClient.ConnectAsync(endpoint.Address, endpoint.Port);
        await accepted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        server.Dispose();
        if (server.Connections.Count != 0) throw new Exception("TCP shutdown retained connections");
        Console.WriteLine("PASS: real loopback TCP framing/send, logged callback failure, subsequent connection, and shutdown");
    }
}
