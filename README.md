# PiCar Remote

Simple Electron control panel for the CS 437 IoT Networking lab.

## Run

1. Install Node.js and npm.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Enter the Raspberry Pi's Wi-Fi IP address and the TCP port (default `65432`), then connect.

The computer and Pi must be on a network that allows them to reach each other. The Pi server must listen on the same port and accept connections from the network.

## Message contract used by this frontend

Each message is one JSON object followed by a newline (`\n`). The UI sends these messages:

```json
{"type":"command","command":"forward","speed":45}
{"type":"command","command":"stop"}
{"type":"status"}
```

The server should return newline-delimited JSON, for example:

```json
{"type":"status","battery":57,"moving":"forward","turning":"no"}
```

The UI requests status once per second and displays battery, movement, and steering. Ask the backend teammate to use this contract, or adjust `index.js` if the server uses a different format.
