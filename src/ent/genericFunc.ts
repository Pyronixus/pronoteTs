import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { HttpSession, SessionResponse } from "../http.js";
import { ENTLoginError } from "../exceptions.js";

export const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:73.0) Gecko/20100101 Firefox/73.0",
};

export interface EntOpts {
  pronote_url?: string;
}

async function ssoRedirect(
  session: HttpSession,
  response: SessionResponse,
  samlType: "SAMLRequest" | "SAMLResponse",
  requestUrl = "",
  requestPayload: Record<string, string> = {}
): Promise<SessionResponse | null> {
  let $ = cheerio.load(response.text);
  let saml = $(`input[name="${samlType}"]`);

  if (!saml.length && response.status === 200 && requestUrl !== response.url) {
    response = await session.post(response.url, { headers: HEADERS, data: requestPayload });
    $ = cheerio.load(response.text);
    saml = $(`input[name="${samlType}"]`);
  }

  if (!saml.length) return null;

  const payload: Record<string, string> = { [samlType]: saml.attr("value") ?? "" };
  const relayState = $('input[name="RelayState"]');
  if (relayState.length) payload["RelayState"] = relayState.attr("value") ?? "";

  const action = $("form").attr("action");
  if (!action) return null;

  return session.post(new URL(action, response.url).toString(), { headers: HEADERS, data: payload });
}

/** Generic EduConnect login form submission. */
export async function educonnect(
  session: HttpSession,
  username: string,
  password: string,
  url: string,
  exceptions = true
): Promise<SessionResponse | null> {
  if (!url) throw new ENTLoginError("Missing url attribute");

  const payload = { j_username: username, j_password: password, _eventId_proceed: "" };
  let response = await session.post(url, { headers: HEADERS, data: payload });
  const redirected = await ssoRedirect(session, response, "SAMLResponse", url, payload);
  if (!redirected) {
    if (exceptions) {
      throw new ENTLoginError("Fail to connect with EduConnect : probably wrong login information");
    }
    return null;
  }
  return redirected;
}

/** Generic CAS + EduConnect chain login. */
export async function casEdu(
  username: string,
  password: string,
  opts: { url?: string; redirect_form?: boolean } & EntOpts = {}
): Promise<CookieJar> {
  const url = opts.url ?? "";
  const redirectForm = opts.redirect_form ?? true;
  if (!url) throw new ENTLoginError("Missing url attribute");

  const session = new HttpSession(HEADERS);
  let response = await session.get(url, { headers: HEADERS });

  const redirected = redirectForm ? await ssoRedirect(session, response, "SAMLRequest", url) : response;
  if (!redirected) throw new ENTLoginError("Connection failure");

  await educonnect(session, username, password, redirected.url);
  return session.jar;
}

/** Generic CAS login (form with `cas__login-form` class). */
export async function cas(username: string, password: string, opts: { url?: string } & EntOpts = {}): Promise<CookieJar> {
  const url = opts.url ?? "";
  if (!url) throw new ENTLoginError("Missing url attribute");

  const session = new HttpSession(HEADERS);
  const response = await session.get(url, { headers: HEADERS });

  const $ = cheerio.load(response.text);
  const form = $("form.cas__login-form");
  const payload: Record<string, string> = {};
  form.find("input").each((_, el) => {
    const name = $(el).attr("name");
    if (name) payload[name] = $(el).attr("value") ?? "";
  });
  payload.username = username;
  payload.password = password;

  const r = await session.post(response.url, { headers: HEADERS, data: payload });
  const $2 = cheerio.load(r.text);
  if ($2("form.cas__login-form").length) {
    throw new ENTLoginError(`Fail to connect with CAS ${url} : probably wrong login information`);
  }
  return session.jar;
}

