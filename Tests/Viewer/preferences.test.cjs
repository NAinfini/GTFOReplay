const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { ReplayPreferences } = require("../../Viewer/electron/build/replay/preferences.cjs");

test("bookmark writes serialize, preserve Unicode, and survive reopening", async () => {
    const directory = path.resolve(__dirname, "../../artifacts/tests/preferences");
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, "notes-" + Date.now() + ".json");
    const store = new ReplayPreferences(file);
    const note = { id: "note-one", time: 123456, label: "\u4f24\u5bb3\u65f6\u95f4\u4e0d\u4e00\u81f4", note: "\u8fd9\u91cc\u6bd4\u6e38\u620f\u4e2d\u665a\u4e86\u4e00\u70b9。" };
    await Promise.all([store.saveBookmarks("session:first", [note]), store.saveBookmarks("session:second", [{ ...note, id: "note-two" }])]);
    const reopened = new ReplayPreferences(file);
    assert.deepEqual(await reopened.bookmarks("session:first"), [note]);
    assert.equal((await reopened.bookmarks("session:second"))[0].id, "note-two");
    assert.throws(() => store.saveBookmarks("session:first", [{ ...note, time: -1 }]));
    assert.throws(() => store.saveBookmarks("session:first", [note, note]));
    const copy = await store.bookmarks("session:first"); copy[0].note = "modified";
    assert.equal((await store.bookmarks("session:first"))[0].note, note.note);
    await fs.unlink(file);
});
