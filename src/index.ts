/**
 * pronoteTs - an unofficial TypeScript client for PRONOTE.
 * Full port of pronotepy: same protocol, same AES/RSA encryption scheme,
 * same data model, same ENT/SSO login providers.
 */
export * from "./exceptions.js";
export * from "./dataClasses.js";
export { ClientBase, Client, ParentClient, VieScolaireClient } from "./client.js";
export type { ENTFunction, ClientOptions, LoginMode } from "./client.js";
export { Encryption } from "./crypto.js";
export { Communication, KeepAlive } from "./communication.js";
export { Util } from "./resolver.js";
