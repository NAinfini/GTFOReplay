import { createRoot } from "react-dom/client";
import type { PlaybackAdapter } from "../../assets/src/main/interface";
import { PlaybackWorkspace } from "./features/playback/PlaybackWorkspace";
import "./style.css";
export { t, ui } from "./i18n";
export { mountLibrary } from "./features/library/Library";
export { notify } from "./components/feedback/overlays";
export { mountSelect, mountSwitch, mountLanguage, mountConnection } from "./components/profile-controls";

export function mountControls(element: HTMLElement, adapter: PlaybackAdapter) {
    const root = createRoot(element);
    root.render(<PlaybackWorkspace adapter={adapter} />);
    return () => root.unmount();
}
