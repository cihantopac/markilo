declare module 'pathkit-wasm/bin/pathkit.js' {
  /** Emscripten factory for Skia PathKit; resolves to the module once the WASM binary is instantiated. */
  const init: (opts: { wasmBinary: Uint8Array }) => Promise<unknown>;
  export default init;
}
