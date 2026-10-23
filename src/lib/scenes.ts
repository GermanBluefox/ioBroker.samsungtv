/*
 * Scenes: a named sequence of keys, apps, inputs and pauses the user configures in the settings, e.g.
 * `HOME, YOUTUBE, WAIT 3000, OK` - open YouTube and confirm the account selection.
 *
 * A step is
 * - a key: a key of `TV_KEYS` (`HOME`, `SELECT`, `BACK`, `NUMBER_1`, ...), a short alias (`OK`, `ENTER`,
 *   `VOLUP`, `0`...`9`) or a Samsung key code (`KEY_HOME`)
 * - an app: a key of `TV_APPS` (`YOUTUBE`, `NETFLIX`, ...)
 * - an input: a key of `TV_INPUTS` (`HDMI2`, `TV`, ...)
 * - a pause: `WAIT 2000` (milliseconds)
 * separated by commas, semicolons or new lines; case and spaces do not matter.
 */
import { TV_APPS, TV_INPUTS, TV_KEY_CODES } from './tvValues';

/** Short names a user is likely to type, in addition to the keys of `TV_KEYS` */
const KEY_ALIASES: Readonly<Record<string, string>> = {
    OK: 'KEY_ENTER',
    ENTER: 'KEY_ENTER',
    RETURN: 'KEY_RETURN',
    SOURCE: 'KEY_SOURCE',
    POWER: 'KEY_POWER',
    MUTE: 'KEY_MUTE',
    VOLUP: 'KEY_VOLUP',
    VOLUME_UP: 'KEY_VOLUP',
    VOLDOWN: 'KEY_VOLDOWN',
    VOLUME_DOWN: 'KEY_VOLDOWN',
    CHUP: 'KEY_CHUP',
    CHDOWN: 'KEY_CHDOWN',
    FF: 'KEY_FF',
    TOOLS: 'KEY_TOOLS',
};

/** Longest pause a step may ask for, in ms */
const MAX_WAIT = 60_000;

export type SceneStep =
    | { type: 'key'; key: string }
    | { type: 'app'; app: string }
    | { type: 'input'; input: string }
    | { type: 'wait'; ms: number };

/** One row of the scene table of the settings */
export interface SceneConfig {
    /** Name of the scene, also its state ID `<tv>.scenes.<name>` */
    name: string;
    /** Name of the TV (its object ID) the scene belongs to; empty for all TVs */
    device?: string;
    steps: string;
    /** Pause between two steps in ms */
    delay?: number | string;
}

/**
 * Turn the steps of a scene into a list of actions.
 *
 * @param steps the text of the scene, e.g. `HOME, YOUTUBE, WAIT 3000, OK`
 * @throws {Error} naming the first step that is not understood
 */
export function parseScene(steps: string): SceneStep[] {
    const result: SceneStep[] = [];
    for (const raw of String(steps ?? '').split(/[,\n;]/)) {
        const token = raw.trim().toUpperCase().replace(/\s+/g, ' ');
        if (!token) {
            continue;
        }
        const wait = /^(?:WAIT|PAUSE|SLEEP) ?(\d+)$/.exec(token);
        if (wait) {
            result.push({ type: 'wait', ms: Math.min(Number(wait[1]), MAX_WAIT) });
            continue;
        }
        const name = token.replace(/ /g, '_');
        if (/^KEY_[A-Z0-9_]+$/.test(name)) {
            result.push({ type: 'key', key: name });
        } else if (TV_KEY_CODES[name]) {
            result.push({ type: 'key', key: TV_KEY_CODES[name] });
        } else if (KEY_ALIASES[name]) {
            result.push({ type: 'key', key: KEY_ALIASES[name] });
        } else if (/^\d$/.test(name)) {
            result.push({ type: 'key', key: `KEY_${name}` });
        } else if (TV_APPS[name]) {
            result.push({ type: 'app', app: name });
        } else if (TV_INPUTS[name]) {
            result.push({ type: 'input', input: name });
        } else {
            throw new Error(`Unknown step "${raw.trim()}"`);
        }
    }
    return result;
}

/** State ID of a scene below `<tv>.scenes`, with only the characters ioBroker allows in an ID */
export function sceneId(name: string): string {
    return String(name ?? '')
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Pause between two steps in ms, 500 if the setting is missing or invalid */
export function sceneDelay(delay: unknown): number {
    const value = Number(delay);
    return Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_WAIT) : 500;
}

/** What running a scene needs from the adapter */
export interface SceneRunner {
    sendKey: (key: string) => Promise<void>;
    launchApp: (app: string) => Promise<void>;
    selectInput: (input: string) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
}

/**
 * Run the steps one after the other, with `delay` ms between two of them.
 *
 * @param steps parsed steps
 * @param delay pause between two steps in ms
 * @param runner the actions of the adapter
 */
export async function runScene(steps: SceneStep[], delay: number, runner: SceneRunner): Promise<void> {
    for (const [i, step] of steps.entries()) {
        if (i > 0 && delay > 0) {
            await runner.sleep(delay);
        }
        if (step.type === 'key') {
            await runner.sendKey(step.key);
        } else if (step.type === 'app') {
            await runner.launchApp(step.app);
        } else if (step.type === 'input') {
            await runner.selectInput(step.input);
        } else {
            await runner.sleep(step.ms);
        }
    }
}
