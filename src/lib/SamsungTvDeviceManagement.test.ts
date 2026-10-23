/* eslint-disable @typescript-eslint/require-await -- the fakes mirror the async service and context APIs */
import assert from 'node:assert/strict';
import type { ActionContext, DeviceInfo, DeviceLoadContext } from '@iobroker/dm-utils';
import { describe, it } from 'mocha';
import { SamsungTvDeviceManagement, deviceForm, t, type ManagedDevice } from './SamsungTvDeviceManagement';

type TestContext = ActionContext &
    DeviceLoadContext<string> & {
        messages: Record<string, string>[];
        devices: DeviceInfo<string>[];
        totals: number[];
        readonly progressClosed: number;
    };

function createManager(service: Record<string, unknown> = {}): SamsungTvDeviceManagement {
    const manager = Object.create(SamsungTvDeviceManagement.prototype) as SamsungTvDeviceManagement;
    Object.assign(manager, { adapter: { namespace: 'samsungtv.0' } });
    manager.service = {
        getConfiguredDevices: () => [],
        getDiscoveredDevices: () => [],
        isConfigured: () => false,
        isDevicePaired: () => false,
        findDevice: () => null,
        suggestName: () => 'tv',
        ...service,
    } as unknown as SamsungTvDeviceManagement['service'];
    return manager;
}

function createContext(formResult?: Record<string, unknown>): TestContext {
    const messages: Record<string, string>[] = [];
    const devices: DeviceInfo<string>[] = [];
    const totals: number[] = [];
    let progressClosed = 0;
    return {
        messages,
        devices,
        totals,
        get progressClosed() {
            return progressClosed;
        },
        setTotalDevices(total: number) {
            totals.push(total);
        },
        addDevice(device: DeviceInfo<string>) {
            devices.push(device);
        },
        async showMessage(message: ioBroker.StringOrTranslated) {
            messages.push(message as Record<string, string>);
        },
        async showForm() {
            return formResult;
        },
        async openProgress() {
            return {
                async close() {
                    progressClosed++;
                },
            };
        },
    } as unknown as TestContext;
}

