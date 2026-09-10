using ReplayRecorder.IO;

if (args.Length == 4 && args[0] == "--repack") {
    await ContainerTests.Repack(args[1], args[2], uint.Parse(args[3]));
    return;
}

static void Check(bool condition, string message) {
    if (!condition) throw new Exception(message);
}

SessionLifecycleTests.Run();

// The live R2A1 failure occurred on the second of 13 map surfaces, before EOH.
var headers = new HeaderSequence(new[] { typeof(int), typeof(string), typeof(byte) });
int surfaceWrites = 0;
Check(!headers.Write(typeof(int), () => { }), "metadata ended headers early");
for (int i = 0; i < 13; i++)
    Check(!headers.Write(typeof(string), () => ++surfaceWrites), "map section ended before its terminator");
try { headers.Write(typeof(double), () => throw new Exception("unknown header reached writer")); }
catch (InvalidDataException) { }
try { headers.Write(typeof(byte), () => throw new IOException("header write failure")); }
catch (IOException) { }
Check(!headers.Complete && surfaceWrites == 13, "failed write changed header completion");
Check(headers.Write(typeof(byte), () => { }) && headers.Complete, "EOH failed to complete headers");
try { headers.Write(typeof(string), () => ++surfaceWrites); throw new Exception("late header was accepted"); }
catch (InvalidOperationException) { }
Console.WriteLine("PASS: repeated map surface headers, explicit completion, unknown/failed/late header rejection");

var unblock = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var output = new MemoryStream();
var queue = new BufferWriteQueue(async bytes => {
    entered.TrySetResult();
    await unblock.Task;
    await output.WriteAsync(bytes);
}, capacity: 2, byteLimit: 6);

byte[] input = { 1, 2 };
Check(queue.TryWrite(input), "first frame rejected");
await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
input[0] = 99;
Check(queue.TryWrite(new byte[] { 3, 4 }), "second frame rejected");
Check(queue.TryWrite(new byte[] { 5, 6 }), "third frame rejected");
Check(!queue.TryWrite(new byte[] { 7 }), "byte limit must reject immediately");
var completion = queue.CompleteAsync();
Check(!completion.IsCompleted, "completion must drain outstanding writes");
Check(!queue.TryWrite(input), "closed queue accepted data");
unblock.SetResult();
await completion.WaitAsync(TimeSpan.FromSeconds(5));
Check(output.ToArray().SequenceEqual(new byte[] { 1, 2, 3, 4, 5, 6 }), "order or buffer ownership corrupted");
Check(queue.PendingBytes == 0 && queue.WrittenBytes == 6, "queue accounting incorrect");
await queue.CompleteAsync();

var failure = new BufferWriteQueue(_ => throw new IOException("disk full"));
Check(failure.TryWrite(input), "failure fixture rejected");
try {
    await failure.CompleteAsync().WaitAsync(TimeSpan.FromSeconds(5));
    throw new Exception("write failure was hidden");
} catch (IOException) { }
Check(failure.Error is IOException && failure.PendingBytes == 0, "failure did not release queued memory");
Check(!failure.TryWrite(input), "failed queue accepted data");
Console.WriteLine("PASS: ordered writes, owned buffers, bounded backlog, drain, failure propagation");

