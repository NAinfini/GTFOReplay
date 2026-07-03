import { html, Mutable } from "@/rhu/html.js";
import { Style } from "@/rhu/style.js";
import { DataStore } from "../../../replay/datastore.js";
import { Parser } from "../../../replay/parser.js";
import { FileHandle } from "../../../replay/stream.js";
import { app } from "../../app.js";
import { View } from "./components/view/index.js";

const style = Style(({ css }) => {
    const wrapper = css.class`
    width: 100%;
    height: 100%;
    position: relative;
    `;

    const canvas = css.class`
    display: block;
    width: 100%;
    height: 100%;
    `;
    css`
    ${canvas}:focus {
        outline: none;
    }
    `;

    return {
        wrapper,
        canvas
    };
});

const persistent = {};

let fileIdx = 0;
const files: string[] = [
    // "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\B-C1 2026-04-19 17-58.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\B-C1 2026-04-19 18-10.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1A1 2026-06-09 21-21.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1A1 2026-06-09 21-25.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1A1 2026-06-09 21-33.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1C1 2026-03-08 17-47.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1C1 2026-06-07 07-08.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1C1 2026-06-07 07-19.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1C1 2026-06-10 18-56.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1C2 2026-03-08 18-24.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1C2 2026-06-18 04-37.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r1D1 2026-03-08 19-18.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-05 04-26.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-05 11-06.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-06 16-10",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-06 16-21.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-06 21-53.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-06 22-10",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-03-07 00-01.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-06-07 11-14.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-06-07 11-15.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-06-07 11-37.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-06-15 20-18.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-06-19 08-29.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r2D2 2026-06-19 08-42.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r3C1 2026-03-07 11-38.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r3C1 2026-03-07 12-01.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r3D1 2026-03-07 12-23.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r3D1 2026-03-07 12-30.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4A2 2026-06-18 06-45.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4B2 2026-06-20 02-46.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4B3 2026-06-20 03-26.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4C3 2026-06-07 12-39.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4C3 2026-06-07 12-48.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4D1 2026-06-16 02-51.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4E1 2026-06-17 07-09.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4E1 2026-06-17 08-05.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4E1 2026-06-18 22-55.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4E1 2026-06-19 00-10.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r4E1 2026-06-19 00-19.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r5B3 2026-06-10 22-01.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r5B3 2026-06-20 01-16.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6A1 2026-03-06 22-44.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6AX 2026-06-18 05-07.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6B1 2026-03-06 22-53.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6B2 2026-03-06 23-08.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6BX 2026-06-18 05-35.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6C1 2026-03-06 23-33.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6C2 2026-03-08 01-32.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r6D2 2026-06-06 09-43.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r7C1 2026-06-19 01-31.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r7D2 2026-06-19 02-08.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8A2 2026-06-10 22-42.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8A2 2026-06-10 22-46.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8A2 2026-06-10 23-01.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B1 2026-06-10 23-18.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B1 2026-06-10 23-26.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B1 2026-06-10 23-31.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B1 2026-06-10 23-40.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B2 2026-06-11 00-03.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B2 2026-06-11 00-05.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8B3 2026-06-11 00-39.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 17-17.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 17-19.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 17-40.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 17-54.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 18-09.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 18-23.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-05 18-40.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-06 01-15.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-06 02-14.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 18-35.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 18-44.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 18-57.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 21-12.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 21-41.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 21-45.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 22-11.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 22-57.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 23-11.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-03-07 23-32.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-06 08-57.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-06 08-59.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-06 09-01.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-06 09-04.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-10 17-20.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-10 17-44.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-10 17-55.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-10 18-00.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-10 18-16.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-10 18-24.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-11 19-51.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-11 19-56.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-11 19-59.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-11 20-02.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-11 20-23.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 04-12.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 04-18.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 04-32.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 04-50.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 04-55.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 06-40.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 20-09.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-15 20-13.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-17 05-48.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-17 05-51.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-17 05-59.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-17 06-29.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-17 06-50.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-18 07-19.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-18 07-37.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-18 07-39.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 02-26.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 02-28.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 02-55.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 03-14.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 03-24.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 03-32.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 03-43.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-19 08-25.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-20 08-05.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-20 08-28.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-20 08-50.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-20 09-17.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-20 09-21.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\r8E2 2026-06-20 09-24.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\rB-A1 2026-04-12 09-17.compressed",
    "C:\\Users\\randomuserhi\\Downloads\\TT22_Moth Replays\\rB-A1 2026-04-12 09-41.compressed",
];

