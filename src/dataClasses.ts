import { PronoteObject, Resolver, Util, str, num, bool, noop } from "./resolver.js";
import { DataError, DiscussionClosed, ParsingError, UnsupportedOperation } from "./exceptions.js";
import { Communication } from "./communication.js";

/**
 * Structural shape a `ClientBase` must satisfy for data classes to fetch
 * follow-up data lazily (grades, reports, replies, file downloads...).
 * `client.ts` implements this; kept here to avoid a circular import.
 */
export interface ClientBaseLike {
  post(functionName: string, onglet?: number, data?: Record<string, unknown>): Promise<any>;
  communication: Communication;
  attributes: Record<string, string>;
  funcOptions: any;
  periods: Period[];
  getWeek(date: Date): number;
  info: { id: string };
}

function getL(d: any): string {
  return d.L;
}

// ---------------------------------------------------------------------------
export class Subject extends PronoteObject {
  id: string;
  name: string;
  groups: boolean;

  constructor(json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.name = this.r(str, ["L"]);
    this.groups = this.r(bool, ["estServiceGroupe"], { default: false });
  }
}

// ---------------------------------------------------------------------------
export class Report extends PronoteObject {
  static ReportSubject = class ReportSubject extends PronoteObject {
    id: string;
    name: string;
    color: string;
    comments: string[];
    classAverage?: string;
    studentAverage?: string;
    minAverage?: string;
    maxAverage?: string;
    coefficient?: string;
    teachers: string[];

    constructor(json: any) {
      super(json);
      const gradeOrNone = (g: any) => (g ? Util.gradeParse(g) : undefined);
      this.id = this.r(str, ["N"]);
      this.name = this.r(str, ["L"]);
      this.color = this.r(str, ["couleur"]);
      this.comments = this.r((l: any[]) => l.filter((c) => "L" in c).map((c) => c.L), ["ListeAppreciations", "V"]);
      this.classAverage = this.r(gradeOrNone, ["MoyenneClasse", "V"], { strict: false });
      this.studentAverage = this.r(gradeOrNone, ["MoyenneEleve", "V"], { strict: false });
      this.minAverage = this.r(gradeOrNone, ["MoyenneInf", "V"], { strict: false });
      this.maxAverage = this.r(gradeOrNone, ["MoyenneSup", "V"], { strict: false });
      this.coefficient = this.r(str, ["Coefficient", "V"], { strict: false });
      this.teachers = this.r((l: any[]) => l.map((i) => i.L), ["ListeProfesseurs", "V"], { default: [] });
    }
  };

  subjects: InstanceType<typeof Report.ReportSubject>[];
  comments: string[];

  constructor(json: any) {
    super(json);
    this.subjects = this.r((l: any[]) => l.map((s) => new Report.ReportSubject(s)), ["ListeServices", "V"], {
      default: [],
    });
    this.comments = this.r(
      (l: any[]) => l.filter((c) => "L" in c).map((c) => c.L),
      ["ObjetListeAppreciations", "V", "ListeAppreciations", "V"],
      { default: [] }
    );
  }
}

// ---------------------------------------------------------------------------
export class Absence extends PronoteObject {
  id: string;
  fromDate: Date;
  toDate: Date;
  justified: boolean;
  hours?: string;
  days: number;
  reasons: string[];

  constructor(json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.fromDate = this.r(Util.datetimeParse, ["dateDebut", "V"]);
    this.toDate = this.r(Util.datetimeParse, ["dateFin", "V"]);
    this.justified = this.r(bool, ["justifie"], { default: false });
    this.hours = this.r(str, ["NbrHeures"], { strict: false });
    this.days = this.r(num, ["NbrJours"], { default: 0 });
    this.reasons = this.r((l: any[]) => l.map((i) => i.L), ["listeMotifs", "V"], { default: [] });
  }
}

// ---------------------------------------------------------------------------
export class Delay extends PronoteObject {
  id: string;
  date: Date;
  minutes: number;
  justified: boolean;
  justification?: string;
  reasons: string[];

  constructor(json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.date = this.r(Util.datetimeParse, ["date", "V"]);
    this.minutes = this.r(num, ["duree"], { default: 0 });
    this.justified = this.r(bool, ["justifie"], { default: false });
    this.justification = this.r(str, ["justification"], { strict: false });
    this.reasons = this.r((l: any[]) => l.map((i) => i.L), ["listeMotifs", "V"], { default: [] });
  }
}

// ---------------------------------------------------------------------------
export class Period extends PronoteObject {
  static instances = new Set<Period>();

  id: string;
  name: string;
  start: Date;
  end: Date;
  private _client: ClientBaseLike;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    Period.instances.add(this);
    this._client = client;

