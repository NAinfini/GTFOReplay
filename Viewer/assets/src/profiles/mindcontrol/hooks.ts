import { Controls } from "@asl/vanilla/renderer/controls.js";
import { Player } from "@asl/vanilla/parser/player/player.js";
import { Factory } from "@asl/vanilla/library/factory.js";
import { Sphere, Vector3, Vector3Like } from "@esm/three";
import { ByteStream } from "@esm/@root/replay/stream.js";
import * as BitHelper from "@esm/@root/replay/bithelper.js";
import { enableDebugInput, getDebugValue } from "@asl/vanilla/ui/hud/debug.js";

enableDebugInput();

function Attack(id: number[] | undefined, slot: number) {
    if (id === undefined) return;

    const packet = new ByteStream();
    BitHelper.writeUShort(2, packet);

    BitHelper.writeByte(slot, packet);
    BitHelper.writeInt(id.length, packet);
    for (const i of id) {
        BitHelper.writeUShort(i, packet);
    }

    window.api.invoke("sendCustom", "MindControl", packet.bytes, packet.index);
}

function Move(id: number[] | undefined, pos: Vector3Like) {
    if (id === undefined) return;

    const packet = new ByteStream();
    BitHelper.writeUShort(0, packet);

    BitHelper.writeHalf(-pos.x, packet);
    BitHelper.writeHalf(pos.y, packet);
    BitHelper.writeHalf(pos.z, packet);

    BitHelper.writeInt(id.length, packet);
    for (const i of id) {
        BitHelper.writeUShort(i, packet);
    }

    window.api.invoke("sendCustom", "MindControl", packet.bytes, packet.index);
}

function AttackMove(id: number[] | undefined, pos: Vector3Like) {
    if (id === undefined) return;

    const packet = new ByteStream();
    BitHelper.writeUShort(3, packet);

    BitHelper.writeHalf(-pos.x, packet);
    BitHelper.writeHalf(pos.y, packet);
    BitHelper.writeHalf(pos.z, packet);

    BitHelper.writeInt(id.length, packet);
    for (const i of id) {
        BitHelper.writeUShort(i, packet);
    }

    window.api.invoke("sendCustom", "MindControl", packet.bytes, packet.index);
}

function Clear(id: number[] | undefined) {
    if (id === undefined) return;

    const packet = new ByteStream();
    BitHelper.writeUShort(1, packet);

    BitHelper.writeInt(id.length, packet);
    for (const i of id) {
        BitHelper.writeUShort(i, packet);
    }

    window.api.invoke("sendCustom", "MindControl", packet.bytes, packet.index);
}

function Kill(id: number[] | undefined) {
    if (id === undefined) return;

    const packet = new ByteStream();
    BitHelper.writeUShort(4, packet);

    BitHelper.writeInt(id.length, packet);
    for (const i of id) {
        BitHelper.writeUShort(i, packet);
    }

    window.api.invoke("sendCustom", "MindControl", packet.bytes, packet.index);
}

function SpawnEnemy(id: number, pos: Vector3Like) {
    const packet = new ByteStream();
    BitHelper.writeHalf(-pos.x, packet);
    BitHelper.writeHalf(pos.y, packet);
    BitHelper.writeHalf(pos.z, packet);
    BitHelper.writeUInt(id, packet);

    window.api.invoke("sendCustom", "MindControl.SpawnEnemy", packet.bytes, packet.index);
}

