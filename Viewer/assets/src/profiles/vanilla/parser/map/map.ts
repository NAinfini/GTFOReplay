import * as BitHelper from "@esm/@root/replay/bithelper.js";
import { ModuleLoader } from "@esm/@root/replay/moduleloader.js";
import { Factory } from "../../library/factory.js";

ModuleLoader.registerASLModule(module.src);

export interface MapGeometry {
    vertices: Float32Array;
    indices: number[];
    themes: Uint8Array;
}

declare module "@esm/@root/replay/moduleloader.js" {
    namespace Typemap {
        interface Headers {
            "Vanilla.Map.Geometry": Map<number, MapGeometry[]>;
            "Vanilla.Map.Geometry.EOH": void;
        }
    }
}

for (const version of ["0.0.1", "0.0.2", "0.0.3"] as const) ModuleLoader.registerHeader("Vanilla.Map.Geometry", version, {
    parse: async (data, header) => {
        const dimension = await BitHelper.readByte(data);
        const nVertices = await BitHelper.readUShort(data);
        const nIndicies = await BitHelper.readUInt(data);
        if (nIndicies % 3 !== 0) throw new Error("Map geometry index count is not triangular.");
        const surface = {
            vertices: await BitHelper.readVectorArrayAsFloat32(data, nVertices),
            indices: await BitHelper.readUShortArray(data, nIndicies),
            themes: new Uint8Array(nIndicies / 3)
        };
        if (version !== "0.0.1") {
            for (let i = 0; i < surface.themes.length; ++i) {
                const theme = await BitHelper.readByte(data);
                if (theme > (version === "0.0.2" ? 10 : 12)) throw new Error(`Unsupported recorded floor theme ${theme}.`);
                surface.themes[i] = theme;
            }
        }

        // offset surface a little to deal with bad navmesh
        for (let i = 0; i < surface.vertices.length; i += 3) {
            surface.vertices[i + 1] -= 0.1;
        }

        const map = header.getOrDefault("Vanilla.Map.Geometry", Factory("Map"));
        if (!map.has(dimension)) map.set(dimension, []);
        map.get(dimension)!.push(surface);
    }
});

ModuleLoader.registerHeader("Vanilla.Map.Geometry.EOH", "0.0.1", {
    parse: async () => {
    }
});
