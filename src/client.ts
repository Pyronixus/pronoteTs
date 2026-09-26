import { CookieJar } from "tough-cookie";
import { Communication, KeepAlive, prepareOnglets } from "./communication.js";
import { Encryption, sha256HexUpper } from "./crypto.js";
import {
  ChildNotFound,
  CryptoError,
  ExpiredObject,
  MFAError,
  ParsingError,
  PronoteAPIError,
  QRCodeDecryptError,
} from "./exceptions.js";
import * as dc from "./dataClasses.js";
import { Util } from "./resolver.js";

export type ENTFunction = (
  username: string,
  password: string,
  opts: { pronote_url?: string }
) => Promise<CookieJar>;

export type LoginMode = "normal" | "qr_code" | "token";

export interface ClientOptions {
  ent?: ENTFunction;
  mode?: LoginMode;
  uuid?: string;
  accountPin?: string;
  clientIdentifier?: string;
  deviceName?: string;
}

function frDateOnly(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Base class for every PRONOTE client. Handles the full login/session lifecycle. */
export class ClientBase {
  pronoteUrl: string;
  username: string;
  password: string;
  ent?: ENTFunction;
  loginMode: LoginMode;
  uuid: string;
  accountPin?: string;
  clientIdentifier?: string;
  deviceName?: string;

  communication!: Communication;
  encryption!: Encryption;
  attributes: Record<string, string> = {};
  funcOptions: any = {};
  parametresUtilisateur: any = {};
  info!: dc.ClientInfo;
  startDay!: Date;
  week = 0;
  logged_in = false;
  lastConnection: Date | null = null;
  periods_: dc.Period[] | null = null;

  protected _refreshing = false;
  protected _expired = false;
  private _ready: Promise<void>;

  constructor(pronoteUrl: string, username = "", password = "", opts: ClientOptions = {}) {
    if (!password.length && !username.length) {
      throw new PronoteAPIError(
        "Please provide login credentials. Cookies are None, and username and password are empty."
      );
    }

    this.ent = opts.ent;
    this.loginMode = opts.mode ?? "normal";
    if (this.loginMode !== "normal" && !opts.uuid) {
      throw new PronoteAPIError("UUID must not be empty");
    }
    this.uuid = opts.uuid ?? "";
    this.username = username;
    this.password = password;
    this.pronoteUrl = this.ent ? pronoteUrl.replace("login=true", "") : pronoteUrl;
    this.accountPin = opts.accountPin;
    this.clientIdentifier = opts.clientIdentifier;
    this.deviceName = opts.deviceName;

    this._ready = this._init();
  }

  /** Resolves once the client has finished the handshake, login and initial state fetch. */
  ready(): Promise<this> {
    return this._ready.then(() => this);
  }

  private async _init(): Promise<void> {
    const cookieJar = this.ent ? await this.ent(this.username, this.password, { pronote_url: this.pronoteUrl }) : undefined;
    this.communication = new Communication(this.pronoteUrl, cookieJar, this.loginMode !== "normal");

    const [attributes, funcOptions] = await this.communication.initialise(this.clientIdentifier);
    this.attributes = attributes;
    this.funcOptions = funcOptions;

    if (!this.clientIdentifier) {
      this.clientIdentifier = (funcOptions as any).dataSec.data.identifiantNav;
    }

    this.encryption = new Encryption();
    this.encryption.aesIv = this.communication.encryption.aesIv;

    this.startDay = Util.dateParse((funcOptions as any).dataSec.data.General.PremierLundi.V);
    this.week = this.getWeek(new Date());

    this.periods_ = this.periods;
    this.logged_in = await this._login();
  }

  /** Preferred entry point: constructs the client and waits for login to complete. */
  static async login<T extends typeof ClientBase>(
    this: T,
    pronoteUrl: string,
    username: string,
    password: string,
    opts: ClientOptions = {}
  ): Promise<InstanceType<T>> {
    const client = new (this as any)(pronoteUrl, username, password, opts) as InstanceType<T>;
    await (client as unknown as ClientBase).ready();
    return client;
  }

  static async qrcodeLogin<T extends typeof ClientBase>(
    this: T,
    qrCode: { login: string; jeton: string; url: string },
    pin: string,
    uuid: string,
    opts: { accountPin?: string; clientIdentifier?: string; deviceName?: string; skip2fa?: boolean } = {}
  ): Promise<InstanceType<T>> {
    const encryption = new Encryption();
    encryption.aesSetKey(Buffer.from(pin, "utf8"));

    const shortToken = Buffer.from(qrCode.login, "hex");
    const longToken = Buffer.from(qrCode.jeton, "hex");

    let login: string, jeton: string;
    try {
      login = encryption.aesDecrypt(shortToken).toString("utf8");
      jeton = encryption.aesDecrypt(longToken).toString("utf8");
    } catch (ex) {
      if (ex instanceof CryptoError) throw new QRCodeDecryptError("invalid confirmation code");
      throw ex;
    }

    const url = new URL(qrCode.url);
    const parts = url.pathname.split("/");
    if (!parts[parts.length - 1].startsWith("mobile.")) {
      parts[parts.length - 1] = "mobile." + parts[parts.length - 1];
    }
    url.pathname = parts.join("/");
    url.search = "?fd=1&bydlg=A6ABB224-12DD-4E31-AD3E-8A39A1C2C335&login=true";
    url.hash = "";

    const client = new (this as any)(url.toString(), login, jeton, {
      mode: "qr_code",
      uuid,
      accountPin: opts.accountPin,
      clientIdentifier: opts.clientIdentifier,
      deviceName: opts.deviceName,
    }) as InstanceType<T>;
    await (client as unknown as ClientBase).ready();
    (client as unknown as ClientBase).loginMode = "token";

    if (!opts.skip2fa) {
      const base = client as unknown as ClientBase;
      const resp = await base.post("PageInfosPerso", 49);
      const mode = resp.dataSec.data.securisation?.mode ?? 0;
      if (mode === 0) {
        return client;
      }
      const creds = base.exportCredentials();
      return (this as any).tokenLogin(creds.pronoteUrl, creds.username, creds.password, creds.uuid, {
        accountPin: opts.accountPin,
        clientIdentifier: creds.clientIdentifier,
        deviceName: opts.deviceName,
      }) as InstanceType<T>;
    }

    return client;
  }

  static async tokenLogin<T extends typeof ClientBase>(
    this: T,
    pronoteUrl: string,
    username: string,
    password: string,
    uuid: string,
    opts: { accountPin?: string; clientIdentifier?: string; deviceName?: string } = {}
  ): Promise<InstanceType<T>> {
    const client = new (this as any)(pronoteUrl, username, password, {
      mode: "token",
      uuid,
      accountPin: opts.accountPin,
      clientIdentifier: opts.clientIdentifier,
      deviceName: opts.deviceName,
    }) as InstanceType<T>;
    await (client as unknown as ClientBase).ready();
    return client;
  }

  private async _login(): Promise<boolean> {
    const username = this.ent ? this.attributes["e"] : this.username;
    const password = this.ent ? this.attributes["f"] : this.password;

    const identJson = {
      genreConnexion: 0,
      genreEspace: parseInt(this.attributes["a"], 10),
      identifiant: username,
      pourENT: Boolean(this.ent),
      enConnexionAuto: false,
      demandeConnexionAuto: false,
      demandeConnexionAppliMobile: this.loginMode === "qr_code",
      demandeConnexionAppliMobileJeton: this.loginMode === "qr_code",
      enConnexionAppliMobile: this.loginMode === "token",
      uuidAppliMobile: this.loginMode === "qr_code" || this.loginMode === "token" ? this.uuid : "",
      loginTokenSAV: "",
    };
    const idr = await this.post("Identification", undefined, identJson);

    const challenge = idr.dataSec.data.challenge as string;
    const e = new Encryption();
    e.aesSetIv(this.communication.encryption.aesIv);

    let uname = username;
    let pwd = password;

    if (this.ent) {
      const motdepasse = sha256HexUpper(String(pwd));
      e.aesSetKey(Buffer.from(motdepasse, "utf8"));
    } else {
      if (idr.dataSec.data.modeCompLog) uname = uname.toLowerCase();
      if (idr.dataSec.data.modeCompMdp) pwd = pwd.toLowerCase();
      const alea = idr.dataSec.data.alea ?? "";
      const motdepasse = sha256HexUpper(alea + pwd);
      e.aesSetKey(Buffer.from(uname + motdepasse, "utf8"));
    }

    let ch: string;
    try {
      ch = e.aesEncrypt(Buffer.from(challenge, "utf8")).toString("hex");
    } catch (ex) {
      if (ex instanceof CryptoError) {
        const hint =
          this.loginMode === "qr_code"
            ? "exception happened during login -> probably the qr code has expired (qr code is valid during 10 minutes)"
            : "exception happened during login -> probably bad username/password";
        (ex as Error).message += ` | ${hint}`;
      }
      throw ex;
    }

    const authJson = { connexion: 0, challenge: ch, espace: parseInt(this.attributes["a"], 10) };
    const authResponse = await this.post("Authentification", undefined, authJson);

    if ("cle" in authResponse.dataSec.data) {
      await this.communication.afterAuth(authResponse, e.aesKey);
      this.encryption.aesKey = e.aesKey;

      const actionsDoubleAuth = authResponse.dataSec.data.actionsDoubleAuth;
      if (actionsDoubleAuth) {
        const actions: number[] = JSON.parse(actionsDoubleAuth.V);
        const doRegisterDevice = actions.includes(5) || actions.includes(3);
        const doVerifyPin = actions.includes(3);
        await this._do2fa(doVerifyPin, doRegisterDevice, this.accountPin, this.deviceName);
      }

      const lastConn = authResponse.dataSec.data.derniereConnexion;
      this.lastConnection = lastConn ? Util.datetimeParse(lastConn.V) : null;

      if (
        (this.loginMode === "qr_code" || this.loginMode === "token") &&
        authResponse.dataSec.data.jetonConnexionAppliMobile
      ) {
        this.password = authResponse.dataSec.data.jetonConnexionAppliMobile;
      }

      this.parametresUtilisateur = await this.post("ParametresUtilisateur");
      this.info = new dc.ClientInfo(this, this.parametresUtilisateur.dataSec.data.ressource);
      this.communication.authorizedOnglets = prepareOnglets(
        this.parametresUtilisateur.dataSec.data.listeOnglets
      );
      return true;
    }
    return false;
  }

  private async _do2fa(
    doVerifyPin: boolean,
    doRegisterDevice: boolean,
    pin?: string,
    identifier?: string
  ): Promise<void> {
    let encryptedPin: string | undefined;

    if (doVerifyPin) {
      if (pin === undefined) throw new MFAError("PIN is required for this account");
      encryptedPin = this.communication.encryption.aesEncrypt(Buffer.from(pin, "utf8")).toString("hex");
      const resp = await this.post("SecurisationCompteDoubleAuth", undefined, {
        action: 0,
        codePin: encryptedPin,
      });
      if (!resp.dataSec.data.result) throw new MFAError("Invalid PIN");
    }

    if (doRegisterDevice) {
      if (identifier === undefined) throw new MFAError("A device identifier is required for this account");
      const data: Record<string, unknown> = {
        action: 3,
        avecIdentification: true,
        strIdentification: identifier,
      };
      if (encryptedPin) data.codePin = encryptedPin;
      await this.post("SecurisationCompteDoubleAuth", undefined, data);
    }
  }

  exportCredentials(): { pronoteUrl: string; username: string; password: string; clientIdentifier?: string; uuid: string } {
    return {
      pronoteUrl: this.pronoteUrl,
      username: this.username,
      password: this.password,
      clientIdentifier: this.clientIdentifier,
      uuid: this.uuid,
    };
  }

  getWeek(date: Date): number {
    const start = this.startDay;
    const days = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
    return 1 + Math.floor(days / 7);
  }

  get periods(): dc.Period[] {
    if (this.periods_ && this.periods_.length) return this.periods_;
    const json = this.funcOptions.dataSec.data.General.ListePeriodes;
    return json.map((j: any) => new dc.Period(this, j));
  }

  /** Returns a controller to keep the connection alive via periodic pings. Call `.start()`/`.stop()`. */
  keepAlive(): KeepAlive {
    return new KeepAlive(this);
  }

  async refresh(): Promise<void> {
    const cookieJar = this.ent ? await this.ent(this.username, this.password, { pronote_url: this.pronoteUrl }) : undefined;
    this.communication = new Communication(this.pronoteUrl, cookieJar, this.loginMode !== "normal");
    const [attributes, funcOptions] = await this.communication.initialise(this.clientIdentifier);
    this.attributes = attributes;
    this.funcOptions = funcOptions;

    this.encryption = new Encryption();
    this.encryption.aesIv = this.communication.encryption.aesIv;
    await this._login();
    this.periods_ = null;
    this.periods_ = this.periods;
    this.week = this.getWeek(new Date());
    this._expired = true;
  }

  async sessionCheck(): Promise<boolean> {
    await this.post("Navigation", 7, { onglet: 7, ongletPrec: 7 });
    if (this._expired) {
      this._expired = false;
      return true;
    }
    return false;
  }

  async post(functionName: string, onglet?: number, data?: Record<string, unknown>): Promise<any> {
    const postData: Record<string, unknown> = {};
    if (onglet) postData.Signature = { onglet };
    if (data) postData.data = data;

    try {
      return await this.communication.post(functionName, postData);
    } catch (e) {
      if (e instanceof ExpiredObject) throw e;
      if (!(e instanceof PronoteAPIError)) throw e;

      if (this._refreshing) throw e;
      this._refreshing = true;
      try {
        await this.refresh();
      } finally {
        this._refreshing = false;
      }
      return this.communication.post(functionName, postData);
    }
  }

  async requestQrCodeData(pin: string): Promise<Record<string, unknown>> {
    const req = await this.post("JetonAppliMobile", 7, { code: pin });
    return {
      url: this.pronoteUrl.replace(/\/(?:mobile\.)?(\w+)\.html$/, "/mobile.$1.html"),
      ...req.dataSec.data,
    };
  }
}

// ---------------------------------------------------------------------------
/** A student PRONOTE client. */
export class Client extends ClientBase {
  async lessons(dateFrom: Date, dateTo?: Date): Promise<dc.Lesson[]> {
    const user = this.parametresUtilisateur.dataSec.data.ressource;
    const data: Record<string, unknown> = {
      ressource: user,
      avecAbsencesEleve: false,
      avecConseilDeClasse: true,
      estEDTPermanence: false,
      avecAbsencesRessource: true,
      avecDisponibilites: true,
      avecInfosPrefsGrille: true,
      Ressource: user,
    };
    const output: dc.Lesson[] = [];

    const from = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 0, 0, 0);
    const to = dateTo
      ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999)
      : new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 23, 59, 59, 999);

    const firstWeek = this.getWeek(from);
    const lastWeek = this.getWeek(to);

    for (let week = firstWeek; week <= lastWeek; week++) {
      data.NumeroSemaine = week;
      data.numeroSemaine = week;
      const response = await this.post("PageEmploiDuTemps", 16, data);
      for (const lesson of response.dataSec.data.ListeCours) {
        output.push(new dc.Lesson(this, lesson));
      }
    }
    return output.filter((l) => l.start >= from && l.start <= to);
  }

  async exportIcal(): Promise<string> {
    const response = await this.post("PageInfosPerso", 16);
    let icalParams: any;
    try {
      icalParams = response.dataSec.data.iCal.liste.V[0];
    } catch (e) {
      throw new ParsingError("Could not parse ICal params", response, ["dataSec", "data", "iCal", "liste", "V"]);
    }
    const ical = icalParams.paramICal;
    const suppl = icalParams.paramSuppl;
    const ver = this.funcOptions.dataSec.data.General.versionPN;
    return `${this.communication.rootSite}/ical/mesinformations.ics?icalsecurise=${ical}&version=${ver}&param=${suppl}`;
  }

  async homework(dateFrom: Date, dateTo?: Date): Promise<dc.Homework[]> {
    const to = dateTo ?? Util.dateParse(this.funcOptions.dataSec.data.General.DerniereDate.V);
    const jsonData = {
      domaine: { _T: 8, V: `[${this.getWeek(dateFrom)}..${this.getWeek(to)}]` },
    };
    const response = await this.post("PageCahierDeTexte", 88, jsonData);
    const out: dc.Homework[] = [];
    for (const h of response.dataSec.data.ListeTravauxAFaire.V) {
      const hw = new dc.Homework(this, h);
      if (hw.date >= dateFrom && hw.date <= to) out.push(hw);
    }
    return out;
  }

  async generateTimetablePdf(
    opts: { day?: Date; portrait?: boolean; overflow?: 0 | 1 | 2; fontSize?: [number, number] } = {}
  ): Promise<string> {
    const { day, portrait = false, overflow = 0, fontSize = [8, 3] } = opts;
    const user = { G: 4, N: this.parametresUtilisateur.dataSec.data.ressource.N };
    const data = {
      options: {
        portrait,
        taillePolice: fontSize[0],
        taillePoliceMin: fontSize[1],
        couleur: 1,
        renvoi: overflow,
        uneGrilleParSemaine: false,
        inversionGrille: false,
        ignorerLesPlagesSansCours: false,
        estEDTAnnuel: day === undefined,
      },
      genreGenerationPDF: 0,
      estPlanning: false,
      estPlanningParRessource: false,
      estPlanningOngletParJour: false,
      estPlanningParJour: false,
      indiceJour: 0,
      ressource: user,
      ressources: [user],
      domaine: { _T: 8, V: `[${day ? this.getWeek(day) : 0}]` },
      avecCoursAnnules: true,
      grilleInverse: false,
    };
    const response = await this.post("GenerationPDF", 16, data);
    return `${this.communication.rootSite}/${response.dataSec.data.url.V}`;
  }

  async getRecipients(): Promise<dc.Recipient[]> {
    let recipients: any[] = (
      await this.post("ListeRessourcesPourCommunication", 131, { onglet: { N: 0, G: 3 } })
    ).dataSec.data.listeRessourcesPourCommunication.V;
    recipients = recipients.concat(
      (await this.post("ListeRessourcesPourCommunication", 131, { onglet: { N: 0, G: 34 } })).dataSec.data
        .listeRessourcesPourCommunication.V
    );
    return recipients.map((r) => new dc.Recipient(this, r));
  }

  async getTeachingStaff(): Promise<dc.TeachingStaff[]> {
    const teachers = (await this.post("PageEquipePedagogique", 37)).dataSec.data.liste.V;
    return teachers.map((t: any) => new dc.TeachingStaff(t));
  }

  async newDiscussion(subject: string, message: string, recipients: dc.Recipient[]): Promise<void> {
    const recipientsJson = recipients.map((r) => ({ N: r.id, G: r._type, L: r.name }));
    await this.post("SaisieMessage", 131, {
      objet: subject,
      contenu: message,
      listeDestinataires: recipientsJson,
    });
  }

  async discussions(onlyUnread = false): Promise<dc.Discussion[]> {
    const discussions = await this.post("ListeMessagerie", 131, {
      avecMessage: true,
      avecLu: !onlyUnread,
    });
    const labels: Record<string, number> = {};
    for (const l of discussions.dataSec.data.listeEtiquettes.V) labels[l.N] = l.G;

    return discussions.dataSec.data.listeMessagerie.V
      .filter((d: any) => d.estUneDiscussion && (d.profondeur ?? 1) === 0)
      .map((d: any) => new dc.Discussion(this, d, labels));
  }

  async informationAndSurveys(
    opts: { dateFrom?: Date; dateTo?: Date; onlyUnread?: boolean } = {}
  ): Promise<dc.Information[]> {
    const response = await this.post("PageActualites", 8, { modesAffActus: { _T: 26, V: "[0..3]" } });
    let info: dc.Information[] = [];
    for (const liste of response.dataSec.data.listeModesAff) {
      info.push(...liste.listeActualites.V.map((i: any) => new dc.Information(this, i)));
    }
    if (opts.onlyUnread) info = info.filter((i) => !i.read);
    if (opts.dateFrom) info = info.filter((i) => i.startDate !== undefined && opts.dateFrom! <= i.startDate);
    if (opts.dateTo) info = info.filter((i) => i.startDate !== undefined && i.startDate < opts.dateTo!);
    return info;
  }

  async menus(dateFrom: Date, dateTo?: Date): Promise<dc.Menu[]> {
    const output: dc.Menu[] = [];
    const to = dateTo ?? dateFrom;
    const day = (dateFrom.getDay() + 6) % 7; // Monday = 0
    let firstDay = new Date(dateFrom);
    firstDay.setDate(firstDay.getDate() - day);

    while (firstDay <= to) {
      const data = { date: { _T: 7, V: `${frDateOnly(firstDay)} 0:0:0` } };
      const response = await this.post("PageMenus", 10, data);
      for (const dayJson of response.dataSec.data.ListeJours.V) {
        for (const menu of dayJson.ListeRepas.V) {
          menu.Date = dayJson.Date;
          output.push(new dc.Menu(this, menu));
        }
      }
      firstDay = new Date(firstDay.getTime() + 7 * 86400000);
    }
    return output.filter((m) => m.date >= dateFrom && m.date <= to);
  }

  async currentPeriod(): Promise<dc.Period> {
    const onglets = this.parametresUtilisateur.dataSec.data.ressource.listeOngletsPourPeriodes.V;
    const onglet = onglets.find((x: any) => x.G === 198) ?? onglets[0];
    const idPeriod = onglet.periodeParDefaut.V.N;
    return Util.get(this.periods, { id: idPeriod } as any)[0];
  }
}