    this.id = this.r(str, ["N"]);
    this.name = this.r(str, ["L"]);
    this.start = this.r(Util.datetimeParse, ["dateDebut", "V"]);
    this.end = this.r(Util.datetimeParse, ["dateFin", "V"]);
  }

  /** Gets a report from this period. `null` when not yet published. */
  async report(): Promise<Report | null> {
    const jsonData = { periode: { G: 2, N: this.id, L: this.name } };
    const data = (await this._client.post("PageBulletins", 13, jsonData)).dataSec.data;
    return "Message" in data ? null : new Report(data);
  }

  async grades(): Promise<Grade[]> {
    const jsonData = { Periode: { N: this.id, L: this.name } };
    const response = await this._client.post("DernieresNotes", 198, jsonData);
    const grades = response.dataSec.data.listeDevoirs.V;
    return grades.map((g: any) => new Grade(g));
  }

  async averages(): Promise<Average[]> {
    const jsonData = { Periode: { N: this.id, L: this.name } };
    const response = await this._client.post("DernieresNotes", 198, jsonData);
    const crs = response.dataSec.data.listeServices.V;
    try {
      return crs.map((c: any) => new Average(c));
    } catch (e) {
      if (e instanceof ParsingError && e.path.join(",") === "moyEleve,V") {
        throw new UnsupportedOperation("Could not get averages");
      }
      throw e;
    }
  }

  async overallAverage(): Promise<string> {
    const jsonData = { Periode: { N: this.id, L: this.name } };
    const response = await this._client.post("DernieresNotes", 198, jsonData);
    const average = response.dataSec.data.moyGenerale;
    if (average) return average.V;
    const services = response.dataSec.data.listeServices.V;
    if (services.length) {
      let a = 0;
      let total = 0;
      for (const s of services) {
        if (!("moyEleve" in s)) throw new UnsupportedOperation("Could not get averages");
        const avrg = String(s.moyEleve.V).replace(",", ".");
        const flt = parseFloat(avrg);
        if (!Number.isNaN(flt)) {
          a += flt;
          total += 1;
        }
      }
      return String(total ? Math.round((a / total) * 100) / 100 : -1);
    }
    return "-1";
  }

  async classOverallAverage(): Promise<string | null> {
    const jsonData = { Periode: { N: this.id, L: this.name } };
    const response = await this._client.post("DernieresNotes", 198, jsonData);
    const average = response.dataSec.data.moyGeneraleClasse;
    return average ? average.V : null;
  }

  async evaluations(): Promise<Evaluation[]> {
    const jsonData = { periode: { N: this.id, L: this.name, G: 2 } };
    const response = await this._client.post("DernieresEvaluations", 201, jsonData);
    return response.dataSec.data.listeEvaluations.V.map((e: any) => new Evaluation(e));
  }

  async absences(): Promise<Absence[]> {
    const jsonData = {
      periode: { N: this.id, L: this.name, G: 2 },
      DateDebut: { _T: 7, V: frDateTime(this.start) },
      DateFin: { _T: 7, V: frDateTime(this.end) },
    };
    const response = await this._client.post("PagePresence", 19, jsonData);
    return response.dataSec.data.listeAbsences.V.filter((a: any) => a.G === 13).map((a: any) => new Absence(a));
  }

  async delays(): Promise<Delay[]> {
    const jsonData = {
      periode: { N: this.id, L: this.name, G: 2 },
      DateDebut: { _T: 7, V: frDateTime(this.start) },
      DateFin: { _T: 7, V: frDateTime(this.end) },
    };
    const response = await this._client.post("PagePresence", 19, jsonData);
    return response.dataSec.data.listeAbsences.V.filter((a: any) => a.G === 14).map((a: any) => new Delay(a));
  }

  async punishments(): Promise<Punishment[]> {
    const jsonData = {
      periode: { N: this.id, L: this.name, G: 2 },
      DateDebut: { _T: 7, V: frDateTime(this.start) },
      DateFin: { _T: 7, V: frDateTime(this.end) },
    };
    const response = await this._client.post("PagePresence", 19, jsonData);
    return response.dataSec.data.listeAbsences.V.filter((a: any) => a.G === 41).map(
      (a: any) => new Punishment(this._client, a)
    );
  }
}