/** ENT with authentication like https://ent.iledefrance.fr/auth/login */
export async function openEntNg(username: string, password: string, opts: { url?: string } & EntOpts = {}): Promise<CookieJar> {
  const url = opts.url ?? "";
  if (!url) throw new ENTLoginError("Missing url attribute");

  const session = new HttpSession(HEADERS);
  const r = await session.post(url, { headers: HEADERS, data: { email: username, password } });

  if (r.url.includes("login")) {
    throw new ENTLoginError(`Fail to connect with Open NG ${url} : probably wrong login information`);
  }
  return session.jar;
}

/** ENT with authentication like https://connexion.l-educdenormandie.fr/ */
export async function openEntNgEdu(
  username: string,
  password: string,
  opts: { domain?: string; providerId?: string } & EntOpts = {}
): Promise<CookieJar> {
  const domain = opts.domain ?? "";
  if (!domain) throw new ENTLoginError("Missing domain attribute");
  const providerId = opts.providerId || `${domain}/auth/saml/metadata/idp.xml`;

  const entLoginPage = "https://educonnect.education.gouv.fr/idp/profile/SAML2/Unsolicited/SSO";

  const session = new HttpSession(HEADERS);
  const response = await session.get(entLoginPage, { headers: HEADERS, params: { providerId } });
  const result = await educonnect(session, username, password, response.url, false);

  if (!result) {
    return openEntNg(username, password, { url: `${domain}/auth/login` });
  } else if (result.url.includes("login")) {
    return openEntNg(username, password, { url: result.url });
  }
  return session.jar;
}

/** Generic WAYF (Where Are You From) discovery + EduConnect login. */
export async function wayf(
  username: string,
  password: string,
  opts: { domain?: string; entityID?: string; returnX?: string; redirect_form?: boolean } & EntOpts = {}
): Promise<CookieJar> {
  const domain = opts.domain ?? "";
  if (!domain) throw new ENTLoginError("Missing domain attribute");
  const entityID = opts.entityID || `${domain}/shibboleth`;
  const returnX = opts.returnX || `${domain}/Shibboleth.sso/Login`;
  const redirectForm = opts.redirect_form ?? true;

  const entLoginPage = `${domain}/discovery/WAYF`;
  const session = new HttpSession(HEADERS);
  const response = await session.get(entLoginPage, {
    headers: HEADERS,
    params: {
      entityID,
      returnX,
      returnIDParam: "entityID",
      action: "selection",
      origin: "https://educonnect.education.gouv.fr/idp",
    },
  });

  const redirected = redirectForm ? await ssoRedirect(session, response, "SAMLRequest", entLoginPage) : response;
  if (!redirected) throw new ENTLoginError("Connection failure");

  await educonnect(session, username, password, redirected.url);
  return session.jar;
}