byte[] Frame(uint time, byte value, int payload = 128) {
    byte[] bytes = new byte[payload + 8];
    System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(bytes, bytes.Length - 4);
    System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4), time);
    bytes.AsSpan(8).Fill(value);
    return bytes;
}
var frames = new[] { Frame(0, 11), Frame(1000, 22), Frame(2000, 33) };
using var containerBytes = new MemoryStream();
var container = new ReplayContainer(containerBytes);
foreach (var frame in frames) await container.WriteFrame(frame);
const string diagnosticReport = "{\"SchemaVersion\":1,\"SessionId\":\"session-a\",\"Failure\":null,\"Ticks\":2}";
await container.WriteDiagnostics(diagnosticReport);
await container.Complete(2500);
var raw = frames.SelectMany(f => f).ToArray();
using var decoded = new MemoryStream();
await ReplayContainer.ReadPrefix(new MemoryStream(containerBytes.ToArray()), raw.Length, bytes => decoded.WriteAsync(bytes).AsTask());
Check(decoded.ToArray().SequenceEqual(raw), "container round-trip changed bytes");
Check(ReplayContainer.Crc32(System.Text.Encoding.ASCII.GetBytes("123456789")) == 0xcbf43926, "CRC32 standard vector failed");
var corrupted = containerBytes.ToArray();
corrupted[8 + 24] ^= 1;
try {
    await ReplayContainer.ReadPrefix(new MemoryStream(corrupted), raw.Length, _ => Task.CompletedTask);
    throw new Exception("corrupted chunk was accepted");
} catch (InvalidDataException) { }
try {
    await ReplayContainer.ReadPrefix(new MemoryStream(containerBytes.ToArray()[..40]), raw.Length, _ => Task.CompletedTask);
    throw new Exception("truncated chunk was accepted");
} catch (EndOfStreamException) { }
if (args.Length > 0) {
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[0]))!);
    await File.WriteAllBytesAsync(args[0], containerBytes.ToArray());
    await File.WriteAllBytesAsync(args[0] + ".raw", raw);
    using var failedBytes = new MemoryStream();
    var failedCapture = new ReplayContainer(failedBytes);
    foreach (var frame in frames) await failedCapture.WriteFrame(frame);
    await failedCapture.WriteDiagnostics(diagnosticReport.Replace("null", "\"capture failed\""));
    Check(failedCapture.WrittenBytes == raw.Length, "diagnostics entered the logical stream");
    await File.WriteAllBytesAsync(args[0] + ".failed", failedBytes.ToArray());
    using var earlyBytes = new MemoryStream();
    var earlyCapture = new ReplayContainer(earlyBytes);
    await earlyCapture.WriteDiagnostics(diagnosticReport.Replace("null", "\"header failed\""));
    Check(earlyCapture.WrittenBytes == 0, "early diagnostics became playback data");
    await File.WriteAllBytesAsync(args[0] + ".early", earlyBytes.ToArray());
}
Console.WriteLine("PASS: container round-trip, CRC32, corrupted/truncated input");
await ContainerTests.Run();

var codec = new Vanilla.Enemy.EnemyStateCodec();
var encodedState = new byte[4];
var random = new Random(1234);
byte consumed = 255, target = 255, stagger = 0;
byte decodedConsumed = 0, decodedTarget = 0, decodedStagger = 0;
long stateBytes = 0;
for (int tick = 0; tick < 10000; ++tick) {
    if (tick % 29 == 0) consumed = (byte)random.Next(256);
    if (tick % 13 == 0) target = (byte)random.Next(256);
    if (tick % 7 == 0) stagger = (byte)random.Next(256);
    bool tagged = tick % 3 == 0, canStagger = tick % 5 != 0;
    int length = codec.Write(encodedState, tagged, canStagger, consumed, target, stagger);
    byte mask = encodedState[0];
    int offset = 1;
    if ((mask & 4) != 0) decodedConsumed = encodedState[offset++];
    if ((mask & 8) != 0) decodedTarget = encodedState[offset++];
    if ((mask & 16) != 0) decodedStagger = encodedState[offset++];
    Check(offset == length && decodedConsumed == consumed && decodedTarget == target && decodedStagger == stagger &&
        ((mask & 1) != 0) == tagged && ((mask & 2) != 0) == canStagger, "enemy delta lost a field transition");
    stateBytes += length;
}
Console.WriteLine($"PASS: 10,000 enemy state transitions; state bytes 50000 -> {stateBytes} (synthetic, excludes transforms/compression)");

