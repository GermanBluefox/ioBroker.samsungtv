/*
 * YouTube on the TV over the YouTube Lounge API - the way "Link with TV" of the YouTube app works.
 *
 * Unlike the rest of the adapter this goes over Google's servers (https://www.youtube.com/api/lounge): The Frame
 * 2022 rejects a DIAL start with parameters (403), and the websocket app launch does nothing. Checked in the
 * prototype on that TV: a video and the uploads of a channel played.
 *
 * Protocol after pyytlounge (FabioGNR/pyytlounge):
 *   1. screenId from the local DIAL description of the YouTube app (http://<tv>:8080/ws/app/YouTube)
 *   2. POST pairing/get_lounge_token_batch -> loungeToken
 *   3. POST bc/bind (count=0)               -> SID + gsessionid
 *   4. POST bc/bind with req0__sc=<command> -> e.g. setPlaylist
 *
 * screenId and loungeToken are credentials and are never logged.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const API = 'https://www.youtube.com/api/lounge';
const TIMEOUT = 10_000;

/** What to play, from a video ID, a playlist ID, a channel ID or a YouTube URL */
export type YouTubeTarget =
    | { kind: 'video'; videoId: string }
    | { kind: 'playlist'; listId: string; videoId?: string }
    | { kind: 'channel'; channelId: string }
    | { kind: 'command'; command: 'play' | 'pause' | 'next' | 'previous' };

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const LIST_ID = /^(?:PL|UU|LL|FL|OL|RD)[\w-]{10,}$/;

/**
 * Understand what the user wants to play.
 *
 * @param input `dQw4w9WgXcQ`, `PL…`, `UC…`, a youtube.com / youtu.be URL, or `play`, `pause`, `next`, `previous`
 * @throws {Error} if it is none of these; handles (`@name`) cannot be resolved without the YouTube Data API
 */
export function parseYouTubeTarget(input: string): YouTubeTarget {
    const text = String(input ?? '').trim();
    const command = text.toLowerCase();
    if (command === 'play' || command === 'pause' || command === 'next' || command === 'previous') {
        return { kind: 'command', command };
    }
    let url: URL | null = null;
    try {
        url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        url = null;
    }
    if (url && /(^|\.)(youtube\.com|youtu\.be)$/i.test(url.hostname)) {
        const list = url.searchParams.get('list');
        const video = url.hostname.endsWith('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
        const channel = /^\/channel\/(UC[\w-]{22})/.exec(url.pathname)?.[1];
        if (list && LIST_ID.test(list)) {
            return video && VIDEO_ID.test(video)
                ? { kind: 'playlist', listId: list, videoId: video }
                : { kind: 'playlist', listId: list };
        }
        if (video && VIDEO_ID.test(video)) {
            return { kind: 'video', videoId: video };
        }
        if (channel) {
            return { kind: 'channel', channelId: channel };
        }
        const shorts = /^\/(?:shorts|live)\/([\w-]{11})/.exec(url.pathname)?.[1];
        if (shorts) {
            return { kind: 'video', videoId: shorts };
        }
    }
    if (CHANNEL_ID.test(text)) {
        return { kind: 'channel', channelId: text };
    }
    if (LIST_ID.test(text)) {
        return { kind: 'playlist', listId: text };
    }
    if (VIDEO_ID.test(text)) {
        return { kind: 'video', videoId: text };
    }
    throw new Error(`Not a YouTube video, playlist or channel: "${text}"`);
}

/** The uploads playlist of a channel: `UC…` -> `UU…` */
export function uploadsPlaylistId(channelId: string): string {
    return `UU${channelId.slice(2)}`;
}

/** Split the chunked answer of bc/bind (`<length>\n<json>\n…`) into events `[id, [type, ...args]]` */
export function parseBindChunks(text: string): [number, [string, ...unknown[]]][] {
    const events: [number, [string, ...unknown[]]][] = [];
    const lines = String(text).split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (!/^\d+$/.test(lines[i]!.trim())) {
            continue;
        }
        const length = Number(lines[i]!.trim());
        let chunk = '';
        while (i + 1 < lines.length && chunk.length < length - 1) {
            chunk += (chunk ? '\n' : '') + lines[++i];
        }
        try {
            events.push(...(JSON.parse(chunk) as [number, [string, ...unknown[]]][]));
        } catch {
            // incomplete chunk
        }
    }
    return events;
}

/**
 * Read the screenId of the YouTube app from the local DIAL description of the TV.
 *
 * @param ip address of the TV
 * @returns the screenId, `null` if the app does not report one
 */
export function getScreenIdFromDial(ip: string): Promise<string | null> {
    return new Promise(resolve => {
        const req = http.get({ host: ip, port: 8080, path: '/ws/app/YouTube', timeout: 5000, agent: false }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => (body += chunk));
            res.on('end', () =>
                resolve(res.statusCode === 200 ? (/<screenId>([^<]+)<\/screenId>/.exec(body)?.[1] ?? null) : null),
            );
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve(null));
    });
}

