import type { IndexedEvent } from '../../../main/interface.js';

type Point = { position: { x: number; y: number; z: number }; dimension: number };
type Player = Point & { id: number; slot: number; nickname: string };
export type EventFocus = Point & { key: string; type: 'player' | 'enemy' | 'point'; id?: number; slot?: number; name?: string };

export const eventLeadIn = (time: number, start: number) => Math.max(start, time - 3000);

/** Participant namespaces are authoritative; never guess whether an ID is a player or enemy. */
export function resolveEventFocus(event: IndexedEvent, players: ReadonlyMap<number, Player>, enemies: ReadonlyMap<number, Point>): EventFocus | undefined {
    const participants = [...(event.participants ?? [])];
    // Revives, packs and damage concern the recipient, not whoever initiated them.
    participants.sort((a, b) => Number(b.role === 'target') - Number(a.role === 'target'));
    for (const person of participants) {
        if (typeof person.id !== 'number') continue;
        if (person.type === 'player') {
            const player = players.get(person.id);
            if (player) return { ...player, key: `player:${player.id}`, type: 'player', name: player.nickname };
        } else if (person.type === 'enemy') {
            const enemy = enemies.get(person.id);
            if (enemy) return { ...enemy, key: `enemy:${person.id}`, type: 'enemy', id: person.id, name: person.name };
        }
    }
    const data = event.data as Partial<Point> | undefined;
    if (data?.position && Number.isFinite(data.dimension) && [data.position.x, data.position.y, data.position.z].every(Number.isFinite)) {
        return { position: data.position, dimension: data.dimension!, key: `point:${event.id}`, type: 'point' };
    }
}

function priority(event: IndexedEvent) {
    switch (event.kind) {
    case 'Vanilla.Player.Animation.Downed': return 100;
    case 'Vanilla.Enemy.Animation.PouncerGrab': return 95;
    case 'Vanilla.Enemy.Animation.ScoutScream': return (event.data as { start?: boolean })?.start === false ? 0 : 90;
    case 'Vanilla.StatTracker.Revive':
    case 'Vanilla.Player.Animation.Revive': return 80;
    case 'ReplayRecorder.Marker': return 70;
    case 'Vanilla.Enemy.Alert': return 30;
    default: return 0;
    }
}

/** Real viewing seconds govern shot length, independently of replay speed. */
export class EventDirector {
    private previous?: number;
    private held = Infinity;
    private subject?: string;
    private importance = 0;
    private pending?: { event: IndexedEvent; importance: number };

    reset(time?: number) { this.previous = time; this.pending = undefined; this.held = Infinity; this.subject = undefined; this.importance = 0; }

    update(events: readonly IndexedEvent[], time: number, dt: number, speed: number, playing: boolean, resolve: (event: IndexedEvent) => EventFocus | undefined) {
        const previous = this.previous;
        this.previous = time;
        if (!playing || speed <= 0 || previous === undefined || time < previous || time - previous > Math.max(500, dt * speed * 1000 + 250)) {
            this.pending = undefined;
            return;
        }
        if (time === previous) return;
        this.held += dt;
        if (this.pending && time - this.pending.event.time > 3000) this.pending = undefined;
        // Binary search avoids rescanning an entire recording every rendered frame.
        let low = 0, high = events.length;
        while (low < high) { const mid = (low + high) >>> 1; if (events[mid].time <= previous) low = mid + 1; else high = mid; }
        for (let i = low; i < events.length && events[i].time <= time; ++i) {
            const event = events[i], importance = priority(event);
            if (importance && (!this.pending || importance >= this.pending.importance) && resolve(event)) this.pending = { event, importance };
        }
        const pending = this.pending;
        if (!pending) return;
        if (time - pending.event.time > 3000) { this.pending = undefined; return; }
        const focus = resolve(pending.event);
        if (!focus) { this.pending = undefined; return; }
        if (focus.key === this.subject) {
            if (pending.importance >= 70) this.held = 0;
            this.importance = Math.max(this.importance, pending.importance);
            this.pending = undefined;
            return;
        }
        // A more urgent incident may interrupt after 3s; otherwise hold at least 6s.
        if (this.held < 6 && !(this.held >= 3 && pending.importance > this.importance)) return;
        this.pending = undefined; this.held = 0; this.subject = focus.key; this.importance = pending.importance;
        return focus;
    }
}
