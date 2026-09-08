import { html, Mutable } from "@/rhu/html.js";
import { advanceTime } from "../../../../../replay/transport.js";
import { always, Signal, signal } from "@/rhu/signal.js";
import { Style } from "@/rhu/style.js";
import { ReplayApi } from "../../../../../replay/moduleloader.js";
import { Renderer } from "../../../../../replay/renderer.js";
import { Replay, Snapshot } from "../../../../../replay/replay.js";
import { ASL_VM } from "../../../../../replay/vm.js";
import * as icons from "../../../../global/components/atoms/icons/index.js";

const style = Style(({ css }) => {
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

    const logs = css.class`
    position: absolute;
    top: 0px;
    width: 100%;
    color: white;
    background-color: red;
    z-index: 1000;
    `;

    const log = css.class`
    padding: 3px 7px;
    display: flex;
    `;

    const logText = css.class`
    cursor: pointer;
    `;
    css`
    ${logText}:hover {
        text-decoration: underline;
    }
    `;

    const cross = css.class`
    padding: 0 3px;
    color: white;
    `;

    return {
        canvas,
        logs,
        log,
        logText,
        cross
    };
});

export const View = () => {
    interface View {
        ready(): void;
        update(): void;
        refresh(): void;
        resize(): void;
        
        addLog(err: { message: string, verbose: string, type: undefined | "warning" | "error" }): void;
        clearLogs(): void;
        diagnosticLogs(): readonly { message: string; verbose: string; type?: "warning" | "error"; time: number }[];

        readonly renderer: Renderer;
        readonly replay: Signal<Replay | undefined>;
        readonly time: Signal<number>;
        readonly timescale: Signal<number>; 
        readonly pause: Signal<boolean>;
        readonly frameRate: Signal<number>;
        readonly live: Signal<boolean>;
        readonly length: Signal<number>;
        readonly snapshot: Snapshot | undefined;
        readonly api: Signal<ReplayApi | undefined>;
        readonly canvas: HTMLCanvasElement;
        lerp: number;
    }
    interface Private {
        readonly loadingText: HTMLDivElement;
        reset(): void;

        prevTime: number;
    }
    
    const history: { message: string; verbose: string; type?: "warning" | "error"; time: number }[] = [];
    const logs = signal<{ message: string, verbose: string, type: undefined | "warning" | "error" }[]>([], always);
    const logList = html.map(logs, undefined, (kv, el?: html<{message: Signal<string>; text: HTMLSpanElement; close: HTMLButtonElement, index: number}>) => {
        const [k,v] = kv;
        
        if (el === undefined) {
            el = html`
            <div class="${style.log}" style="display:${k < 3 ? "block" : "none"}; background-color: ${v.type == "warning" ? "orange" : "red"};">
                <span m-id="text" class="${style.logText}">${html.bind(signal(""), "message")}</span>
                <span style="flex: 1;"></span>
                <button m-id="close" class="${style.cross}">${icons.cross()}</button>
            </div>
            `;

            el.text.addEventListener("click", () => {
                window.api.openDevTools();
            });

            el.close.addEventListener("click", () => {
                if (el?.index === undefined) return;
                const e = logs();
                e.splice(el.index, 1);
                logs(e);
            });
        }

        el.index = k;
        el.message(v.message);

        return el;
    });

    const dom = html<Mutable<Private & View>>/**//*html*/`
        <div m-id="loadingText" role="status" style="position:absolute;left:16px;top:16px;z-index:5;color:white;background:#181b22;padding:8px;pointer-events:none;"></div>
        <div class="${style.logs}">${logList}</div>
        <canvas m-id="canvas" class="${style.canvas}" tabindex="-1"></canvas>
        `;
    html(dom).box();
    
    dom.replay = signal<Replay | undefined>(undefined);
    dom.renderer = new Renderer(dom.canvas);

    dom.time = signal(0);
    dom.timescale = signal(1);
    dom.pause = signal(false);
    dom.frameRate = signal(0);
    dom.live = signal(false);
    dom.length = signal(0);
    dom.lerp = 20;
    dom.snapshot = undefined;
    dom.api = signal<ReplayApi | undefined>(undefined);

    dom.resize = function resize() {
        const computed = getComputedStyle(this.canvas);
        const width = parseInt(computed.width);
        const height = parseInt(computed.height);
        this.renderer.resize(width, height);
    };

    dom.refresh = function refresh() {
        this.renderer.refresh(this.canvas, this.replay());
    };

    dom.ready = function ready() {
        const replay = this.replay();
        if (replay === undefined) throw new Error("Received 'eoh', but no replay was present.");
        
        this.reset();

        try {
            this.renderer.init(replay);
        } catch (e) {
            replay.error = e instanceof Error ? e : new Error(String(e));
            this.pause(true);
            this.addLog({ message: String(e), verbose: ASL_VM.verboseError(e), type: "error" });
        }

        requestAnimationFrame(() => this.canvas.focus());
    };

    dom.reset = function reset() {
        this.snapshot = undefined;
        this.api(undefined);
        this.time(0);
        this.timescale(1);     
        this.length(0);
        this.pause(false);  
    };

    let pendingSnapshot = false;
    dom.update = function update() {
        if (this.time() < 0) this.time(0);
        
        const now = Date.now();
        const dt = now - this.prevTime;
        this.prevTime = now;
        this.frameRate(1000 / dt);
        
        const replay = this.replay();
        if (replay !== undefined) {
            try {
                this.length(replay.length());

                this.loadingText.textContent = replay.loading ? window.ReplayInterface.t("loadingSegment") : "";
                this.loadingText.hidden = !this.loadingText.textContent;
                if (!this.pause() && !replay.loading) {
                    if (this.live()) {
                        const time = this.time();
                        this.time(time + (this.length() - time) * dt / 1000 * this.lerp);
                    } else {
                        this.time(advanceTime(this.time(), dt * this.timescale(), replay.loadedLength(), replay.looping ? replay.range : undefined));
                        if (!replay.looping && replay.complete && (this.time() >= this.length() || this.time() <= replay.startTime && this.timescale() < 0)) this.pause(true);
                    }
                }
                const time = this.time();

                if (!pendingSnapshot && !replay.error && this.snapshot?.time !== time) {
                    pendingSnapshot = true;
                    void replay.getSnapshot(time).then(snapshot => {
                        if (this.replay() === replay && Math.abs(this.time() - time) < 500) this.snapshot = snapshot;
                    }).catch((error: unknown) => {
                        if (this.replay() !== replay) return;
                        replay.error = error instanceof Error ? error : new Error(String(error));
                        this.pause(true);
                        this.addLog({ message: String(error), verbose: String(error), type: "error" });
                    }).finally(() => { pendingSnapshot = false; });
                }

                if (this.snapshot !== undefined && !replay.error) {
                    const api = replay.api(this.snapshot);
                    this.api(api);
                    this.renderer.render(dt / 1000, api);
                }
            } catch (e) {
                const verbose = ASL_VM.verboseError(e);
                replay.error = e instanceof Error ? e : new Error(String(e));
                this.pause(true);
                this.addLog({ message: String(e), verbose, type: "error" });
                console.error(verbose);
            }
        }

        requestAnimationFrame(() => this.update());
    };

    window.addEventListener("resize", () => {
        dom.resize();
    });
    dom.canvas.addEventListener("mount", () => dom.resize());

    dom.time.guard = (time) => {
        const replay = dom.replay();
        return Math.clamp(time, replay?.startTime ?? 0, replay !== undefined ? replay.loadedLength() : 0);
    };
    
    dom.diagnosticLogs = () => history.slice();
    dom.addLog = (log) => {
        history.push({ ...log, time: dom.time() });
        if (history.length > 500) history.shift();
        const l = logs();
        l.unshift(log);
        if (l.length > 50) l.length = 50;
        logs(l);
    };

    dom.clearLogs = () => {
        history.length = 0;
        logs([]);
    };
    
    dom.update();

    return dom as html<View>;
};