async function postForm(
    url: string,
    form: Record<string, string | number | undefined>,
    params: Record<string, string | number | undefined> = {},
): Promise<{ status: number; text: string }> {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            target.searchParams.set(key, String(value));
        }
    }
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
        if (value !== undefined) {
            body.set(key, String(value));
        }
    }
    const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(TIMEOUT),
    });
    return { status: res.status, text: await res.text() };
}

/** The lounge session ended or the token expired; connect or pair again */
export class YouTubeSessionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'YouTubeSessionError';
    }
}

/** A remote control session with the YouTube app of one TV */
export class YouTubeLounge {
    private loungeToken = '';
    private sid = '';
    private gsessionid = '';
    private aid = 0;
    private rid = 1;
    private ofs = 0;
    private readonly deviceId = randomUUID();

    constructor(private readonly name = 'ioBroker') {}

    get paired(): boolean {
        return !!this.loungeToken;
    }

    get connected(): boolean {
        return !!(this.sid && this.gsessionid);
    }

    /** Get a lounge token for the screen of the YouTube app */
    async pair(screenId: string): Promise<void> {
        const { status, text } = await postForm(`${API}/pairing/get_lounge_token_batch`, { screen_ids: screenId });
        const screen =
            status === 200 ? (JSON.parse(text) as { screens?: { loungeToken?: string }[] }).screens?.[0] : undefined;
        if (!screen?.loungeToken) {
            throw new Error(`YouTube: no lounge token for this TV (HTTP ${status})`);
        }
        this.loungeToken = screen.loungeToken;
        this.sid = this.gsessionid = '';
    }

    private consume(events: [number, [string, ...unknown[]]][]): void {
        for (const [id, [type, ...args]] of events) {
            this.aid = id;
            if (type === 'c') {
                this.sid = String(args[0]);
            } else if (type === 'S') {
                this.gsessionid = String(args[0]);
            } else if (type === 'loungeScreenDisconnected') {
                this.sid = this.gsessionid = '';
            }
        }
    }

    /** Open a session to the TV */
    async connect(): Promise<void> {
        if (!this.loungeToken) {
            throw new YouTubeSessionError('YouTube: not paired');
        }
        this.rid = 1;
        this.ofs = 0;
        const { status, text } = await postForm(
            `${API}/bc/bind`,
            {
                app: 'web',
                'mdx-version': 3,
                name: this.name,
                id: this.deviceId,
                device: 'REMOTE_CONTROL',
                capabilities: 'que,dsdtr,atp',
                magnaKey: 'cloudPairedDevice',
                ui: 'false',
                theme: 'cl',
                loungeIdToken: this.loungeToken,
            },
            { RID: this.rid, VER: 8, CVER: 1, auth_failure_option: 'send_error' },
        );
        if (status === 401 || status === 410) {
            this.loungeToken = '';
            throw new YouTubeSessionError(`YouTube: lounge token expired (HTTP ${status})`);
        }
        if (status !== 200) {
            throw new Error(`YouTube: connection refused (HTTP ${status})`);
        }
        this.consume(parseBindChunks(text));
        if (!this.connected) {
            throw new Error('YouTube: no session');
        }
    }

    /** Send a lounge command, e.g. setPlaylist, play, pause, next */
    async command(name: string, params: Record<string, string | number | undefined> = {}): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }
        const form: Record<string, string | number | undefined> = { count: 1, ofs: this.ofs++, req0__sc: name };
        for (const [key, value] of Object.entries(params)) {
            form[`req0_${key}`] = value;
        }
        this.rid++;
        const { status, text } = await postForm(`${API}/bc/bind`, form, {
            name: this.name,
            loungeIdToken: this.loungeToken,
            SID: this.sid,
            AID: this.aid,
            gsessionid: this.gsessionid,
            device: 'REMOTE_CONTROL',
            app: 'youtube-desktop',
            VER: 8,
            v: 2,
            RID: this.rid,
            CVER: 1,
        });
        if (status === 400 && /Unknown SID/i.test(text)) {
            this.sid = this.gsessionid = '';
            throw new YouTubeSessionError('YouTube: session expired');
        }
        if (status !== 200) {
            throw new Error(`YouTube: command ${name} failed (HTTP ${status})`);
        }
    }

    /** Play a target of `parseYouTubeTarget`; the TV starts the YouTube app if needed */
    play(target: YouTubeTarget): Promise<void> {
        switch (target.kind) {
            case 'video':
                return this.command('setPlaylist', { videoId: target.videoId, currentTime: 0, currentIndex: -1 });
            case 'playlist':
                return this.command('setPlaylist', {
                    listId: target.listId,
                    videoId: target.videoId,
                    currentIndex: 0,
                    currentTime: 0,
                });
            case 'channel':
                // the channel page itself cannot be opened this way, its uploads can
                return this.command('setPlaylist', {
                    listId: uploadsPlaylistId(target.channelId),
                    currentIndex: 0,
                    currentTime: 0,
                });
            default:
                return this.command(target.command);
        }
    }
}
