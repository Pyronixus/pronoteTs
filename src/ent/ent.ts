import type { ENTFunction } from "../client.js";
import {
  cas,
  casEdu,
  openEntNg,
  openEntNgEdu,
  wayf,
  hubeduconnect,
  ozeEnt,
  simpleAuth,
} from "./genericFunc.js";
import { acRennes } from "./complexEnt.js";

/** Wraps a generic ENT function + fixed options into a `ClientOptions.ent` callable. */
function bind<O extends object>(fn: (u: string, p: string, opts: O & { pronote_url?: string }) => Promise<any>, opts: O): ENTFunction {
  return (username, password, callOpts) => fn(username, password, { ...opts, ...callOpts } as O & { pronote_url?: string });
}

/* ---------------------------- CAS ---------------------------- */

export const casArsene76 = bind(cas, { url: "https://cas.arsene76.fr/login?selection=ATS_parent_eleve" });
export const casEnt27 = bind(cas, { url: "https://cas.ent27.fr/login?selection=ATS_parent_eleve" });
export const casKosmos = bind(cas, { url: "https://cas.kosmoseducation.com/login" });
export const entCreuse = bind(cas, { url: "https://cas.entcreuse.fr/login?selection=ATS_parent_eleve" });
export const occitanieMontpellier = bind(cas, {
  url: "https://cas.mon-ent-occitanie.fr/login?selection=CSES-ENT_parent_eleve",
});
export const valDoise = bind(cas, { url: "https://cas.moncollege.valdoise.fr/login?selection=eleveparent" });

/* ---------------------- CAS with EduConnect -------------------- */

export const valDeMarne = bind(casEdu, {
  url: "https://cas.moncollege.valdemarne.fr/login?selection=EDU_parent_eleve",
});
export const casCybercolleges42Edu = bind(casEdu, {
  url: "https://cas.cybercolleges42.fr/login?selection=EDU_parent_eleve&service=",
});
export const ecollegeHauteGaronneEdu = bind(casEdu, {
  url: "https://cas.ecollege.haute-garonne.fr/login?selection=EDU_parent_eleve&service=",
});
export const acOrleansTours = bind(casEdu, {
  url: "https://ent.netocentre.fr/cas/login?token=ce8ae867a0accc0b7577fcc340bb99f4&idpId=parentEleveEN-IdP",
  redirect_form: false,
});
export const acPoitiers = bind(casEdu, {
  url: "https://sp-ts.ac-poitiers.fr/dispatcher/index2.php",
  redirect_form: false,
});
export const acReunion = bind(casEdu, {
  url: "https://sso.ac-reunion.fr/saml/discovery/?idp_ident=https://educonnect.education.gouv.fr/idp",
});
export const casAgora06 = bind(casEdu, { url: "https://cas.agora06.fr/login?selection=EDU&service=" });
export const casSeinesaintdenisEdu = bind(casEdu, {
  url: "https://cas.webcollege.seinesaintdenis.fr/login?selection=EDU_parent_eleve&service=",
});
export const casArsene76Edu = bind(casEdu, {
  url: "https://cas.arsene76.fr/login?selection=EDU_parent_eleve&service=",
});
export const eclatBfc = bind(casEdu, { url: "https://cas.eclat-bfc.fr/login?selection=EDU&service=" });
export const entAuvergnerhonealpe = bind(casEdu, {
  url: "https://cas.ent.auvergnerhonealpes.fr/login?selection=EDU&service=",
});
export const laclasseEduconnect = bind(casEdu, {
  url: "https://www.laclasse.com/sso/educonnect",
  redirect_form: false,
});
export const monbureaunumerique = bind(casEdu, {
  url: "https://cas.monbureaunumerique.fr/login?selection=EDU&service=",
});
export const acReims = monbureaunumerique;
export const occitanieMontpellierEduconnect = bind(casEdu, {
  url: "https://cas.mon-ent-occitanie.fr/login?selection=MONT-EDU_parent_eleve&service=",
});
export const occitanieToulouseEdu = bind(casEdu, {
  url: "https://cas.mon-ent-occitanie.fr/login?selection=TOULO-EDU_parent_eleve&service=",
});
export const entCreuseEduconnect = bind(casEdu, { url: "https://cas.entcreuse.fr/login?selection=EDU" });

/* --------------------------- Open ENT NG ------------------------ */

export const ent77 = bind(openEntNg, { url: "https://ent77.seine-et-marne.fr/auth/login" });
export const entEcollege78 = bind(openEntNg, { url: "https://ent.ecollege78.fr/auth/login" });
export const entEssonne = bind(openEntNg, { url: "https://www.moncollege-ent.essonne.fr/auth/login" });
export const entMayotte = bind(openEntNg, { url: "https://mayotte.opendigitaleducation.com/auth/login" });
export const ileDeFrance = bind(openEntNg, { url: "https://ent.iledefrance.fr/auth/login" });
export const neoconnectGuadeloupe = bind(openEntNg, {
  url: "https://neoconnect.opendigitaleducation.com/auth/login",
});
export const parisClasseNumerique = bind(openEntNg, { url: "https://ent.parisclassenumerique.fr/auth/login" });
export const lyceeconnecteAquitaine = bind(openEntNg, { url: "https://mon.lyceeconnecte.fr/auth/login" });

/* ---------------------- Open ENT NG with EduConnect --------------- */

export const ent94 = bind(openEntNgEdu, {
  domain: "https://ent94.opendigitaleducation.com",
  providerId: "urn:fi:ent:prod-cd94-edu:1.0",
});
export const entHdf = bind(openEntNgEdu, { domain: "https://enthdf.fr" });
export const entSomme = entHdf;
export const entVar = bind(openEntNgEdu, {
  domain: "https://moncollege-ent.var.fr",
  providerId: "urn:fi:ent:prod-cd83-edu:1.0",
});
export const lNormandie = bind(openEntNgEdu, { domain: "https://ent.l-educdenormandie.fr" });
export const lyceeconnecteEdu = bind(openEntNgEdu, { domain: "https://mon.lyceeconnecte.fr" });

/* ------------------------------ WAYF ------------------------------ */

export const entElyco = bind(wayf, { domain: "https://cas3.e-lyco.fr", redirect_form: false });

/* --------------------------- HubEduConnect ------------------------- */

export const bordeaux: ENTFunction = (username, password, opts) => hubeduconnect(username, password, opts);

/* ----------------------------- Oze ENT ------------------------------ */

// export const encHautsDeSeine = bind(ozeEnt, { url: "https://enc.hauts-de-seine.fr/" });

/* ---------------------------- Simple Auth --------------------------- */

export const atriumSud = bind(simpleAuth, {
  url: "https://www.atrium-sud.fr/connexion/login",
  form_attr: { id: "fm1" },
});
export const laclasseLyon = bind(simpleAuth, { url: "https://www.laclasse.com/sso/login" });
export const extranetCollegesSomme = bind(simpleAuth, {
  url: "http://www.colleges.cg80.fr/identification/identification.php",
});

/* ------------------------------ Complex ------------------------------ */

export { acRennes };