export const Player = () => {
    interface Player {
        refresh: () => void;
        open: (path?: string) => Promise<void>;
        link: (steamId: string) => Promise<void>;
        unlink: () => Promise<void>;
        close: () => void; 

        path?: string;
        readonly parser?: Parser;
    }
    interface Private {
        render: () => void;

        readonly wrapper: HTMLDivElement;
        readonly view: html<typeof View>;
    }
    
    const view = View();

    const dom = html<Mutable<Private & Player>>/**//*html*/`
        <div m-id="wrapper" class="${style.wrapper}">
            ${view}
        </div>
        `;
    html(dom).box();

    dom.view = view;
    dom.path = undefined;
    dom.parser = undefined;

    dom.render = function render() {
        const frag = new DocumentFragment();
        domFunc(frag, this.view);
        this.wrapper.replaceChildren(frag);
    };

    dom.refresh = function refresh() {
        this.render();
        this.view.refresh();
    };

    dom.open = async function open(path?: string) {
        this.path = path;
        const file: FileHandle = {
            path, finite: true // TODO(randomuserhi): Set back to false
        };
        if (path !== undefined) {
            // Open file if path is provided, otherwise assume live view
            await window.api.invoke("open", file);
        }
        if (this.parser !== undefined) this.parser.terminate();
        this.parser = new Parser();
        this.view.replay(undefined);

        this.parser.addEventListener("eoh", () => {
            this.view.ready();
            app.load(this);
        });
        this.parser.addEventListener("end", () => {
            window.api.send("close");
            onParserFinish(this.view, persistent, file.path!);

            setTimeout(() => {
                fileIdx += 1;
                console.log(files[fileIdx]);
                if (fileIdx < files.length) dom.open(files[fileIdx]);
                else console.log((persistent as any).temp);
            }, 2500);
        });
        this.parser.addEventListener("error", ((err: { message: string, verbose: string, type: undefined | "warning" | "error" }) => {
            if (err.type == "warning") {
                console.warn(err.verbose);
            } else {
                console.error(err.verbose);
            }
            this.view.addLog(err);
        }) as any);

        if (path !== undefined) {
            this.unlink(); // Unlink if loading a regular file.
            this.view.live(false);
        } else {
            this.view.live(true); // Acknowledge awaiting for bytes from game
        }

        // Clear state on fresh replay load
        DataStore.clear();

        // Clear errors
        this.view.clearLogs();

        this.view.replay(await this.parser.parse(file));
    };

    dom.link = async function link(steamId: string) {
        await window.api.invoke("unlink");

        const resp: string | undefined = await window.api.invoke("link", "127.0.0.1", 56759);
        if (resp !== undefined) {
            // TODO(randomuserhi)
            console.error(`Failed to link: ${resp}`);
            return;
        }
        window.api.invoke("goLive", BigInt(steamId));
    };

    dom.unlink = async function unlink() {
        await window.api.invoke("unlink");

        app.nav.linkedStatus("Not Linked");
        app.nav.linkInput.value = "";
        app.nav.linkInput.disabled = false;
        app.nav.linkInput.style.display = "block";
    };

    dom.close = function close() {
        this.view.renderer.dispose();
        this.view.replay(undefined);
        this.parser?.terminate();
        this.parser = undefined;
        window.api.send("unlink");

        app.nav.linkedStatus("Not Linked");
        app.nav.linkInput.value = "";
        app.nav.linkInput.disabled = false;
        app.nav.linkInput.style.display = "block";

        window.api.send("close");
    };

    (window as any).player = dom;

    return dom as html<Player>;
};

let domFunc: (doc: DocumentFragment, view: html<typeof View>) => void = (doc, view) => {
    doc.append(...view);
};

let onParserFinish: (view: html<typeof View>, persistent: any, path: string) => void = () => {};

export function OnParserFinish(func: (view: html<typeof View>, persistent: any, path: string) => void) {
    onParserFinish = func;
}

export function Render(func: (doc: DocumentFragment, view: html<typeof View>) => void) {
    domFunc = func;
}
