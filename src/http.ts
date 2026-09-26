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
export class HttpSession {
  readonly jar: CookieJar;
  headers: Record<string, string>;

  constructor(headers: Record<string, string> = {}, jar?: CookieJar) {
    this.jar = jar ?? new CookieJar();
    this.headers = { ...headers };
  }

  private buildUrl(url: string, params?: Record<string, string>): string {
    if (!params) return url;
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  async request(method: string, url: string, opts: RequestOptions = {}): Promise<SessionResponse> {
    const maxRedirects = opts.maxRedirects ?? 10;
    let currentUrl = this.buildUrl(url, opts.params);
    let body: string | undefined;
    const headers: Record<string, string> = { ...this.headers, ...opts.headers };

    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers["Content-Type"] = "application/json";
    } else if (opts.data !== undefined) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.data)) usp.set(k, v ?? "");
      body = usp.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    for (let redirect = 0; redirect <= maxRedirects; redirect++) {
      const cookieHeader = await this.jar.getCookieString(currentUrl);
      const reqHeaders: Record<string, string> = { ...headers };
      if (cookieHeader) reqHeaders["Cookie"] = cookieHeader;

      const res = await fetch(currentUrl, {
        method,
        headers: reqHeaders,
        body: method === "GET" || method === "HEAD" ? undefined : body,
        redirect: "manual",
      });

      const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      for (const sc of setCookies) {
        try {
          await this.jar.setCookie(sc, currentUrl);
        } catch {
          /* ignore malformed cookies, mirrors requests' leniency */
        }
      }

      const isRedirect = res.status >= 300 && res.status < 400 && res.headers.has("location");
      if (isRedirect && redirect < maxRedirects) {
        const location = res.headers.get("location")!;
        currentUrl = new URL(location, currentUrl).toString();
        // 303 (and most servers' 301/302 for POST) => switch to GET, matching requests/browsers
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        continue;
      }

      const content = Buffer.from(await res.arrayBuffer());
      const text = content.toString("utf8");
      return {
        status: res.status,
        ok: res.ok,
        url: currentUrl,
        headers: res.headers,
        text,
        content,
        json<T>(): T {
          return JSON.parse(text) as T;
        },
      };
    }

    throw new Error("Too many redirects");
  }

  get(url: string, opts?: RequestOptions) {
    return this.request("GET", url, opts);
  }

  post(url: string, opts?: RequestOptions) {
    return this.request("POST", url, opts);
  }
}
