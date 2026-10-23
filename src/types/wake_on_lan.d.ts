// Typings for `wake_on_lan`, which ships none - only what the adapter uses
declare module 'wake_on_lan' {
    namespace wol {
        interface WakeOptions {
            address?: string;
            port?: number;
            num_packets?: number;
            interval?: number;
        }
        /** Send the magic packet; throws synchronously on a malformed MAC address */
        function wake(mac: string, callback?: (error?: Error) => void): void;
        function wake(mac: string, options: WakeOptions, callback?: (error?: Error) => void): void;
    }
    export = wol;
}