// ---------------------------------------------------------------------------
/** A parent PRONOTE client, with access to one or more children. */
export class ParentClient extends Client {
  children: dc.ClientInfo[] = [];
  private _selectedChild!: dc.ClientInfo;

  protected async _afterLogin(): Promise<void> {
    this.children = this.parametresUtilisateur.dataSec.data.ressource.listeRessources.map(
      (c: any) => new dc.ClientInfo(this, c)
    );
    if (!this.children.length) throw new ChildNotFound("No children were found.");
    this._selectedChild = this.children[0];
    this.parametresUtilisateur.dataSec.data.ressource = this._selectedChild.rawResource;
  }

  ready(): Promise<this> {
    return super.ready().then(async (c) => {
      await (c as unknown as ParentClient)._afterLogin();
      return c;
    });
  }

  setChild(child: string | dc.ClientInfo): void {
    let c: dc.ClientInfo | undefined;
    if (typeof child === "string") {
      c = this.children.find((x) => x.name === child);
    } else {
      c = child;
    }
    if (!c) throw new ChildNotFound(`A child with the name ${child} was not found.`);
    this._selectedChild = c;
    this.parametresUtilisateur.dataSec.data.ressource = this._selectedChild.rawResource;
  }

  override async post(functionName: string, onglet?: number, data?: Record<string, unknown>): Promise<any> {
    const postData: Record<string, unknown> = {};
    if (onglet) postData.Signature = { onglet, membre: { N: this._selectedChild.id, G: 4 } };
    if (data) postData.data = data;

    try {
      return await this.communication.post(functionName, postData);
    } catch (e) {
      if (e instanceof ExpiredObject) throw e;
      if (!(e instanceof PronoteAPIError)) throw e;
      await this.refresh();
      return this.communication.post(functionName, postData);
    }
  }
}

// ---------------------------------------------------------------------------
/** A PRONOTE client for "Vie Scolaire" (school life staff) accounts. */
export class VieScolaireClient extends ClientBase {
  classes: dc.StudentClass[] = [];

  protected async _afterLogin(): Promise<void> {
    this.classes = this.parametresUtilisateur.dataSec.data.listeClasses.V.map(
      (json: any) => new dc.StudentClass(this, json)
    );
  }

  ready(): Promise<this> {
    return super.ready().then(async (c) => {
      await (c as unknown as VieScolaireClient)._afterLogin();
      return c;
    });
  }
}