export function frDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function frDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${frDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
export class Average extends PronoteObject {
  student: string;
  outOf: string;
  defaultOutOf: string;
  classAverage: string;
  min: string;
  max: string;
  subject: Subject;
  backgroundColor?: string;

  constructor(json: any) {
    super(json);
    this.student = this.r(Util.gradeParse, ["moyEleve", "V"]);
    this.outOf = this.r(Util.gradeParse, ["baremeMoyEleve", "V"]);
    this.defaultOutOf = this.r(Util.gradeParse, ["baremeMoyEleveParDefault", "V"], { default: "" });
    this.classAverage = this.r(Util.gradeParse, ["moyClasse", "V"]);
    this.min = this.r(Util.gradeParse, ["moyMin", "V"]);
    this.max = this.r(Util.gradeParse, ["moyMax", "V"]);
    this.subject = new Subject(json);
    this.backgroundColor = this.r(str, ["couleur"], { strict: false });
  }
}

// ---------------------------------------------------------------------------
export class Grade extends PronoteObject {
  id: string;
  grade: string;
  outOf: string;
  defaultOutOf?: string;
  date: Date;
  subject: Subject;
  period?: Period;
  average?: string;
  max?: string;
  min?: string;
  coefficient?: string;
  comment?: string;
  isBonus: boolean;
  isOptionnal: boolean;
  isOutOf20: boolean;

  constructor(json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.grade = this.r(Util.gradeParse, ["note", "V"]);
    this.outOf = this.r(Util.gradeParse, ["bareme", "V"]);
    this.defaultOutOf = this.r(Util.gradeParse, ["baremeParDefaut", "V"], { strict: false });
    this.date = this.r(Util.dateParse, ["date", "V"]);
    this.subject = this.r((v: any) => new Subject(v), ["service", "V"]);
    this.period = this.r((n: string) => [...Period.instances].filter((p) => p.id === n)[0], ["periode", "V", "N"], {
      strict: false,
    });
    this.average = this.r(Util.gradeParse, ["moyenne", "V"], { strict: false });
    this.max = this.r(Util.gradeParse, ["noteMax", "V"], { strict: false });
    this.min = this.r(Util.gradeParse, ["noteMin", "V"], { strict: false });
    this.coefficient = this.r(str, ["coefficient"], { strict: false });
    this.comment = this.r(str, ["commentaire"], { strict: false });
    this.isBonus = this.r(bool, ["estBonus"], { default: false });
    this.isOptionnal = this.r(bool, ["estFacultatif"], { default: false }) && !this.isBonus;
    this.isOutOf20 = this.r(bool, ["estRamenerSur20"], { default: false });
  }

  toDict(): Record<string, unknown> {
    return super.toDict(new Set(["period"]));
  }
}

function pkcs7Pad(data: Buffer, blockSize = 16): Buffer {
  const padLen = blockSize - (data.length % blockSize);
  return Buffer.concat([data, Buffer.alloc(padLen, padLen)]);
}

// ---------------------------------------------------------------------------
export class Attachment extends PronoteObject {
  name: string;
  id: string;
  type: number; // 0 link, 1 file
  url: string;
  private _client: ClientBaseLike;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;

    this.name = this.r(str, ["L"], { default: "" });
    this.id = this.r(str, ["N"]);
    this.type = this.r(num, ["G"]);

    if (this.type === 0) {
      const url = this.r(str, ["url"], { default: undefined });
      this.url = url ?? this.name;
    } else {
      const padded = pkcs7Pad(Buffer.from(JSON.stringify({ N: this.id, Actif: true }).replace(/ /g, ""), "utf8"));
      const magic = client.communication.encryption.aesEncrypt(padded).toString("hex");
      this.url = `${client.communication.rootSite}/FichiersExternes/${magic}/${encodeURIComponent(this.name)}?Session=${client.attributes["h"]}`;
    }
  }

  /** Downloads the raw file bytes. */
  async data(): Promise<Buffer> {
    const response = await this._client.communication.session.get(this.url);
    return response.content;
  }

  /** Downloads and writes the file to disk (Node only). */
  async save(filePath?: string): Promise<void> {
    if (this.type !== 1) return;
    const response = await this._client.communication.session.get(this.url);
    if (response.status !== 200) {
      throw new Error("The file was not found on pronote. The url may be badly formed.");
    }
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath ?? this.name, response.content);
  }
}

// ---------------------------------------------------------------------------
export class LessonContent extends PronoteObject {
  title?: string;
  description?: string;
  category?: string;
  private _client: ClientBaseLike;
  private _files: any[];

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;
    this.title = this.r(str, ["L"], { strict: false });
    this.description = this.r(Util.htmlParse, ["descriptif", "V"], { strict: false });
    this.category = this.r(str, ["categorie", "V", "L"], { strict: false });
    this._files = this.r((v: any[]) => v, ["ListePieceJointe", "V"]);
  }

  files(): Attachment[] {
    return this._files.map((f) => new Attachment(this._client, f));
  }
}

// ---------------------------------------------------------------------------
export class Lesson extends PronoteObject {
  id: string;
  canceled: boolean;
  status?: string;
  memo?: string;
  backgroundColor?: string;
  outing: boolean;
  start: Date;
  exempted: boolean;
  virtualClassrooms: string[];
  num: number;
  detention: boolean;
  test: boolean;
  end!: Date;
  teacherNames: string[] = [];
  classrooms: string[] = [];
  groupNames: string[] = [];
  subject: Subject | null = null;
  teacherName: string | null = null;
  classroom: string | null = null;
  groupName: string | null = null;

  private _client: ClientBaseLike;
  private _content: LessonContent | null = null;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;

    this.id = this.r(str, ["N"]);
    this.canceled = this.r(bool, ["estAnnule"], { default: false });
    this.status = this.r(str, ["Statut"], { strict: false });
    this.memo = this.r(str, ["memo"], { strict: false });
    this.backgroundColor = this.r(str, ["CouleurFond"], { strict: false });
    this.outing = this.r(bool, ["estSortiePedagogique"], { default: false });
    this.start = this.r(Util.datetimeParse, ["DateDuCours", "V"]);
    this.exempted = this.r(bool, ["dispenseEleve"], { default: false });
    this.virtualClassrooms = this.r((l: any[]) => l.map((i) => i.url), ["listeVisios", "V"], { default: [] });
    this.num = this.r(num, ["P"], { default: 0 });
    this.detention = this.r(bool, ["estRetenue"], { default: false });
    this.test = this.r(bool, ["cahierDeTextes", "V", "estDevoir"], { default: false });

    const end = this.r(Util.datetimeParse, ["DateDuCoursFin", "V"], { strict: false });
    if (end) {
      this.end = end;
    } else {
      const endTimes = client.funcOptions.dataSec.data.General.ListeHeuresFin.V;
      const endPlace = (json.place % (endTimes.length - 1)) + json.duree - 1;
      const endTime = Util.place2time(endTimes, endPlace);
      const e = new Date(this.start);
      e.setHours(endTime.hour, endTime.minute, 0, 0);
      this.end = e;
    }

