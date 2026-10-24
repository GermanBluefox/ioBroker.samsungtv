import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { parseBindChunks, parseYouTubeTarget, uploadsPlaylistId } from './youtubeLounge';

describe('YouTube lounge', () => {
    it('understands video IDs, playlists, channels and URLs', () => {
        assert.deepEqual(parseYouTubeTarget('jNQXAC9IVRw'), { kind: 'video', videoId: 'jNQXAC9IVRw' });
        assert.deepEqual(parseYouTubeTarget('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=5'), {
            kind: 'video',
            videoId: 'jNQXAC9IVRw',
        });
        assert.deepEqual(parseYouTubeTarget('youtu.be/jNQXAC9IVRw'), { kind: 'video', videoId: 'jNQXAC9IVRw' });
        assert.deepEqual(parseYouTubeTarget('https://youtube.com/shorts/jNQXAC9IVRw'), {
            kind: 'video',
            videoId: 'jNQXAC9IVRw',
        });
        assert.deepEqual(parseYouTubeTarget('UCBR8-60-B28hp2BmDPdntcQ'), {
            kind: 'channel',
            channelId: 'UCBR8-60-B28hp2BmDPdntcQ',
        });
        assert.deepEqual(parseYouTubeTarget('https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ/videos'), {
            kind: 'channel',
            channelId: 'UCBR8-60-B28hp2BmDPdntcQ',
        });
        assert.deepEqual(
            parseYouTubeTarget('https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb'),
            {
                kind: 'playlist',
                listId: 'PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb',
            },
        );
        assert.deepEqual(parseYouTubeTarget('Pause'), { kind: 'command', command: 'pause' });
    });

    it('rejects what it cannot play', () => {
        assert.throws(() => parseYouTubeTarget('@YouTube'), /Not a YouTube video/);
        assert.throws(() => parseYouTubeTarget('https://example.com/watch?v=jNQXAC9IVRw'), /Not a YouTube video/);
    });

    it('plays the uploads of a channel', () => {
        assert.equal(uploadsPlaylistId('UCBR8-60-B28hp2BmDPdntcQ'), 'UUBR8-60-B28hp2BmDPdntcQ');
    });

    it('splits the chunked bind answer into events', () => {
        // each chunk: its length including the new line, then the JSON
        const chunk = (json: string): string => `${json.length + 1}\n${json}\n`;
        const text = chunk('[[0,["c","sid-1","",8]],[1,["S","gsession-1"]]]') + chunk('[[2,["loungeStatus",{}]]]');
        assert.deepEqual(
            parseBindChunks(text).map(([id, [type]]) => [id, type]),
            [
                [0, 'c'],
                [1, 'S'],
                [2, 'loungeStatus'],
            ],
        );
    });
});
