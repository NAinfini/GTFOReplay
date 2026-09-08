const { test } = require("node:test");
const assert = require("node:assert/strict");
test("display time uses whole seconds without changing source timestamps", async () => {
    const { formatTime } = await import("../../Viewer/interface/src/time.ts");
    assert.equal(formatTime(3723456), "1:02:03");
    assert.equal(formatTime(59999), "00:59");
    assert.equal(formatTime(60000), "01:00");
    assert.equal(formatTime(-1), "00:00");
});
