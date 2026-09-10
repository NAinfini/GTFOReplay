using System.Reflection;
using ReplayRecorder.API.Attributes;
using ReplayRecorder.IO;

internal static class RecordingStartTests {
    private static readonly List<string> paths = new();

    [ReplayOnStartRecording]
    private static void Started(string path) => paths.Add(path);

    public static void Run() {
        paths.Clear();
        var faults = new List<(string operation, Exception error)>();
        var method = typeof(RecordingStartTests).GetMethod(nameof(Started), BindingFlags.NonPublic | BindingFlags.Static)!;
        if (method.GetCustomAttribute<ReplayOnStartRecording>() == null)
            throw new Exception("Recording-start attribute is unavailable to plugin registration.");
        var registered = (Action<string>)method.CreateDelegate(typeof(Action<string>));
        Action<string> callbacks = _ => throw new IOException("Injected plugin error");
        callbacks += registered;
        callbacks += path => paths.Add(path);

        void Report(string operation, Exception error) => faults.Add((operation, error));
        CallbackGuard.Invoke<string>("Recording start", null, "unused.gtfo", Report);
        foreach (var path in new[] { "Replays/First run.gtfo", "Replays/Second run.gtfo" })
            CallbackGuard.Invoke("Recording start", callbacks, path, Report);

        if (!paths.SequenceEqual(new[] { "Replays/First run.gtfo", "Replays/First run.gtfo", "Replays/Second run.gtfo", "Replays/Second run.gtfo" }))
            throw new Exception("A subscriber lost the current recording path or ran more than once.");
        if (faults.Count != 2 || faults.Any(f => !f.operation.StartsWith("Recording start/") || f.error.StackTrace == null))
            throw new Exception("Recording-start callback faults lost their context or escaped the guard.");
        Console.WriteLine("PASS: recording-start attribute/delegate contract, per-session paths, optional subscribers, and callback fault reporting");
    }
}