/** Generic Oze ENT (Keycloak-based) login. */
export async function ozeEnt(username: string, password: string, opts: { url?: string } & EntOpts = {}): Promise<CookieJar> {
  const url = opts.url ?? "";
  if (!url) throw new ENTLoginError("Missing url attribute");

  const session = new HttpSession(HEADERS);
  const response = await session.get(url, { headers: HEADERS });
  const domain = new URL(url).host;

  let user = username;
  if (!user.includes(domain)) user = `${user}@${domain}`;

  const $ = cheerio.load(response.text);
  const form = $("form#kc-form-login");
  const payload: Record<string, string> = {};
  form.find("input").each((_, el) => {
    const name = $(el).attr("name");
    if (name) payload[name] = $(el).attr("value") ?? "";
  });
  payload.username = user;
  payload.password = password;

  const r = await session.post(response.url, { headers: HEADERS, data: payload });
  if (r.text.includes("auth_form")) {
    throw new ENTLoginError(`Fail to connect with Oze ENT ${url} : probably wrong login information`);
  }

  const parsed = new URL(url);
  const apiUrl = `${parsed.protocol}//api-${parsed.host}`;

  const infoUrl = new URL("/v1/users/me", apiUrl).toString();
  const infoResp = await session.get(infoUrl, { headers: HEADERS });
  const info = infoResp.json<any>();
  const ctxProfil = info.currentProfil.codeProfil;
  const ctxEtab = info.currentProfil.uai;

  const ozeappsUrl = new URL("/v1/ozapps", apiUrl).toString();
  const ozeappsResp = await session.get(ozeappsUrl, {
    headers: HEADERS,
    params: { ctx_profil: ctxProfil, ctx_etab: ctxEtab },
  });
  const ozeapps = ozeappsResp.json<any[]>();

  let proxySsoUrl: string | undefined;
  for (const app of ozeapps) {
    if (app.code === "pronote") proxySsoUrl = new URL(app.externalRoute, url).toString();
  }

  if (!proxySsoUrl) {
    const pronoteConfigUrl = new URL("/v1/config/Pronote", apiUrl).toString();
    const cfgResp = await session.get(pronoteConfigUrl, {
      headers: HEADERS,
      params: { ctx_profil: ctxProfil, ctx_etab: ctxEtab },
    });
    const pronoteConfig = cfgResp.json<any>();
    if (pronoteConfig.autorisationId && pronoteConfig.projet) {
      proxySsoUrl = `${url}cas/proxySSO/${pronoteConfig.autorisationId}?uai=${ctxEtab}&projet=${pronoteConfig.projet}&fonction=ELV`;
    }
  }

  if (proxySsoUrl) await session.get(proxySsoUrl, { headers: HEADERS });
  return session.jar;
}

/** Generic simple HTML login form. */
export async function simpleAuth(
  username: string,
  password: string,
  opts: { url?: string; form_attr?: Record<string, string> } & EntOpts = {}
): Promise<CookieJar> {
  const url = opts.url ?? "";
  const formAttr = opts.form_attr ?? {};
  if (!url) throw new ENTLoginError("Missing url attribute");

  const session = new HttpSession(HEADERS);
  const response = await session.get(url, { headers: HEADERS });

  const $ = cheerio.load(response.text);
  const selector = "form" + Object.entries(formAttr).map(([k, v]) => `[${k === "class" ? "class" : k}="${v}"]`).join("");
  const form = $(selector);
  const payload: Record<string, string> = {};
  form.find("input").each((_, el) => {
    const name = $(el).attr("name");
    if (name) payload[name] = $(el).attr("value") ?? "";
  });
  payload.username = username;
  payload.password = password;

  const r = await session.post(response.url, { headers: HEADERS, data: payload });
  const $2 = cheerio.load(r.text);
  if ($2(selector).length) {
    throw new ENTLoginError(`Fail to connect with ${url} : probably wrong login information`);
  }
  return session.jar;
}

/** Pronote EduConnect connection via hubeduconnect.index-education.net */
export async function hubeduconnect(
  username: string,
  password: string,
  opts: { pronote_url?: string } & EntOpts = {}
): Promise<CookieJar> {
  const pronoteUrl = opts.pronote_url ?? "";
  const hubeduconnectUrl = "https://hubeduconnect.index-education.net/EduConnect/cas/login";
  const url = `${hubeduconnectUrl}?service=${pronoteUrl}`;

  const session = new HttpSession(HEADERS);
  let response = await session.get(url, { headers: HEADERS });
  const redirected = await ssoRedirect(session, response, "SAMLRequest", url);
  if (!redirected) throw new ENTLoginError("Connection failure");

  if (redirected.text.includes('<label id="zone_msgDetail">L&#x27;url de service est vide</label>')) {
    throw new ENTLoginError("Fail to connect with HubEduConnect : Service URL not provided.");
  } else if (redirected.text.includes("n&#x27;est pas une url de confiance.")) {
    throw new ENTLoginError(
      "Fail to connect with HubEduConnect : Service URL not trusted. Is Pronote instance supported?"
    );
  }

  await educonnect(session, username, password, redirected.url);
  return session.jar;
}
