import { deflateRawSync, inflateRawSync } from "node:zlib";
import { HttpSession } from "./http.js";
import { Encryption, md5 } from "./crypto.js";
import { PronoteAPIError, ExpiredObject } from "./exceptions.js";
export const ERROR_MESSAGES = {
    22: '[ERROR 22] The object was from a previous session. Please read the "Long Term Usage" section in the README.',
    10: "[ERROR 10] Session has expired and pronoteTs was not able to reinitialise the connection.",
    25: "[ERROR 25] Exceeded max authorization requests. Please wait before retrying...",
};
export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:73.0) Gecko/20100101 Firefox/73.0",
};
export const HEADERS_MOBILE = {
    "User-Agent": "iPhone",
};
/** Gets rid of PRONOTE's character-interleaving obfuscation on some encoded fields. */
export function enleverAlea(text) {
    let out = "";
    for (let i = 0; i < text.length; i += 2)
        out += text[i];
    return out;
}
/** Turns a comma-separated list of byte values (as produced by PRONOTE JS) back into a Buffer. */
export function enBytes(str) {
    return Buffer.from(str.split(",").map((s) => parseInt(s, 10)));
}
/** Flattens PRONOTE's nested `listeOnglets` structure into a flat array of tab ids. */
export function prepareOnglets(listOfOnglets) {
    const output = [];
    if (!Array.isArray(listOfOnglets)) {
        if (typeof listOfOnglets === "number")
            return [listOfOnglets];
        return output;
    }
    for (let item of listOfOnglets) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
            item = Object.values(item);
        }
        output.push(...prepareOnglets(item));
    }
    return output;
}
/** Handles all communication with PRONOTE servers: handshake, encrypted/compressed POSTs. */
export class Communication {
    rootSite;
    htmlPage;
    session;
    encryption = new Encryption();
    attributes = {};
    requestNumber = 1;
    cookieJar;
    lastPing = 0;
    authorizedOnglets = [];
    compressRequests = false;
    encryptRequests = false;
    lastResponse;
    constructor(site, cookieJar, mobile) {
        const parts = site.split("/");
        this.rootSite = parts.slice(0, -1).join("/");
        this.htmlPage = parts.slice(-1).join("/");
        this.session = new HttpSession(mobile ? HEADERS_MOBILE : HEADERS, cookieJar);
        this.cookieJar = cookieJar;
    }
    static getRootAddress(addr) {
        const parts = addr.split("/");
        return [parts.slice(0, -1).join("/"), parts.slice(-1).join("/")];
    }
    /** Sets up encryption and sends the IV for AES to PRONOTE. From here on, everything is encrypted. */
    async initialise(clientIdentifier) {
        let parsed = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await this.session.get(`${this.rootSite}/${this.htmlPage}`);
            try {
                parsed = this.parseHtml(res.text);
                break;
            }
            catch {
                continue;
            }
        }
        if (!parsed) {
            throw new PronoteAPIError("Unable to connect to pronote, please try again later");
        }
        this.attributes = parsed;
        const uuidBuf = this.attributes["http"]
            ? this.encryption.rsaEncrypt(this.encryption.aesIvTemp)
            : this.encryption.aesIvTemp;
        const uuid = uuidBuf.toString("base64");
        const jsonPost = { Uuid: uuid, identifiantNav: clientIdentifier ?? null };
        this.encryptRequests = Boolean(this.attributes["CrA"]);
        this.compressRequests = Boolean(this.attributes["CoA"]);
        const initialResponse = await this.post("FonctionParametres", { data: jsonPost }, { iv: md5(this.encryption.aesIvTemp) });
        return [this.attributes, initialResponse];
    }
    async post(functionName, data, decryptionChange) {
        const signature = data["Signature"];
        if (signature && !this.authorizedOnglets.includes(signature.onglet ?? -1)) {
            throw new PronoteAPIError("Action not permitted. (onglet is not normally accessible)");
        }
        let postData = data;
        if (this.compressRequests) {
            let hex = Buffer.from(JSON.stringify(postData), "utf8").toString("hex");
            const compressed = deflateRawSync(Buffer.from(hex, "utf8"), { level: 6 });
            postData = compressed.toString("hex").toUpperCase();
        }
        if (this.encryptRequests) {
            if (typeof postData === "string") {
                postData = this.encryption.aesEncrypt(Buffer.from(postData, "hex")).toString("hex").toUpperCase();
            }
            else {
                postData = this.encryption
                    .aesEncrypt(Buffer.from(JSON.stringify(postData), "utf8"))
                    .toString("hex")
                    .toUpperCase();
            }
        }
        const rNumber = this.encryption.aesEncrypt(Buffer.from(String(this.requestNumber), "utf8")).toString("hex");
        const json = {
            session: parseInt(this.attributes["h"], 10),
            no: rNumber,
            id: functionName,
            dataSec: postData,
        };
        const pSite = `${this.rootSite}/appelfonction/${this.attributes["a"]}/${this.attributes["h"]}/${rNumber}`;
        const response = await this.session.post(pSite, { json });
        this.requestNumber += 2;
        this.lastPing = Math.floor(Date.now() / 1000);
        this.lastResponse = response;
        if (!response.ok) {
            throw new PronoteAPIError(`Bad request (http status: ${response.status})`);
        }
        const responseData = response.json();
        if ("Erreur" in responseData) {
            const g = responseData.Erreur.G;
            if (g === 22)
                throw new ExpiredObject(ERROR_MESSAGES[22]);
            throw new PronoteAPIError(ERROR_MESSAGES[g] ?? `Unknown error from pronote: ${g} | ${responseData.Erreur.Titre}`, { pronoteErrorCode: g, pronoteErrorMsg: responseData.Erreur.Titre });
        }
        if (decryptionChange) {
            if (decryptionChange.iv)
                this.encryption.aesIv = decryptionChange.iv;
            if (decryptionChange.key)
                this.encryption.aesKey = decryptionChange.key;
        }
        if (this.encryptRequests) {
            const decrypted = this.encryption.aesDecrypt(Buffer.from(responseData.dataSec, "hex"));
            responseData.dataSec = this.compressRequests ? decrypted : JSON.parse(decrypted.toString("utf8"));
        }
        if (this.compressRequests) {
            const d = responseData.dataSec;
            const raw = typeof d === "string" ? Buffer.from(d, "hex") : d;
            try {
                responseData.dataSec = JSON.parse(inflateRawSync(raw).toString("utf8"));
            }
            catch {
                throw new PronoteAPIError("JSONDecodeError while requesting from pronote.");
            }
        }
        return responseData;
    }
    /** Key change after a successful authentication. */
    async afterAuth(data, authKey) {
        this.encryption.aesKey = authKey;
        if (!this.cookieJar) {
            // requests keeps cookies from the login response; our session.jar already
            // accumulated them, nothing further to do here.
        }
        const work = this.encryption.aesDecrypt(Buffer.from(data.dataSec.data.cle, "hex"));
        const key = md5(enBytes(work.toString("utf8")));
        this.encryption.aesKey = key;
    }
    parseHtml(html) {
        if (html.includes("IP")) {
            throw new PronoteAPIError("Your IP address is suspended.");
        }
        const match = html.match(/Start ?\(\{(?<param>[^}]*)\}\)/);
        if (!match || !match.groups) {
            throw new PronoteAPIError("Page html is different than expected. Be sure that pronote_url is the direct url to your pronote page.");
        }
        const onloadC = match.groups.param;
        const attributes = {};
        for (const attr of onloadC.split(",")) {
            const idx = attr.indexOf(":");
            const key = attr.slice(0, idx).trim().replace(/^['"]|['"]$/g, "");
            const value = attr.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
            attributes[key] = value;
        }
        if (!("h" in attributes)) {
            throw new Error("internal exception to retry -> cannot parse html");
        }
        return attributes;
    }
}
/** Keeps the PRONOTE session alive by pinging every ~110s of inactivity, mirrors `_KeepAlive`. */
export class KeepAlive {
    client;
    timer;
    keepAliveFlag = true;
    constructor(client) {
        this.client = client;
    }
    start() {
        this.keepAliveFlag = true;
        this.timer = setInterval(async () => {
            if (!this.keepAliveFlag)
                return;
            if (Math.floor(Date.now() / 1000) - this.client.communication.lastPing >= 110) {
                await this.client.post("Navigation", 7, { onglet: 7, ongletPrec: 7 });
            }
        }, 1000);
    }
    stop() {
        this.keepAliveFlag = false;
        if (this.timer)
            clearInterval(this.timer);
    }
    /** Use as: `await using ka = client.keepAlive()` or manually `.start()`/`.stop()`. */
    async [Symbol.asyncDispose ?? Symbol.for("asyncDispose")]() {
        this.stop();
    }
}
//# sourceMappingURL=communication.js.map