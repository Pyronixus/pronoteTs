import { CookieJar } from "tough-cookie";
import { HttpSession, SessionResponse } from "../http.js";
export declare const HEADERS: {
    "User-Agent": string;
};
export interface EntOpts {
    pronote_url?: string;
}
/** Generic EduConnect login form submission. */
export declare function educonnect(session: HttpSession, username: string, password: string, url: string, exceptions?: boolean): Promise<SessionResponse | null>;
/** Generic CAS + EduConnect chain login. */
export declare function casEdu(username: string, password: string, opts?: {
    url?: string;
    redirect_form?: boolean;
} & EntOpts): Promise<CookieJar>;
/** Generic CAS login (form with `cas__login-form` class). */
export declare function cas(username: string, password: string, opts?: {
    url?: string;
} & EntOpts): Promise<CookieJar>;
/** ENT with authentication like https://ent.iledefrance.fr/auth/login */
export declare function openEntNg(username: string, password: string, opts?: {
    url?: string;
} & EntOpts): Promise<CookieJar>;
/** ENT with authentication like https://connexion.l-educdenormandie.fr/ */
export declare function openEntNgEdu(username: string, password: string, opts?: {
    domain?: string;
    providerId?: string;
} & EntOpts): Promise<CookieJar>;
/** Generic WAYF (Where Are You From) discovery + EduConnect login. */
export declare function wayf(username: string, password: string, opts?: {
    domain?: string;
    entityID?: string;
    returnX?: string;
    redirect_form?: boolean;
} & EntOpts): Promise<CookieJar>;
/** Generic Oze ENT (Keycloak-based) login. */
export declare function ozeEnt(username: string, password: string, opts?: {
    url?: string;
} & EntOpts): Promise<CookieJar>;
/** Generic simple HTML login form. */
export declare function simpleAuth(username: string, password: string, opts?: {
    url?: string;
    form_attr?: Record<string, string>;
} & EntOpts): Promise<CookieJar>;
/** Pronote EduConnect connection via hubeduconnect.index-education.net */
export declare function hubeduconnect(username: string, password: string, opts?: {
    pronote_url?: string;
} & EntOpts): Promise<CookieJar>;