describe('Samsung TV device management', () => {
    it('provides translated responsive forms with API and protocol selects', () => {
        const schema = deviceForm({ name: 'Living room', ip: '192.0.2.10' });
        assert.equal(schema.items.name.sm, 6);
        assert.equal(schema.items.api.type, 'select');
        assert.equal(schema.items.protocol.type, 'select');
        assert.equal(schema.items.ip.type, 'text');
        assert.equal((schema.items.api.options[0]?.label as Record<string, string>).de, 'Automatisch');
    });

    it('loads configured devices and hides already configured discoveries', async () => {
        const configured = { id: 'one', name: 'living-room', displayName: 'Living room', api: 'tizen' };
        const manager = createManager({
            getConfiguredDevices: () => [configured],
            getDiscoveredDevices: () => [configured, { id: 'two', name: 'Bedroom', ip: '192.0.2.11' }],
            isConfigured: (device: ManagedDevice) => device.id === 'one',
        });
        const context = createContext();

        await manager.loadDevices(context);

        assert.deepEqual(context.totals, [2]);
        assert.deepEqual(
            context.devices.map(device => device.id),
            ['one', 'two'],
        );
        assert.equal(context.devices[0]?.group?.key, 'configured');
        assert.equal(context.devices[1]?.group?.key, 'discovered');
    });

    it('returns the instance refresh contract after discovery', async () => {
        const manager = createManager({ discover: async () => [{ id: 'one' }, { id: 'two' }] });
        const context = createContext();

        const result = await manager.discover(context);

        assert.deepEqual(result, { refresh: true });
        assert.equal(context.progressClosed, 0);
        assert.equal(context.messages[0]?.en, '2 TVs found.');
    });

    it('adds a device from the manual form', async () => {
        let added: Record<string, unknown> | undefined;
        const manager = createManager({
            addDevice: async (device: Record<string, unknown>) => {
                added = device;
            },
        });
        const context = createContext({ name: 'Bedroom', ip: '192.0.2.12', api: 'tizen', protocol: 'wss' });

        const result = await manager.manualAdd(context);

        assert.deepEqual(result, { refresh: true });
        assert.equal(added?.name, 'Bedroom');
    });

    it('runs the H/J PIN pairing sequence without exposing the PIN in messages', async () => {
        const calls: unknown[][] = [];
        const device = { id: 'hj-one', name: 'bedroom', ip: '192.0.2.13', api: 'hj' };
        const manager = createManager({
            findDevice: () => device,
            requestPin: async (value: ManagedDevice) => calls.push(['request', value.id]),
            confirmPin: async (value: ManagedDevice, pin: string) => calls.push(['confirm', value.id, pin]),
        });
        const context = createContext({ pin: '1234' });

        const result = await manager.pair(device.id, context);

        assert.deepEqual(calls, [
            ['request', 'hj-one'],
            ['confirm', 'hj-one', '1234'],
        ]);
        assert.deepEqual(result, { refresh: 'devices' });
        assert.equal(context.progressClosed, 0);
        assert.equal(JSON.stringify(context.messages).includes('1234'), false);
    });

    it('pairs Tizen devices and refreshes the device list', async () => {
        const device = { id: 'tizen-one', name: 'living-room', ip: '192.0.2.14', api: 'tizen' };
        let paired: string | undefined;
        const manager = createManager({
            findDevice: () => device,
            pairTizen: async (value: ManagedDevice) => {
                paired = value.id;
            },
        });
        const context = createContext();

        const result = await manager.pair(device.id, context);

        assert.equal(paired, 'tizen-one');
        assert.deepEqual(result, { refresh: 'devices' });
        assert.equal(context.progressClosed, 0);
    });

    it('validates and stores a manually entered Tizen token without exposing it in messages', async () => {
        const device = { id: 'tizen-two', name: 'bar', ip: '192.0.2.15', api: 'tizen' };
        let stored: string[] | undefined;
        const manager = createManager({
            findDevice: () => device,
            setTizenToken: async (value: ManagedDevice, token: string) => {
                stored = [value.id, token];
            },
        });
        const context = createContext({ token: '  12345678  ' });

        const result = await manager.setToken(device.id, context);

        assert.deepEqual(stored, ['tizen-two', '12345678']);
        assert.deepEqual(result, { refresh: 'devices' });
        assert.equal(JSON.stringify(context.messages).includes('12345678'), false);
        const actions = manager.configuredDeviceInfo(device).actions?.map(action => action.id);
        assert.deepEqual(actions, ['pair', 'set-token', 'rename', 'delete']);
        const hjActions = manager.configuredDeviceInfo({ ...device, api: 'hj' }).actions?.map(action => action.id);
        assert.equal(hjActions?.includes('set-token'), false);
    });

    it('shows translated token validation errors without exposing the token', async () => {
        const device = { id: 'tizen-three', name: 'office', ip: '192.0.2.16', api: 'tizen' };
        const manager = createManager({
            findDevice: () => device,
            setTizenToken: async () => {
                throw new Error('Token rejected');
            },
        });
        const context = createContext({ token: 'secret-token' });

        const result = await manager.setToken(device.id, context);

        assert.deepEqual(result, { refresh: 'none' });
        assert.equal(
            context.messages[0]?.de,
            'Token konnte nicht gesetzt werden: Der Token ist ungültig oder wurde vom TV abgelehnt.',
        );
        assert.equal(JSON.stringify(context.messages).includes('secret-token'), false);
    });

    it('renames and removes configured devices through the service', async () => {
        const calls: unknown[][] = [];
        const device = { id: 'one', name: 'living-room', api: 'tizen' };
        const manager = createManager({
            findDevice: () => device,
            renameDevice: async (id: string, name: string) => calls.push(['rename', id, name]),
            removeDevice: async (id: string) => calls.push(['remove', id]),
        });

        assert.deepEqual(await manager.rename(device.id, createContext({ name: 'Living room 2' })), {
            refresh: 'devices',
        });
        assert.deepEqual(await manager.remove(device.id), { refresh: 'devices' });
        assert.deepEqual(calls, [
            ['rename', 'one', 'Living room 2'],
            ['remove', 'one'],
        ]);
    });

    it('falls back to the key when a translation is unavailable', () => {
        assert.equal(t('Not a translation').en, 'Not a translation');
    });
});
