export type TvApi = 'tizen' | 'hj' | 'legacy' | 'unknown';
export type TvTransport = 'ws' | 'wss' | 'tcp' | '';

export interface ConfiguredDevice {
    id: string;
    name: string;
    displayName: string;
    ip: string;
    mac: string;
    model: string;
    api: TvApi;
    protocol: TvTransport;
    port: number;
    uuid: string;
    source: string;
    renderingControlUrl?: string;
    renderingControlEventUrl?: string;
    tokenAuthSupport?: boolean;
    hjAvailable?: boolean;
}

export interface AdapterNativeConfig {
    schemaVersion: number;
    devices: unknown[];
    tokens: string;
    autoScan: boolean;
    autoScanInterval: number;
    discoveryTimeout: number;
    pollInterval: number;
    enableSsdp: boolean;
    enableMdns: boolean;
    enableWol: boolean;
    mdnsServices: string;
    migratedFromSamsung?: boolean;
}

export interface HjIdentity {
    aesKey: string;
    sessionId: string;
}

export interface SecretPayload {
    version: 1;
    tizen: Record<string, string>;
    hj: Record<string, unknown>;
}

/** Tokens in memory: Tizen token or `__no_token__` per device ID, H/J identity per device ID */
export interface TokenStore {
    tizen: Record<string, string>;
    hj: Record<string, unknown>;
}

/**
 * A TV as it is stored in the persistent registry. Older versions and the Device Manager wrote
 * different subsets of these fields, so all of them are optional.
 */
export interface RawConfiguredDevice {
    id?: string;
    uuid?: string;
    usn?: string;
    mac?: string;
    ip?: string;
    name?: string;
    friendlyName?: string;
    displayName?: string;
    model?: string;
    api?: string;
    protocol?: string;
    port?: number;
    source?: string;
    renderingControlUrl?: string;
    renderingControlEventUrl?: string;
    tokenAuthSupport?: boolean;
    hjAvailable?: boolean;
    [key: string]: unknown;
}

/** State of a running power command, see `powerTransitionTools` */
export interface PowerTransition {
    target: boolean;
    until: number;
}

/** A configured TV with what the adapter learns about it at runtime */
export interface RuntimeDevice extends ConfiguredDevice {
    lastKnownVolume?: number;
    expectedVolume?: number;
    expectedVolumeUntil?: number;
    volumeTelemetryReliable?: boolean;
    lastKnownMuted?: boolean;
    expectedMuted?: boolean;
    expectedMutedUntil?: number;
    mutedTelemetryReliable?: boolean;
    mutedShadowUntil?: number;
    powerTransition?: PowerTransition;
    _renderingControlLookupTs?: number;
}

/** A TV found by SSDP or mDNS and probed */
export interface DiscoveredDevice {
    ip: string;
    source: string[];
    name: string;
    model: string;
    api: TvApi;
    protocol: TvTransport;
    port: number;
    uuid: string;
    id: string;
    mac: string;
    renderingControlUrl: string;
    renderingControlEventUrl: string;
    hjAvailable?: boolean;
    tokenAuthSupport?: boolean;
}

/** Result of one status check of a TV */
export interface DeviceStatus {
    online: boolean;
    power: boolean;
    volume: number | null;
    muted: boolean | null;
    volumeSource?: 'api' | 'upnp';
    mutedSource?: 'api' | 'upnp';
}

/** Fields of a discovery or probe result that are copied into the registry */
export interface DeviceInfoUpdate {
    id?: string;
    ip?: string;
    mac?: string;
    api?: TvApi;
    protocol?: TvTransport;
    port?: number;
    renderingControlUrl?: string;
    renderingControlEventUrl?: string;
    hjAvailable?: boolean;
    tokenAuthSupport?: boolean;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ioBroker {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface AdapterConfig extends AdapterNativeConfig {}
    }
}