const clickSphere = new Sphere(undefined, 1);
let clicked1 = false;
let g_key = false;
let clicked2 = false;
let del_key = false;
let clicked3 = false;
Controls.hooks.add((self, snapshot, dt) => {
    const renderer = self.renderer;
    const camera = self.camera;

    self.raycaster.setFromCamera(self.mousePos, camera.root);

    if (self.mouseRight && !clicked1) {
        clicked1 = true;
    
        let player: Player | undefined = undefined;
        let point: Vector3 | undefined = undefined;
        let dist: number | undefined = undefined;
    
        // Click geometry
        const geometryGroups = renderer.getOrDefault("Maps", Factory("Map"));
        const group = geometryGroups.get(renderer.get("Dimension")!);
        if (group !== undefined) {
            for (const geom of group) {
                const intersects = self.raycaster.intersectObject(geom, false);
                if (intersects.length > 0) {
                    for (let i = 0; i < intersects.length; ++i) {
                        const p = intersects[i].point;
                        const d = camera.root.position.distanceToSquared(p);
                        if (point === undefined || dist === undefined || d < dist) {
                            dist = d;
                            point = p;
                        }
                    }
                }
            }
        }
    
        // Click player
        if (!self.shift) {
            const players = snapshot.getOrDefault("Vanilla.Player", Factory("Map"));
            for (const p of players.values()) {
                clickSphere.center.copy(p.position);
                clickSphere.center.setY(clickSphere.center.y + 1);
                if (self.raycaster.ray.intersectsSphere(clickSphere)) {
                    const d = camera.root.position.distanceToSquared(p.position);
                    if (player === undefined || dist === undefined || d < dist) {
                        dist = d;
                        player = p;
                    }
                }
            }
        }
    
        if (Controls.selected() !== undefined) {
            if (player !== undefined) {
                // console.log('Clicked on player: ', player.slot);
                Attack(Controls.selected(), player.slot);
            } else if (point !== undefined) {
                // console.log('Clicked point on mesh:', point);
                if (self.shift) {
                    Move(Controls.selected(), point);
                } else {
                    AttackMove(Controls.selected(), point);
                }
            }
        }
    } else if (!self.mouseRight) {
        clicked1 = false;
    }

    if (g_key === true && !clicked2) {
        clicked2 = true;

        let point: Vector3 | undefined = undefined;
        let dist: number | undefined = undefined;
    
        // Click geometry
        const geometryGroups = renderer.getOrDefault("Maps", Factory("Map"));
        const group = geometryGroups.get(renderer.get("Dimension")!);
        if (group !== undefined) {
            for (const geom of group) {
                const intersects = self.raycaster.intersectObject(geom, false);
                if (intersects.length > 0) {
                    for (let i = 0; i < intersects.length; ++i) {
                        const p = intersects[i].point;
                        const d = camera.root.position.distanceToSquared(p);
                        if (point === undefined || dist === undefined || d < dist) {
                            dist = d;
                            point = p;
                        }
                    }
                }
            }
        }

        if (point !== undefined) {
            try {
                const enemyId = parseInt(getDebugValue());
                SpawnEnemy(enemyId, point);
            } catch (err) {
                console.log(err);
            }
        }
    } else if (!g_key) {
        clicked2 = false;
    }

    if (del_key === true && !clicked3) {
        clicked3 = true;
        Kill(Controls.selected());
    } else if (!del_key) {
        clicked3 = false;
    }
});

Controls.keydownhooks.add((self, e) => {
    switch (e.keyCode) {
    case 49:
        e.preventDefault();
        if (e.altKey) {
            Attack(Controls.selected(), 0);
            return false;
        }
        break;
    case 50:
        e.preventDefault();
        if (e.altKey) {
            Attack(Controls.selected(), 1);
            return false;
        }
        break;
    case 51:
        e.preventDefault();
        if (e.altKey) {
            Attack(Controls.selected(), 2);
            return false;
        }
        break;
    case 52:
        e.preventDefault();
        if (e.altKey) {
            Attack(Controls.selected(), 3);
            return false;
        }
        break;
    case 67: // c key
        // to be removed
        if (Controls.selected() !== undefined) {
            Clear(Controls.selected());
            return false;
        }
        break;
    case 71:
        e.preventDefault();
        g_key = true;        
        break;
    case 46:
        e.preventDefault();
        del_key = true;    
        break;
    }
    return true;
});

Controls.keyuphooks.add((self, e) => {
    switch (e.keyCode) {
    case 71:
        e.preventDefault();
        g_key = false;    
        break;

    case 46:
        e.preventDefault();
        del_key = false;    
        break;
    }
    return true;
});