import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { parseScene, runScene, sceneDelay, sceneId } from './scenes';
import { TV_KEYS, TV_KEY_CODES } from './tvValues';

describe('scenes', () => {
    it('parses keys, apps, inputs and pauses', () => {
        assert.deepEqual(parseScene('HOME, YOUTUBE, WAIT 3000, OK, HDMI2'), [
            { type: 'key', key: 'KEY_HOME' },
            { type: 'app', app: 'YOUTUBE' },
            { type: 'wait', ms: 3000 },
            { type: 'key', key: 'KEY_ENTER' },
            { type: 'input', input: 'HDMI2' },
        ]);
    });

    it('accepts the keys of TV_KEYS, aliases, digits and Samsung key codes in any case', () => {
        assert.deepEqual(
            parseScene('select; back\nkey_hdmi2, 5, channel up, Volume_Up').map(step =>
                step.type === 'key' ? step.key : step.type,
            ),
            ['KEY_ENTER', 'KEY_RETURN', 'KEY_HDMI2', 'KEY_5', 'KEY_CHUP', 'KEY_VOLUP'],
        );
    });

    it('limits a pause to a minute and ignores empty steps', () => {
        assert.deepEqual(parseScene(' , pause 999999,,'), [{ type: 'wait', ms: 60000 }]);
    });

    it('names the step it does not understand', () => {
        assert.throws(() => parseScene('HOME, YOUTUBEE, OK'), /Unknown step "YOUTUBEE"/);
    });

    it('has a Samsung key code for every key of TV_KEYS', () => {
        assert.deepEqual(Object.keys(TV_KEY_CODES), Object.keys(TV_KEYS));
    });

    it('makes a state ID of the name', () => {
        assert.equal(sceneId(' Scene YouTube! '), 'Scene_YouTube_');
    });

    it('takes 500 ms between steps unless configured', () => {
        assert.equal(sceneDelay(undefined), 500);
        assert.equal(sceneDelay('x'), 500);
        assert.equal(sceneDelay('0'), 0);
        assert.equal(sceneDelay(1200), 1200);
    });

    it('runs the steps in order with the delay in between', async () => {
        const calls: string[] = [];
        await runScene(parseScene('HOME, YOUTUBE, WAIT 3000, HDMI1'), 700, {
            sendKey: key => Promise.resolve(void calls.push(key)),
            launchApp: app => Promise.resolve(void calls.push(`app ${app}`)),
            selectInput: input => Promise.resolve(void calls.push(`input ${input}`)),
            sleep: ms => Promise.resolve(void calls.push(`sleep ${ms}`)),
        });
        assert.deepEqual(calls, [
            'KEY_HOME',
            'sleep 700',
            'app YOUTUBE',
            'sleep 700',
            'sleep 3000',
            'sleep 700',
            'input HDMI1',
        ]);
    });
});