    if (!("ListeContenus" in json)) {
      throw new ParsingError("Error while parsing for lesson details", json, ["ListeContenus", "V"]);
    }
    for (const d of json.ListeContenus.V) {
      if (!("G" in d)) continue;
      if (d.G === 16) this.subject = new Subject(d);
      else if (d.G === 3) this.teacherNames.push(d.L);
      else if (d.G === 17) this.classrooms.push(d.L);
      else if (d.G === 2) this.groupNames.push(d.L);
    }
    this.teacherName = this.teacherNames.length ? this.teacherNames.join(", ") : null;
    this.classroom = this.classrooms.length ? this.classrooms.join(", ") : null;
    this.groupName = this.groupNames.length ? this.groupNames.join(", ") : null;
  }

  get normal(): boolean {
    return !this.detention && !this.outing;
  }

  /** Fetches the lesson's detailed content. May be `null` if there is no description. Makes a network request. */
  async content(): Promise<LessonContent | null> {
    if (this._content) return this._content;
    const week = this._client.getWeek(this.start);
    const data = { domaine: { _T: 8, V: `[${week}..${week}]` } };
    const response = await this._client.post("PageCahierDeTexte", 89, data);
    let contents: any = null;
    for (const lesson of response.dataSec.data.ListeCahierDeTextes.V) {
      if (lesson.cours.V.N === this.id && lesson.listeContenus.V.length) {
        contents = lesson.listeContenus.V[0];
        break;
      }
    }
    if (!contents) return null;
    this._content = new LessonContent(this._client, contents);
    return this._content;
  }
}

// ---------------------------------------------------------------------------
export class Homework extends PronoteObject {
  id: string;
  description: string;
  done: boolean;
  subject: Subject;
  date: Date;
  backgroundColor: string;
  private _client: ClientBaseLike;
  private _files: any[];

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;
    this.id = this.r(str, ["N"]);
    this.description = this.r(Util.htmlParse, ["descriptif", "V"]);
    this.done = this.r(bool, ["TAFFait"]);
    this.subject = this.r((v: any) => new Subject(v), ["Matiere", "V"]);
    this.date = this.r(Util.dateParse, ["PourLe", "V"]);
    this.backgroundColor = this.r(str, ["CouleurFond"]);
    this._files = this.r((v: any[]) => v, ["ListePieceJointe", "V"]);
  }

  async setDone(status: boolean): Promise<void> {
    await this._client.post("SaisieTAFFaitEleve", 88, { listeTAF: [{ N: this.id, TAFFait: status }] });
    this.done = status;
  }

  files(): Attachment[] {
    return this._files.map((f) => new Attachment(this._client, f));
  }
}

// ---------------------------------------------------------------------------
export class Information extends PronoteObject {
  id: string;
  title?: string;
  author: string;
  read: boolean;
  creationDate: Date;
  startDate?: Date;
  endDate?: Date;
  category: string;
  survey: boolean;
  template: boolean;
  sharedTemplate: boolean;
  anonymousResponse: boolean;

  private _client: ClientBaseLike;
  private _rawContent: any[] | null = null;
  private _content: string | null = null;
  private _attachments: Attachment[] | null = null;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;
    this.id = this.r(str, ["N"]);
    this.title = this.r(str, ["L"], { strict: false });
    this.author = this.r(str, ["auteur"]);
    this.read = this.r(bool, ["lue"]);
    this.creationDate = this.r(Util.datetimeParse, ["dateCreation", "V"]);
    this.startDate = this.r(Util.datetimeParse, ["dateDebut", "V"], { strict: false });
    this.endDate = this.r(Util.datetimeParse, ["dateFin", "V"], { strict: false });
    this.category = this.r(str, ["nature", "V", "L"]);
    this.survey = this.r(bool, ["estSondage"]);
    this.template = this.r(bool, ["estModele"], { default: false });
    this.sharedTemplate = this.r(bool, ["estModelePartage"], { default: false });
    this.anonymousResponse = this.r(bool, ["reponseAnonyme"]);
  }

  async content(): Promise<string> {
    await this.fetchContent();
    if (!this._rawContent) return "";
    if (this._content === null) this._content = Util.htmlParse(this._rawContent[0].texte.V);
    return this._content;
  }

  async attachments(): Promise<Attachment[]> {
    await this.fetchContent();
    if (this._attachments === null) {
      const attachments: Attachment[] = [];
      for (const question of this._rawContent ?? []) {
        for (const j of question.listePiecesJointes.V) attachments.push(new Attachment(this._client, j));
      }
      this._attachments = attachments;
    }
    return this._attachments;
  }

  private async fetchContent(): Promise<void> {
    if (this._rawContent !== null) return;
    const resp = await this._client.post("PageActualites", 8, {
      actualite: {
        N: this.id,
        genrePublic: 4,
        public: { N: this._client.info.id, G: 4 },
      },
      genreRequeteActualite: 1,
      modeAffActu: 0,
    });
    this._rawContent = resp.dataSec.data.detailsActualite.listeQuestions.V;
  }

  async markAsRead(status: boolean): Promise<void> {
    await this._client.post("SaisieActualites", 8, {
      listeActualites: [
        {
          N: this.id,
          validationDirecte: true,
          genrePublic: 4,
          public: { N: this._client.info.id, G: 4 },
          lue: status,
        },
      ],
      saisieActualite: false,
    });
    this.read = status;
  }
}

// ---------------------------------------------------------------------------
export class Recipient extends PronoteObject {
  id: string;
  name: string;
  type: "teacher" | "staff";
  email?: string;
  functions: string[];
  withDiscussion: boolean;
  /** @internal PRONOTE "G" discriminator, needed to build `new_discussion` payloads. */
  _type: number;

  constructor(_client: ClientBaseLike, json: any) {
    super(json);
    this._type = this.r(num, ["G"]);
    this.id = this.r(str, ["N"]);
    this.name = this.r(str, ["L"]);
    this.type = this._type === 3 ? "teacher" : "staff";
    this.email = this.r(str, ["email"], { strict: false });
    this.functions =
      this.type === "teacher"
        ? this.r((x: any[]) => x.map((r) => r.L), ["listeRessources", "V"])
        : this.r((f: string) => [f], ["fonction", "V", "L"], { default: [] });
    this.withDiscussion = this.r(bool, ["avecDiscussion"], { default: false });
  }
}

