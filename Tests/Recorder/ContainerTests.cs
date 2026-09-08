using System.Buffers.Binary;
using ReplayRecorder.IO;

internal static class ContainerTests {
    private static void Check(bool value, string message) {
        if (!value) throw new Exception(message);
    }

    private static byte[] Frame(uint time, int size = 128) {
        var bytes = new byte[size];
        BinaryPrimitives.WriteInt32LittleEndian(bytes, size - 4);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4), time);
        bytes.AsSpan(8).Fill(42);
        return bytes;
    }

    public static async Task Run() {
        using var disk = new MemoryStream();
        var writer = new ReplayContainer(disk);
        var frames = new List<byte[]> { Frame(0) };
        await writer.WriteFrame(frames[0]);
        long headerEnd = disk.Length;
        for (uint time = 0; time <= 2000; time += 50) {
            var frame = Frame(time);
            frames.Add(frame);
            await writer.WriteFrame(frame);
            if (time < 2000) Check(disk.Length == headerEnd, "block flushed before its two-second window");
        }
        var raw = frames.SelectMany(f => f).ToArray();
        Check(writer.WrittenBytes == raw.Length && disk.Length > headerEnd, "two-second block was not flushed");
        Check(BinaryPrimitives.ReadInt32LittleEndian(disk.ToArray().AsSpan((int)headerEnd + 8)) == 41 * 128, "ticks were not grouped");

        // A late spectator can request a frame boundary inside an already-flushed block.
        using var prefix = new MemoryStream();
        await ReplayContainer.ReadPrefix(new MemoryStream(disk.ToArray()), 4 * 128, bytes => prefix.WriteAsync(bytes).AsTask());
        Check(prefix.ToArray().SequenceEqual(raw.Take(4 * 128)), "spectator prefix leaked later frames or lost bytes");
        try {
            await ReplayContainer.ReadPrefix(new MemoryStream(disk.ToArray()), 129, _ => Task.CompletedTask);
            throw new Exception("partial spectator frame accepted");
        } catch (InvalidDataException) { }

        var tail = Frame(2050);
        await writer.WriteFrame(tail);
        Check(writer.WrittenBytes == raw.Length, "pending bytes advertised as readable on disk");
        Array.Fill(tail, (byte)99);
        await writer.Flush();
        Check(writer.WrittenBytes == raw.Length + 128, "spectator flush lost tail");
        using var tailRead = new MemoryStream();
        await ReplayContainer.ReadPrefix(new MemoryStream(disk.ToArray()), writer.WrittenBytes, bytes => tailRead.WriteAsync(bytes).AsTask());
        Check(tailRead.ToArray().Skip(raw.Length).SequenceEqual(Frame(2050)), "writer retained caller-owned memory");
        await writer.WriteFrame(Frame(2100));
        await writer.Complete(2500);
        Check(writer.WrittenBytes == raw.Length + 256, "completion lost partial block");
        Check(BinaryPrimitives.ReadUInt32LittleEndian(disk.ToArray().AsSpan((int)disk.Length - 4)) == 2, "completion footer missing");
        try { await writer.WriteFrame(Frame(2600)); throw new Exception("write after completion accepted"); }
        catch (InvalidOperationException) { }

        using var bounded = new MemoryStream();
        var boundedWriter = new ReplayContainer(bounded);
        await boundedWriter.WriteFrame(Frame(0));
        var large = Frame(100, ReplayContainer.TargetBlockBytes - 1);
        await boundedWriter.WriteFrame(large);
        Check(boundedWriter.WrittenBytes == 128, "bounded block flushed early");
        await boundedWriter.WriteFrame(Frame(150));
        Check(boundedWriter.WrittenBytes == 128 + large.Length, "byte cap did not flush existing block");
        await boundedWriter.WriteFrame(Frame(200, ReplayContainer.TargetBlockBytes + 1));
        Check(boundedWriter.WrittenBytes == 128 + large.Length + 128 + ReplayContainer.TargetBlockBytes + 1, "oversized frame was split or held");
        await boundedWriter.Complete(250);

        using var concurrent = new YieldingStream();
        var concurrentWriter = new ReplayContainer(concurrent);
        await concurrentWriter.WriteFrame(Frame(0));
        await Task.WhenAll(Enumerable.Range(0, 100).Select(async _ => {
            await concurrentWriter.WriteFrame(Frame(50));
            await concurrentWriter.Flush();
        }));
        await concurrentWriter.Complete(100);
        using var concurrentRead = new MemoryStream();
        await ReplayContainer.ReadPrefix(new MemoryStream(concurrent.ToArray()), 101 * 128, bytes => concurrentRead.WriteAsync(bytes).AsTask());
        Check(concurrentRead.Length == 101 * 128, "concurrent flush lost or duplicated frames");

        using var failedDisk = new FailingStream();
        var failedWriter = new ReplayContainer(failedDisk);
        await failedWriter.WriteFrame(Frame(0));
        await failedWriter.WriteFrame(Frame(50));
        failedDisk.Fail = true;
        try { await failedWriter.Flush(); throw new Exception("disk failure hidden"); } catch (IOException) { }
        failedDisk.Fail = false;
        try { await failedWriter.Complete(100); throw new Exception("failed writer emitted completion"); } catch (IOException) { }
        Check(failedWriter.WrittenBytes == 128 && failedWriter.Error is IOException, "failed block advanced readable prefix or hid its error");
        Console.WriteLine("PASS: two-second blocks, owned/bounded buffering, spectator prefix/flush, final tail, sticky disk failure");
    }

    // Use the production writer for reproducible benchmarks of decoded real-session data.
    public static async Task Repack(string source, string destination, uint duration) {
        using var input = File.OpenRead(source);
        using var reader = new BinaryReader(input);
        using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write);
        var writer = new ReplayContainer(output);
        int frames = 0;
        var timer = System.Diagnostics.Stopwatch.StartNew();
        while (input.Position < input.Length) {
            int length = reader.ReadInt32();
            if (length < 0 || length > ReplayContainer.MaxFrameSize - 4) throw new InvalidDataException("Invalid frame size.");
            var frame = new byte[length + 4];
            BinaryPrimitives.WriteInt32LittleEndian(frame, length);
            int offset = 4;
            while (offset < frame.Length) {
                int count = await input.ReadAsync(frame.AsMemory(offset));
                if (count == 0) throw new EndOfStreamException();
                offset += count;
            }
            await writer.WriteFrame(frame);
            ++frames;
        }
        await writer.Complete(duration);
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { frames, rawBytes = writer.WrittenBytes, physicalBytes = writer.PhysicalBytes, encodeMs = timer.Elapsed.TotalMilliseconds }));
    }

    private sealed class FailingStream : MemoryStream {
        public bool Fail;
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default) =>
            Fail ? ValueTask.FromException(new IOException("injected disk failure")) : base.WriteAsync(buffer, cancellationToken);
    }

    private sealed class YieldingStream : MemoryStream {
        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default) {
            await Task.Yield();
            await base.WriteAsync(buffer, cancellationToken);
        }
    }
}
