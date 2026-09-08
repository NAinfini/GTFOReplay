import { readScale } from "./transform.js";
import * as BitHelper from "@esm/@root/replay/bithelper.js";
import { ModuleLoader } from "@esm/@root/replay/moduleloader.js";
import * as Pod from "@esm/@root/replay/pod.js";
import { Factory } from "../../library/factory.js";
import { Identifier, IdentifierData } from "../identifier.js";

ModuleLoader.registerASLModule(module.src);

export interface ResourceContainer {
    id: number;
    dimension: number;
    position: Pod.Vector;
    rotation: Pod.Quaternion;
    scale?: Pod.Vector;
    lockTransform?: { position: Pod.Vector; rotation: Pod.Quaternion; scale: Pod.Vector };
    serialNumber: number;
    isLocker: boolean;
    consumableType: Identifier;
    registered: boolean;
    assignedLock?: LockType;
}

export interface ResourceContainerState {
    id: number;
    closed: boolean;
    lastCloseTime: number;
    lockType: LockType;
}

export const lockType = [
    "None",
    "Melee",
    "Hackable"
] as const;
export type LockType = typeof lockType[number];

declare module "@esm/@root/replay/moduleloader.js" {
    namespace Typemap {
        interface Headers {
            "Vanilla.Map.ResourceContainers": Map<number, ResourceContainer>;
        }

        interface Dynamics {
            "Vanilla.Map.ResourceContainers.State":  {
                parse: {
                    closed: boolean;
                    lockType?: LockType;
                };
                spawn: {
                    closed: boolean;
                    lockType: LockType;
                };
                despawn: void;
            };
        }

        interface Data {
            "Vanilla.Map.ResourceContainers.State": Map<number, ResourceContainerState>
        }
    }
}

ModuleLoader.registerHeader("Vanilla.Map.ResourceContainers", "0.0.1", {
    parse: async (data, header) => {
        const containers = header.getOrDefault("Vanilla.Map.ResourceContainers", Factory("Map"));
        const count = await BitHelper.readUShort(data);
        for (let i = 0; i < count; ++i) {
            const id = await BitHelper.readInt(data);
            containers.set(id, {
                id,
                dimension: await BitHelper.readByte(data),
                position: await BitHelper.readVector(data),
                rotation: await BitHelper.readHalfQuaternion(data),
                serialNumber: await BitHelper.readUShort(data),
                isLocker: await BitHelper.readBool(data),
                consumableType: Identifier.unknown,
                registered: true,
                assignedLock: undefined
            });
        }
    }
});
ModuleLoader.registerHeader("Vanilla.Map.ResourceContainers", "0.0.2", {
    parse: async (data, header, snapshot) => {
        const containers = header.getOrDefault("Vanilla.Map.ResourceContainers", Factory("Map"));
        const count = await BitHelper.readUShort(data);
        for (let i = 0; i < count; ++i) {
            const id = await BitHelper.readInt(data);
            containers.set(id, {
                id,
                dimension: await BitHelper.readByte(data),
                position: await BitHelper.readVector(data),
                rotation: await BitHelper.readHalfQuaternion(data),
                serialNumber: await BitHelper.readUShort(data),
                isLocker: await BitHelper.readBool(data),
                consumableType: await Identifier.parse(IdentifierData(snapshot), data),
                registered: await BitHelper.readBool(data),
                assignedLock: undefined
            });
        }
    }
});
for (const version of ["0.0.3", "0.0.4"]) ModuleLoader.registerHeader("Vanilla.Map.ResourceContainers", version, {
    parse: async (data, header, snapshot) => {
        const containers = header.getOrDefault("Vanilla.Map.ResourceContainers", Factory("Map"));
        const count = await BitHelper.readUShort(data);
        for (let i = 0; i < count; ++i) {
            const id = await BitHelper.readInt(data);
            containers.set(id, {
                id,
                dimension: await BitHelper.readByte(data),
                position: await BitHelper.readVector(data),
                rotation: await BitHelper.readHalfQuaternion(data),
                serialNumber: await BitHelper.readUShort(data),
                isLocker: await BitHelper.readBool(data),
                consumableType: await Identifier.parse(IdentifierData(snapshot), data),
                registered: await BitHelper.readBool(data),
                assignedLock: lockType[await BitHelper.readByte(data)],
                scale: version === "0.0.4" ? await readScale(data) : undefined,
                lockTransform: version === "0.0.4" && await BitHelper.readBool(data) ? {
                    position: await BitHelper.readVector(data),
                    rotation: await BitHelper.readHalfQuaternion(data),
                    scale: await readScale(data)
                } : undefined
            });
        }
    }
});

for (const version of ["0.0.1", "0.0.2"]) ModuleLoader.registerDynamic("Vanilla.Map.ResourceContainers.State", version, {
    main: {
        parse: async (data) => {
            return {
                closed: await BitHelper.readBool(data),
                lockType: version === "0.0.2" ? lockType[await BitHelper.readByte(data)] : undefined
            };
        }, 
        exec: (id, data, snapshot) => {
            const resourceContainers = snapshot.getOrDefault("Vanilla.Map.ResourceContainers.State", Factory("Map"));
    
            if (!resourceContainers.has(id)) throw new Error(`Resource container of id '${id}' was not found.`);
            const resourceContainer = resourceContainers.get(id)!;
            if (data.lockType !== undefined) resourceContainer.lockType = data.lockType;
            if (resourceContainer.closed !== data.closed) {
                resourceContainer.lastCloseTime = snapshot.time();
                resourceContainer.closed = data.closed;
            }
        }
    },
    spawn: {
        parse: async (data) => {
            return {
                closed: await BitHelper.readBool(data),
                lockType: lockType[await BitHelper.readByte(data)]
            };
        },
        exec: (id, data, snapshot) => {
            const resourceContainers = snapshot.getOrDefault("Vanilla.Map.ResourceContainers.State", Factory("Map"));

            if (resourceContainers.has(id)) throw new Error(`Resource container of id '${id}' already exists.`);
            resourceContainers.set(id, { 
                id, ...data,
                lastCloseTime: -Infinity
            });
        }
    },
    despawn: {
        parse: async () => {
        }, 
        exec: (id, data, snapshot) => {
            const resourceContainers = snapshot.getOrDefault("Vanilla.Map.ResourceContainers.State", Factory("Map"));

            if (!resourceContainers.has(id)) throw new Error(`Resource container of id '${id}' did not exist.`);
            resourceContainers.delete(id);
        }
    }
});