// ---------------------------------------------------------------------------
export class Message extends PronoteObject {
  id: string;
  content: string;
  author: string | null;
  seen: boolean;
  created: Date;
  /** @deprecated alias of `created` */
  date: Date;
  replyingTo: Message | null = null;

  private _client: ClientBaseLike;
  private _possession: string;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;
    this._possession = this.r(str, ["possessionMessage", "V", "N"]);
    this.id = this.r(str, ["N"]);
    this.author = this.r(bool, ["emetteur"], { default: false }) ? null : this.r(str, ["public_gauche"]);
    this.seen = this.r(bool, ["lu"], { default: false });
    this.created = this.r(Util.datetimeParse, ["date", "V"]);
    this.date = this.created;
    this.content = json.estHTML ? this.r(Util.htmlParse, ["contenu", "V"]) : this.r(str, ["contenu"]);
  }

  async recipients(): Promise<string[]> {
    const resp = await this._client.post("SaisiePublicMessage", 131, { message: { N: this.id } });
    return resp.dataSec.data.listeDest.V.map((r: any) => r.L);
  }

  async reply(message: string): Promise<void> {
    const resp = await this._client.post("ListeMessages", 131, {
      listePossessionsMessages: [{ N: this._possession }],
      message: { N: this.id },
    });
    if ((resp.dataSec.data.listeBoutons?.V ?? []).length === 0) {
      throw new DiscussionClosed("Cannot reply to discussion");
    }
    const msg = resp.dataSec.data.messagePourReponse.V;
    const button = resp.dataSec.data.listeBoutons.V[0];
    await this._client.post("SaisieMessage", 131, {
      messagePourReponse: msg,
      contenu: message,
      listeFichiers: [],
      bouton: button,
    });
  }
}

// ---------------------------------------------------------------------------
export class Discussion extends PronoteObject {
  id: string;
  subject: string;
  creator?: string;
  unread: number;
  closed: boolean;
  /** @deprecated use `closed` */
  close: boolean;
  labels: string[];
  /** @deprecated always `true` */
  replyable = true;

  private _client: ClientBaseLike;
  private _possessions: any[];
  private _participantsMessageId: string;
  private _dateCache: Date | null = null;

  constructor(client: ClientBaseLike, json: any, labels: Record<string, number>) {
    super(json);
    this._client = client;
    this._possessions = this.r(noop, ["listePossessionsMessages", "V"]);
    this.id = this.r(str, ["N"], { strict: false }) ?? "";
    this.subject = this.r(str, ["objet"]);
    this.creator = this.r(str, ["initiateur"], { strict: false });
    this._participantsMessageId = this.r(str, ["messagePourParticipants", "V", "N"]);
    this.unread = this.r(num, ["nbNonLus"], { default: 0 });
    this.closed = this.r(bool, ["ferme"], { default: false });
    this.close = this.closed;

    const labelsStr: Record<number, string> = { 4: "Drafts", 5: "Trash" };
    this.labels = this.r((l: any[]) => l.map((i) => labelsStr[labels[i.N]]), ["listeEtiquettes", "V"], {
      default: [],
    });
  }

  async participants(): Promise<string[]> {
    const resp = await this._client.post("SaisiePublicMessage", 131, {
      estDestinatairesReponse: false,
      estPublicParticipant: true,
      message: { N: this._participantsMessageId },
    });
    return resp.dataSec.data.listeDest.V.map((i: any) => i.L);
  }

  async messages(): Promise<Message[]> {
    const resp = await this._client.post("ListeMessages", 131, {
      listePossessionsMessages: this._possessions,
    });
    const messages = new Map<string, Message>();
    for (const messageJson of resp.dataSec.data.listeMessages.V) {
      const msg = new Message(this._client, messageJson);
      messages.set(msg.id, msg);
    }
    for (const messageJson of resp.dataSec.data.listeMessages.V) {
      messages.get(messageJson.N)!.replyingTo = messages.get(messageJson.messageSource.V.N) ?? null;
    }
    return [...messages.values()].sort((a, b) => a.created.getTime() - b.created.getTime());
  }

  /** Date the discussion was opened. Alias for `(await discussion.messages())[0].date`. */
  async date(): Promise<Date> {
    if (!this._dateCache) {
      const msgs = await this.messages();
      this._dateCache = msgs[0].date;
    }
    return this._dateCache;
  }

  async markAs(read: boolean): Promise<void> {
    await this._client.post("SaisieMessage", 131, {
      commande: "pourLu",
      lu: read,
      listePossessionsMessages: this._possessions,
    });
  }

  async reply(message: string): Promise<void> {
    if (this.closed) throw new DiscussionClosed("Cannot reply to discussion");
    const resp = await this._client.post("ListeMessages", 131, {
      listePossessionsMessages: this._possessions,
    });
    const msg = resp.dataSec.data.messagePourReponse.V;
    const button = resp.dataSec.data.listeBoutons.V[0];
    await this._client.post("SaisieMessage", 131, {
      messagePourReponse: msg,
      contenu: message,
      listeFichiers: [],
      bouton: button,
    });
  }

  async delete(): Promise<void> {
    await this._client.post("SaisieMessage", 131, {
      commande: "corbeille",
      listePossessionsMessages: this._possessions,
    });
  }
}

