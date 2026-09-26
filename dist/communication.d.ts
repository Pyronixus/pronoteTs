import { CookieJar } from "tough-cookie";
import { HttpSession, SessionResponse } from "./http.js";
import { Encryption } from "./crypto.js";
export declare const ERROR_MESSAGES: Record<number, string>;
export declare const HEADERS: {
    "User-Agent": string;
};
export declare const HEADERS_MOBILE: {
    "User-Agent": string;
};
/** Gets rid of PRONOTE's character-interleaving obfuscation on some encoded fields. */
export declare function enleverAlea(text: string): string;
/** Turns a comma-separated list of byte values (as produced by PRONOTE JS) back into a Buffer. */
export declare function enBytes(str: string): Buffer;
/** Flattens PRONOTE's nested `listeOnglets` structure into a flat array of tab ids. */
export declare function prepareOnglets(listOfOnglets: unknown): number[];
export interface DecryptionChange {
    iv?: Buffer;
    key?: Buffer;
}
/** Handles all communication with PRONOTE servers: handshake, encrypted/compressed POSTs. */
export declare class Communication {
    rootSite: string;
    htmlPage: string;
    session: HttpSession;
    encryption: Encryption;
    attributes: Record<string, string>;
    requestNumber: number;
    cookieJar?: CookieJar;
    lastPing: number;
    authorizedOnglets: number[];
    compressRequests: boolean;
    encryptRequests: boolean;
    lastResponse: SessionResponse;
    constructor(site: string, cookieJar: CookieJar | undefined, mobile: boolean);
    static getRootAddress(addr: string): [string, string];
    /** Sets up encryption and sends the IV for AES to PRONOTE. From here on, everything is encrypted. */
    initialise(clientIdentifier?: string): Promise<[Record<string, string>, any]>;
    post(functionName: string, data: Record<string, unknown>, decryptionChange?: DecryptionChange): Promise<any>;
    /** Key change after a successful authentication. */
    afterAuth(data: Record<string, any>, authKey: Buffer): Promise<void>;
    private parseHtml;
}
/** Keeps the PRONOTE session alive by pinging every ~110s of inactivity, mirrors `_KeepAlive`. */
export declare class KeepAlive {
    private client;
    private timer?;
    keepAliveFlag: boolean;
    constructor(client: {
        post(fn: string, onglet?: number, data?: Record<string, unknown>): Promise<unknown>;
        communication: Communication;
    });
    start(): void;
    stop(): void;
}