var capturedFaults = new List<(string operation, Exception error)>();
int cleanedUp = 0;
Action lifecycle = () => throw new IOException("injected callback failure");
lifecycle += () => ++cleanedUp;
lifecycle += () => throw new InvalidOperationException("second injected failure");
lifecycle += () => ++cleanedUp;
CallbackGuard.Invoke("expedition-end", lifecycle, (operation, error) => capturedFaults.Add((operation, error)));
Check(cleanedUp == 2 && capturedFaults.Count == 2, "callback failure escaped or suppressed later cleanup");
Check(capturedFaults.All(f => f.operation.StartsWith("expedition-end/") && f.error.StackTrace != null), "fault context/stack was lost");
CallbackGuard.Run("update", () => throw new Exception("injected update failure"), (operation, error) => capturedFaults.Add((operation, error)));
Check(capturedFaults.Count == 3 && capturedFaults[2].operation == "update", "update fault escaped boundary");
Console.WriteLine("PASS: injected update/lifecycle failures are logged; later cleanup callbacks still run");
RecordingStartTests.Run();
foreach (var name in new[] { "Modded_Arena", "CustomMaterial(Clone)", "", "Assets/Complex/Dimensions/Custom/Map.prefab" }) {
    Check(Vanilla.Map.FloorThemeCodec.FromSource(name, name, 999, 999) == Vanilla.Map.FloorTheme.Unknown,
        "Unrecognized modded floor identity must record as Unknown.");
}
Console.WriteLine("PASS: unknown modded geometry families record the basic floor theme without exceptions");

bool congested = true;
var packets = new List<byte>();
using var network = new PacketSendQueue(packet => {
    if (congested) return false;
    packets.Add(packet.Array![packet.Offset]); return true;
}, maxBytes: 3, maxPackets: 3);
var mutable = new byte[] { 1 };
Check(network.Send(mutable), "congested send rejected before bound");
mutable[0] = 99;
network.Send(new byte[] { 2 });
for (int i = 0; i < 100; ++i) network.Flush();
network.Send(new byte[] { 3 });
try { network.Send(new byte[] { 4 }); throw new Exception("unbounded spectator backlog"); } catch (IOException) { }
congested = false;
network.Flush(); network.Flush();
Check(packets.SequenceEqual(new byte[] { 1, 2, 3 }), "congestion duplicated, reordered, or mutated a packet");
network.Dispose();
Check(!network.Send(new byte[] { 5 }), "closed spectator connection accepted data");
using var brokenNetwork = new PacketSendQueue(_ => throw new IOException("native socket failed"));
try { brokenNetwork.Send(new byte[] { 1 }); throw new Exception("native failure hidden"); } catch (IOException) { }
Console.WriteLine("PASS: congested spectator queue remains bounded, ordered, owned, and duplicate-free; native failures propagate");

var framed = new MessageFramer(8);
var received = new List<ArraySegment<byte>>();
byte[] wire = { 3, 0, 0, 0, 7, 8, 9, 1, 0, 0, 0, 10 };
foreach (byte value in wire) framed.Feed(new byte[] { value }, received.Add);
framed.Complete();
Check(received.Count == 2 && received[0].SequenceEqual(new byte[] { 7, 8, 9 }) && received[1].SequenceEqual(new byte[] { 10 }), "fragmented TCP header or payload corrupted");
foreach (int badLength in new[] { -1, 0, 9, int.MaxValue }) {
    try { new MessageFramer(8).Feed(BitConverter.GetBytes(badLength), _ => { }); throw new Exception("invalid message length accepted"); } catch (InvalidDataException) { }
}
var truncated = new MessageFramer(8);
truncated.Feed(new byte[] { 3, 0 }, _ => { });
try { truncated.Complete(); throw new Exception("partial header not reported"); } catch (EndOfStreamException) { }
Console.WriteLine("PASS: fragmented TCP framing, owned payloads, invalid size bounds, and partial disconnect errors");
await NetworkTests.Run();