// ---------------------------------------------------------------------------
/** Info about a resource (a client). Mirrors `ClientInfo`. */
export class ClientInfo {
  id: string;
  rawResource: any;
  private _client: ClientBaseLike;
  private _cache: any = null;

  constructor(client: ClientBaseLike, json: any) {
    this.id = json.N;
    this.rawResource = json;
    this._client = client;
  }

  get name(): string {
    return this.rawResource.L;
  }

  get profilePicture(): Attachment | null {
    if (!this.rawResource.avecPhoto) return null;
    return new Attachment(this._client, { L: "photo.jpg", N: this.rawResource.N, G: 1 });
  }

  get delegue(): string[] {
    if (!this.rawResource.estDelegue) return [];
    return this.rawResource.listeClassesDelegue.V.map((c: any) => c.L);
  }

  get className(): string {
    return this.rawResource.classeDEleve?.L ?? "";
  }

  get establishment(): string {
    return this.rawResource.Etablissement?.V?.L ?? "";
  }

  private async cache(): Promise<any> {
    if (this._cache === null) {
      const resp = await this._client.communication.post("PageInfosPerso", {
        Signature: { onglet: 49, ressource: { N: this.id, G: 4 } },
      });
      this._cache = resp.dataSec.data.Informations;
    }
    return this._cache;
  }

  /** [line1, line2, line3, line4, postalCode, city, province, country] */
  async address(): Promise<[string, string, string, string, string, string, string, string]> {
    const c = await this.cache();
    return [c.adresse1, c.adresse2, c.adresse3, c.adresse4, c.codePostal, c.ville, c.province, c.pays];
  }

  async email(): Promise<string> {
    return (await this.cache()).eMail;
  }

  async phone(): Promise<string> {
    const c = await this.cache();
    return "+" + c.indicatifTel + c.telephonePortable;
  }

  async ineNumber(): Promise<string> {
    return (await this.cache()).numeroINE;
  }
}

// ---------------------------------------------------------------------------
export class Acquisition extends PronoteObject {
  id: string;
  level: string;
  abbreviation: string;
  coefficient: number;
  domain: string;
  domainId: string;
  name?: string;
  nameId?: string;
  order: number;
  pillar: string;
  pillarId: string;
  pillarPrefix: string;

  constructor(json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.level = this.r(str, ["L"]);
    this.abbreviation = this.r(str, ["abbreviation"]);
    this.coefficient = this.r(num, ["coefficient"]);
    this.domain = this.r(str, ["domaine", "V", "L"]);
    this.domainId = this.r(str, ["domaine", "V", "N"]);
    this.name = this.r(str, ["item", "V", "L"], { strict: false });
    this.nameId = this.r(str, ["item", "V", "N"], { strict: false });
    this.order = this.r(num, ["ordre"]);
    this.pillar = this.r(str, ["pilier", "V", "L"]);
    this.pillarId = this.r(str, ["pilier", "V", "N"]);
    this.pillarPrefix = this.r(str, ["pilier", "V", "strPrefixes"]);
  }
}

// ---------------------------------------------------------------------------
export class Evaluation extends PronoteObject {
  name: string;
  id: string;
  domain?: string;
  teacher: string;
  coefficient: number;
  description: string;
  subject: Subject;
  paliers: string[];
  acquisitions: Acquisition[];
  date: Date;

  constructor(json: any) {
    super(json);
    this.name = this.r(str, ["L"]);
    this.id = this.r(str, ["N"]);
    this.domain = this.r(str, ["domaine", "V", "L"], { strict: false });
    this.teacher = this.r(str, ["individu", "V", "L"]);
    this.coefficient = this.r(num, ["coefficient"]);
    this.description = this.r(str, ["descriptif"]);
    this.subject = this.r((v: any) => new Subject(v), ["matiere", "V"]);
    this.paliers = this.r((x: any[]) => x.map(getL), ["listePaliers", "V"]);
    this.acquisitions = this.r(
      (x: any[]) => x.map((y) => new Acquisition(y)).sort((a, b) => a.order - b.order),
      ["listeNiveauxDAcquisitions", "V"]
    );
    this.date = this.r(Util.dateParse, ["date", "V"]);
  }
}

// ---------------------------------------------------------------------------
export class Identity extends PronoteObject {
  postalCode: string;
  dateOfBirth?: Date;
  email?: string;
  lastName: string;
  country: string;
  mobileNumber?: string;
  landlineNumber?: string;
  otherPhoneNumber?: string;
  city: string;
  placeOfBirth?: string;
  address: string[] = [];
  formattedAddress: string;
  firstNames: string[];

  constructor(json: any) {
    super(json);
    this.postalCode = this.r(str, ["CP"]);
    this.dateOfBirth = this.r(Util.dateParse, ["dateNaiss"], { strict: false });
    this.email = this.r(str, ["email"], { strict: false });
    this.lastName = this.r(str, ["nom"]);
    this.country = this.r(str, ["pays"]);
    this.mobileNumber = this.r(str, ["telPort"], { strict: false });
    this.landlineNumber = this.r(str, ["telFixe"], { strict: false });
    this.otherPhoneNumber = this.r(str, ["telAutre"], { strict: false });
    this.city = this.r(str, ["ville"]);
    this.placeOfBirth = this.r(str, ["villeNaiss"], { strict: false });

    for (let i = 1; ; i++) {
      const option = json["adresse" + i];
      if (!option) break;
      this.address.push(option);
    }
    this.formattedAddress = [...this.address, this.postalCode, this.city, this.country].join(",");
    this.firstNames = [json.prenom ?? "", json.prenom2 ?? "", json.prenom3 ?? ""];
  }
}

