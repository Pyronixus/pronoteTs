import { CookieJar } from "tough-cookie";
export interface SessionResponse {
    status: number;
    ok: boolean;
    /** Final URL after following redirects, mirrors `requests.Response.url` */
    url: string;
    headers: Headers;
    text: string;
    json<T = unknown>(): T;
    content: Buffer;
}
export interface RequestOptions {
    headers?: Record<string, string>;
    /** Sent as application/x-www-form-urlencoded */
    data?: Record<string, string | undefined>;
    /** Sent as application/json */
    json?: unknown;
    params?: Record<string, string>;
    maxRedirects?: number;
}
/**
 * Minimal `requests.Session` equivalent built on the platform `fetch`:
 * persistent cookie jar (RFC 6265 via tough-cookie) + manual redirect
 * following, since global `fetch` has no cookie store of its own.
 */
export declare class HttpSession {
    readonly jar: CookieJar;
    headers: Record<string, string>;
    constructor(headers?: Record<string, string>, jar?: CookieJar);
    private buildUrl;
    request(method: string, url: string, opts?: RequestOptions): Promise<SessionResponse>;
    get(url: string, opts?: RequestOptions): Promise<SessionResponse>;
    post(url: string, opts?: RequestOptions): Promise<SessionResponse>;
}
