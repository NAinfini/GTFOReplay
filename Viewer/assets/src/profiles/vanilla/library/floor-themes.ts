// Serialized theme values match Vanilla.Map.FloorTheme, independent of game enums.
export const floorThemeIds = [
    "unknown", "ground-mining", "ground-storage", "ground-tech", "ground-service",
    "ground-gardens-lab", "ground-gardens-forest", "ground-desert", "ground-refinery",
    "ground-dig-site", "ground-jungle", "ground-tech-lab", "ground-gardens"
] as const;

export function groupFloorTriangles(indices: number[], themes: Uint8Array) {
    if (indices.length !== themes.length * 3) throw new Error("Floor theme count does not match the recorded triangles.");
    const groups = new Map<number, number[]>();
    for (let triangle = 0; triangle < themes.length; ++triangle) {
        const theme = themes[triangle];
        if (theme >= floorThemeIds.length) throw new Error(`Unsupported recorded floor theme ${theme}.`);
        let group = groups.get(theme);
        if (!group) groups.set(theme, group = []);
        group.push(indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]);
    }
    return groups;
}