// ---------------------------------------------------------------------------
export class Guardian extends PronoteObject {
  authorizedEmail: boolean;
  authorizedPickUpKid: boolean;
  urgencyContact: boolean;
  relativesLink: string;
  responsibilityLevel: string;
  fullName: string;
  identity: Identity;
  isLegal: boolean;

  constructor(json: any) {
    super(json);
    this.authorizedEmail = this.r(bool, ["autoriseEmail"]);
    this.authorizedPickUpKid = this.r(bool, ["autoriseRecupererEnfant"], { default: false });
    this.urgencyContact = this.r(bool, ["contactUrgence"], { default: false });
    this.relativesLink = this.r(str, ["lienParente"]);
    this.responsibilityLevel = this.r(str, ["niveauResponsabilite"]);
    this.fullName = this.r(str, ["nom"]);
    this.identity = new Identity(json);
    this.isLegal = this.responsibilityLevel === "LEGAL";
  }
}

// ---------------------------------------------------------------------------
export class Student extends PronoteObject {
  fullName: string;
  id: string;
  enrollmentDate: Date;
  dateOfBirth: Date;
  projects: string[];
  lastName: string;
  firstNames: string;
  sex: string;
  options: string[] = [];

  private _client: ClientBaseLike;
  private _cache: any = null;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;
    this.fullName = this.r(str, ["L"]);
    this.id = this.r(str, ["N"]);
    this.enrollmentDate = this.r(Util.dateParse, ["entree", "V"]);
    this.dateOfBirth = this.r(Util.dateParse, ["neLe", "V"]);
    this.projects = this.r(
      (p: any[]) => p.map((x) => `${x.typeAmenagement ?? ""} (${x.handicap ?? ""})`),
      ["listeProjets", "V"]
    );
    this.lastName = this.r(str, ["nom"]);
    this.firstNames = this.r(str, ["prenoms"]);
    this.sex = this.r(str, ["sexe"]);

    for (let i = 1; ; i++) {
      const option = json["option" + i];
      if (!option) break;
      this.options.push(option);
    }
  }

  private async ficheEleve(): Promise<any> {
    if (this._cache === null) {
      this._cache = await this._client.post("FicheEleve", 105, {
        Eleve: { N: this.id },
        AvecEleve: true,
        AvecResponsables: true,
      });
    }
    return this._cache;
  }

  async identity(): Promise<Identity> {
    const cache = await this.ficheEleve();
    return new Identity(cache.dataSec.data.Identite.V);
  }

  async guardians(): Promise<Guardian[]> {
    const cache = await this.ficheEleve();
    return cache.dataSec.data.Responsables.V.map((j: any) => new Guardian(j));
  }
}

// ---------------------------------------------------------------------------
export class StudentClass extends PronoteObject {
  name: string;
  id: string;
  responsible: boolean;
  grade: string;
  private _client: ClientBaseLike;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this._client = client;
    this.name = this.r(str, ["L"]);
    this.id = this.r(str, ["N"]);
    this.responsible = this.r(bool, ["estResponsable"]);
    this.grade = this.r(str, ["niveau", "V", "L"], { default: "" });
  }

  async students(period?: Period): Promise<Student[]> {
    const p = period ?? this._client.periods[0];
    const r = await this._client.post("ListeRessources", 105, {
      classe: { N: this.id, G: 1 },
      periode: { N: p.id, G: 1 },
    });
    return r.dataSec.data.listeRessources.V.map((j: any) => new Student(this._client, j));
  }
}

// ---------------------------------------------------------------------------
export class Menu extends PronoteObject {
  static FoodLabel = class FoodLabel extends PronoteObject {
    id: string;
    name: string;
    color?: string;

    constructor(_client: ClientBaseLike, json: any) {
      super(json);
      this.id = this.r(str, ["N"]);
      this.name = this.r(str, ["L"]);
      this.color = this.r(str, ["couleur"], { strict: false });
    }
  };

  static Food = class Food extends PronoteObject {
    id: string;
    name: string;
    labels: InstanceType<typeof Menu.FoodLabel>[];

    constructor(client: ClientBaseLike, json: any) {
      super(json);
      this.id = this.r(str, ["N"]);
      this.name = this.r(str, ["L"]);
      this.labels = this.r(
        (labels: any[]) => labels.map((l) => new Menu.FoodLabel(client, l)),
        ["listeLabelsAlimentaires", "V"]
      );
    }
  };

  id: string;
  name?: string;
  date: Date;
  isLunch: boolean;
  isDinner: boolean;
  firstMeal?: InstanceType<typeof Menu.Food>[];
  mainMeal?: InstanceType<typeof Menu.Food>[];
  sideMeal?: InstanceType<typeof Menu.Food>[];
  otherMeal?: InstanceType<typeof Menu.Food>[];
  cheese?: InstanceType<typeof Menu.Food>[];
  dessert?: InstanceType<typeof Menu.Food>[];

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.name = this.r(str, ["L"], { strict: false });
    this.date = this.r(Util.dateParse, ["Date", "V"]);
    this.isLunch = this.r(num, ["G"]) === 0;
    this.isDinner = this.r(num, ["G"]) === 1;

    const dDict: Record<string, any> = {};
    for (const meal of json.ListePlats.V) dDict[String(meal.G)] = meal;
    this._resolver = new Resolver(dDict);

