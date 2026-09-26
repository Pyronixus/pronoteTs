import { CookieJar } from "tough-cookie";
/**
 * Minimal `requests.Session` equivalent built on the platform `fetch`:
 * persistent cookie jar (RFC 6265 via tough-cookie) + manual redirect
 * following, since global `fetch` has no cookie store of its own.
 */
export class HttpSession {
    jar;
    headers;
    constructor(headers = {}, jar) {
        this.jar = jar ?? new CookieJar();
        this.headers = { ...headers };
    }
    buildUrl(url, params) {
        if (!params)
            return url;
        const u = new URL(url);
        for (const [k, v] of Object.entries(params))
            u.searchParams.set(k, v);
        return u.toString();
    }
    async request(method, url, opts = {}) {
        const maxRedirects = opts.maxRedirects ?? 10;
        let currentUrl = this.buildUrl(url, opts.params);
        let body;
        const headers = { ...this.headers, ...opts.headers };
        if (opts.json !== undefined) {
            body = JSON.stringify(opts.json);
            headers["Content-Type"] = "application/json";
        }
        else if (opts.data !== undefined) {
            const usp = new URLSearchParams();
            for (const [k, v] of Object.entries(opts.data))
                usp.set(k, v ?? "");
            body = usp.toString();
            headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
        for (let redirect = 0; redirect <= maxRedirects; redirect++) {
            const cookieHeader = await this.jar.getCookieString(currentUrl);
            const reqHeaders = { ...headers };
            if (cookieHeader)
                reqHeaders["Cookie"] = cookieHeader;
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
                }
                catch {
                    /* ignore malformed cookies, mirrors requests' leniency */
                }
            }
            const isRedirect = res.status >= 300 && res.status < 400 && res.headers.has("location");
            if (isRedirect && redirect < maxRedirects) {
                const location = res.headers.get("location");
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
                json() {
                    return JSON.parse(text);
                },
            };
        }
        throw new Error("Too many redirects");
    }
    get(url, opts) {
        return this.request("GET", url, opts);
    }
    post(url, opts) {
        return this.request("POST", url, opts);
    }
}
//# sourceMappingURL=http.js.map