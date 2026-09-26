import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { HttpSession } from "../http.js";
import { ENTLoginError } from "../exceptions.js";
import { HEADERS, educonnect } from "./genericFunc.js";

/** ENT ac Rennes - Toutatice.fr (bespoke multi-step SAML flow). */
export async function acRennes(username: string, password: string): Promise<CookieJar> {
  const toutaticeUrl = "https://www.toutatice.fr/portail/auth/MonEspace";
  const toutaticeLogin = "https://www.toutatice.fr/wayf/Ctrl";
  const toutaticeAuth = "https://www.toutatice.fr/idp/Authn/RemoteUser";

  const session = new HttpSession(HEADERS);
  const response = await session.get(toutaticeUrl, { headers: HEADERS });
  const $ = cheerio.load(response.text);
  const payload = {
    entityID: $('input[name="entityID"]').attr("value") ?? "",
    return: $('input[name="return"]').attr("value") ?? "",
    _saml_idp: $('input[name="_saml_idp"]').attr("value") ?? "",
  };

  const loginResp = await session.post(toutaticeLogin, { headers: HEADERS, data: payload });
  await educonnect(session, username, password, loginResp.url);

  const execution = new URL(loginResp.url).searchParams.get("execution") ?? "";
  let params: Record<string, string> = {
    conversation: execution,
    redirectToLoaderRemoteUser: "0",
    sessionid: await sessionIdCookie(session),
  };

  let authResp = await session.get(toutaticeAuth, { headers: HEADERS, params });
  const $2 = cheerio.load(authResp.text, { xmlMode: true });

  if ($2("erreurFonctionnelle").length) {
    throw new ENTLoginError(`Toutatice ENT (ac_rennes) : ${$2("erreurFonctionnelle").text()}`);
  } else if ($2("erreurTechnique").length) {
    throw new ENTLoginError(`Toutatice ENT (ac_rennes) : ${$2("erreurTechnique").text()}`);
  } else {
    params = {
      conversation: $2("conversation").text(),
      uidInSession: $2("uidInSession").text(),
      sessionid: await sessionIdCookie(session),
    };
    await session.get(toutaticeAuth, { headers: HEADERS, params });
  }

  return session.jar;
}

async function sessionIdCookie(session: HttpSession): Promise<string> {
  const cookies = await session.jar.getCookies("https://www.toutatice.fr/");
  return cookies.find((c) => c.key === "IDP_JSESSIONID")?.value ?? "";
}