    const initFood = (d: any): InstanceType<typeof Menu.Food>[] => d.ListeAliments.V.map((x: any) => new Menu.Food(client, x));
    this.firstMeal = this.r(initFood, ["0"], { strict: false });
    this.mainMeal = this.r(initFood, ["1"], { strict: false });
    this.sideMeal = this.r(initFood, ["2"], { strict: false });
    this.otherMeal = this.r(initFood, ["3"], { strict: false });
    this.cheese = this.r(initFood, ["5"], { strict: false });
    this.dessert = this.r(initFood, ["4"], { strict: false });
  }
}

// ---------------------------------------------------------------------------
export class Punishment extends PronoteObject {
  static ScheduledPunishment = class ScheduledPunishment extends PronoteObject {
    id: string;
    start: Date;
    duration?: number; // minutes

    constructor(client: ClientBaseLike, json: any) {
      super(json);
      this.id = this.r(str, ["N"]);
      const date = this.r(Util.dateParse, ["date", "V"]);
      const place = this.r(num, ["placeExecution"], { strict: false });
      if (place !== null && place !== undefined) {
        const listeHeures = client.funcOptions.dataSec.data.General.ListeHeures.V;
        try {
          const t = Util.place2time(listeHeures, place);
          const d = new Date(date);
          d.setHours(t.hour, t.minute, 0, 0);
          this.start = d;
        } catch (e) {
          throw new DataError(String(e));
        }
      } else {
        this.start = date;
      }
      this.duration = this.r((v: any) => Number(v), ["duree"], { strict: false }) ?? undefined;
    }
  };

  id: string;
  during_lesson: boolean;
  given: Date;
  exclusion: boolean;
  homework?: string;
  homeworkDocuments: Attachment[];
  circumstances: string;
  circumstanceDocuments: Attachment[];
  nature: string;
  requiresParent?: string;
  reasons: string[];
  giver: string;
  schedulable: boolean;
  schedule: InstanceType<typeof Punishment.ScheduledPunishment>[] = [];
  duration?: number;

  constructor(client: ClientBaseLike, json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    const date = this.r(Util.dateParse, ["dateDemande", "V"]);
    this.during_lesson = this.r((v: any) => !Boolean(v), ["horsCours"]);

    if (this.during_lesson) {
      const timePlace = this.r(num, ["placeDemande"]);
      const listeHeures = client.funcOptions.dataSec.data.General.ListeHeures.V;
      try {
        const t = Util.place2time(listeHeures, timePlace);
        const d = new Date(date);
        d.setHours(t.hour, t.minute, 0, 0);
        this.given = d;
      } catch (e) {
        throw new DataError(String(e));
      }
    } else {
      this.given = date;
    }

    this.exclusion = this.r(bool, ["estUneExclusion"]);
    this.homework = this.r(str, ["travailAFaire"], { strict: false });
    this.homeworkDocuments = this.r(
      (x: any[]) => x.map((a) => new Attachment(client, a)),
      ["documentsTAF", "V"],
      { default: [] }
    );
    this.circumstances = this.r(str, ["circonstances"]);
    this.circumstanceDocuments = this.r((x: any[]) => x.map((a) => new Attachment(client, a)), [
      "documentsCirconstances",
      "V",
    ]);
    this.nature = this.r(str, ["nature", "V", "L"]);
    this.requiresParent = this.r(str, ["nature", "V", "estAvecARParent"], { strict: false });
    this.reasons = this.r((x: any[]) => x.map((i) => i.L), ["listeMotifs", "V"]);
    this.giver = this.r(str, ["demandeur", "V", "L"]);
    this.schedulable = this.r(bool, ["estProgrammable"]);
    if (this.schedulable) {
      this.schedule = this.r(
        (x: any[]) => x.map((i) => new Punishment.ScheduledPunishment(client, i)),
        ["programmation", "V"]
      );
    }
    this.duration = this.r((v: any) => Number(v), ["duree"], { strict: false }) ?? undefined;
  }
}

// ---------------------------------------------------------------------------
export class TeachingStaff extends PronoteObject {
  static TeachingSubject = class TeachingSubject extends PronoteObject {
    id: string;
    name: string;
    duration?: { hours: number; minutes: number };
    parentSubjectName?: string;
    parentSubjectId?: string;

    constructor(json: any) {
      super(json);
      this.id = this.r(str, ["N"]);
      this.name = this.r(str, ["L"]);
      const durationStr = this.r(str, ["volumeHoraire"]);
      this.parentSubjectName = this.r(str, ["servicePere", "V", "L"], { strict: false });
      this.parentSubjectId = this.r(str, ["servicePere", "V", "N"], { strict: false });
      if (durationStr.includes("h")) {
        const [h, m] = durationStr.split("h").map((x: string) => parseInt(x, 10));
        this.duration = { hours: h, minutes: m || 0 };
      }
    }
  };

  id: string;
  name: string;
  num: number;
  type: "teacher" | "staff";
  subjects: InstanceType<typeof TeachingStaff.TeachingSubject>[];
  /** @internal raw PRONOTE "G" discriminator */
  _type: number;

  constructor(json: any) {
    super(json);
    this.id = this.r(str, ["N"]);
    this.name = this.r(str, ["L"]);
    this.num = this.r(num, ["P"]);
    this._type = this.r(num, ["G"]);
    this.type = this._type === 3 ? "teacher" : "staff";
    this.subjects = this.r((x: any[]) => x.map((i) => new TeachingStaff.TeachingSubject(i)), ["matieres", "V"]);
  }
}
