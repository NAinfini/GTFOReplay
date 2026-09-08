import { open } from "node:fs/promises";

/** Read only the recorder's adjacent report, with a limit before allocation. */
export async function readRecordingDiagnostics(source: string, sessionId?: string): Promise<Record<string, unknown> | undefined> {
    let file;
    try { file = await open(`${source}.diagnostics.json`, "r"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    try {
        const limit = 1024 * 1024;
        const bytes = Buffer.alloc(limit + 1);
        let size = 0;
        while (size < bytes.length) {
            const result = await file.read(bytes, size, bytes.length - size, size);
            if (!result.bytesRead) break;
            size += result.bytesRead;
        }
        if (size > limit) throw new Error("Recording diagnostics exceed 1 MiB.");
        const report = JSON.parse(bytes.subarray(0, size).toString("utf8"));
        if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Invalid recording diagnostics.");
        if (sessionId && report.SessionId !== sessionId) throw new Error("Recording diagnostics belong to a different session.");
        return report;
    } finally { await file.close(); }
}
