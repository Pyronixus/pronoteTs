import { PronoteObject, Resolver } from "./resolver.js";
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
    info: {
        id: string;
    };
}
export declare class Subject extends PronoteObject {
    id: string;
    name: string;
    groups: boolean;
    constructor(json: any);
}
export declare class Report extends PronoteObject {
    static ReportSubject: {
        new (json: any): {
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
            _resolver: Resolver;
            r<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
                default?: R;
                strict?: boolean;
            }): R;
            toDict(exclude?: Set<string>): Record<string, unknown>;
        };
    };
    subjects: InstanceType<typeof Report.ReportSubject>[];
    comments: string[];
    constructor(json: any);
}
export declare class Absence extends PronoteObject {
    id: string;
    fromDate: Date;
    toDate: Date;
    justified: boolean;
    hours?: string;
    days: number;
    reasons: string[];
    constructor(json: any);
}
export declare class Delay extends PronoteObject {
    id: string;
    date: Date;
    minutes: number;
    justified: boolean;
    justification?: string;
    reasons: string[];
    constructor(json: any);
}
export declare class Period extends PronoteObject {
    static instances: Set<Period>;
    id: string;
    name: string;
    start: Date;
    end: Date;
    private _client;
    constructor(client: ClientBaseLike, json: any);
    /** Gets a report from this period. `null` when not yet published. */
    report(): Promise<Report | null>;
    grades(): Promise<Grade[]>;
    averages(): Promise<Average[]>;
    overallAverage(): Promise<string>;
    classOverallAverage(): Promise<string | null>;
    evaluations(): Promise<Evaluation[]>;
    absences(): Promise<Absence[]>;
    delays(): Promise<Delay[]>;
    punishments(): Promise<Punishment[]>;
}
export declare function frDate(d: Date): string;
export declare function frDateTime(d: Date): string;
export declare class Average extends PronoteObject {
    student: string;
    outOf: string;
    defaultOutOf: string;
    classAverage: string;
    min: string;
    max: string;
    subject: Subject;
    backgroundColor?: string;
    constructor(json: any);
}
export declare class Grade extends PronoteObject {
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
    constructor(json: any);
    toDict(): Record<string, unknown>;
}
export declare class Attachment extends PronoteObject {
    name: string;
    id: string;
    type: number;
    url: string;
    private _client;
    constructor(client: ClientBaseLike, json: any);
    /** Downloads the raw file bytes. */
    data(): Promise<Buffer>;
    /** Downloads and writes the file to disk (Node only). */
    save(filePath?: string): Promise<void>;
}
export declare class LessonContent extends PronoteObject {
    title?: string;
    description?: string;
    category?: string;
    private _client;
    private _files;
    constructor(client: ClientBaseLike, json: any);
    files(): Attachment[];
}
export declare class Lesson extends PronoteObject {
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
    end: Date;
    teacherNames: string[];
    classrooms: string[];
    groupNames: string[];
    subject: Subject | null;
    teacherName: string | null;
    classroom: string | null;
    groupName: string | null;
    private _client;
    private _content;
    constructor(client: ClientBaseLike, json: any);
    get normal(): boolean;
    /** Fetches the lesson's detailed content. May be `null` if there is no description. Makes a network request. */
    content(): Promise<LessonContent | null>;
}
export declare class Homework extends PronoteObject {
    id: string;
    description: string;
    done: boolean;
    subject: Subject;
    date: Date;
    backgroundColor: string;
    private _client;
    private _files;
    constructor(client: ClientBaseLike, json: any);
    setDone(status: boolean): Promise<void>;
    files(): Attachment[];
}
export declare class Information extends PronoteObject {
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
    private _client;
    private _rawContent;
    private _content;
    private _attachments;
    constructor(client: ClientBaseLike, json: any);
    content(): Promise<string>;
    attachments(): Promise<Attachment[]>;
    private fetchContent;
    markAsRead(status: boolean): Promise<void>;
}
export declare class Recipient extends PronoteObject {
    id: string;
    name: string;
    type: "teacher" | "staff";
    email?: string;
    functions: string[];
    withDiscussion: boolean;
    /** @internal PRONOTE "G" discriminator, needed to build `new_discussion` payloads. */
    _type: number;
    constructor(_client: ClientBaseLike, json: any);
}
export declare class Message extends PronoteObject {
    id: string;
    content: string;
    author: string | null;
    seen: boolean;
    created: Date;
    /** @deprecated alias of `created` */
    date: Date;
    replyingTo: Message | null;
    private _client;
    private _possession;
    constructor(client: ClientBaseLike, json: any);
    recipients(): Promise<string[]>;
    reply(message: string): Promise<void>;
}
export declare class Discussion extends PronoteObject {
    id: string;
    subject: string;
    creator?: string;
    unread: number;
    closed: boolean;
    /** @deprecated use `closed` */
    close: boolean;
    labels: string[];
    /** @deprecated always `true` */
    replyable: boolean;
    private _client;
    private _possessions;
    private _participantsMessageId;
    private _dateCache;
    constructor(client: ClientBaseLike, json: any, labels: Record<string, number>);
    participants(): Promise<string[]>;
    messages(): Promise<Message[]>;
    /** Date the discussion was opened. Alias for `(await discussion.messages())[0].date`. */
    date(): Promise<Date>;
    markAs(read: boolean): Promise<void>;
    reply(message: string): Promise<void>;
    delete(): Promise<void>;
}
/** Info about a resource (a client). Mirrors `ClientInfo`. */
export declare class ClientInfo {
    id: string;
    rawResource: any;
    private _client;
    private _cache;
    constructor(client: ClientBaseLike, json: any);
    get name(): string;
    get profilePicture(): Attachment | null;
    get delegue(): string[];
    get className(): string;
    get establishment(): string;
    private cache;
    /** [line1, line2, line3, line4, postalCode, city, province, country] */
    address(): Promise<[string, string, string, string, string, string, string, string]>;
    email(): Promise<string>;
    phone(): Promise<string>;
    ineNumber(): Promise<string>;
}
export declare class Acquisition extends PronoteObject {
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
    constructor(json: any);
}
export declare class Evaluation extends PronoteObject {
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
    constructor(json: any);
}
export declare class Identity extends PronoteObject {
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
    address: string[];
    formattedAddress: string;
    firstNames: string[];
    constructor(json: any);
}
export declare class Guardian extends PronoteObject {
    authorizedEmail: boolean;
    authorizedPickUpKid: boolean;
    urgencyContact: boolean;
    relativesLink: string;
    responsibilityLevel: string;
    fullName: string;
    identity: Identity;
    isLegal: boolean;
    constructor(json: any);
}
export declare class Student extends PronoteObject {
    fullName: string;
    id: string;
    enrollmentDate: Date;
    dateOfBirth: Date;
    projects: string[];
    lastName: string;
    firstNames: string;
    sex: string;
    options: string[];
    private _client;
    private _cache;
    constructor(client: ClientBaseLike, json: any);
    private ficheEleve;
    identity(): Promise<Identity>;
    guardians(): Promise<Guardian[]>;
}
export declare class StudentClass extends PronoteObject {
    name: string;
    id: string;
    responsible: boolean;
    grade: string;
    private _client;
    constructor(client: ClientBaseLike, json: any);
    students(period?: Period): Promise<Student[]>;
}
export declare class Menu extends PronoteObject {
    static FoodLabel: {
        new (_client: ClientBaseLike, json: any): {
            id: string;
            name: string;
            color?: string;
            _resolver: Resolver;
            r<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
                default?: R;
                strict?: boolean;
            }): R;
            toDict(exclude?: Set<string>): Record<string, unknown>;
        };
    };
    static Food: {
        new (client: ClientBaseLike, json: any): {
            id: string;
            name: string;
            labels: InstanceType<typeof Menu.FoodLabel>[];
            _resolver: Resolver;
            r<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
                default?: R;
                strict?: boolean;
            }): R;
            toDict(exclude?: Set<string>): Record<string, unknown>;
        };
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
    constructor(client: ClientBaseLike, json: any);
}
export declare class Punishment extends PronoteObject {
    static ScheduledPunishment: {
        new (client: ClientBaseLike, json: any): {
            id: string;
            start: Date;
            duration?: number;
            _resolver: Resolver;
            r<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
                default?: R;
                strict?: boolean;
            }): R;
            toDict(exclude?: Set<string>): Record<string, unknown>;
        };
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
    schedule: InstanceType<typeof Punishment.ScheduledPunishment>[];
    duration?: number;
    constructor(client: ClientBaseLike, json: any);
}
export declare class TeachingStaff extends PronoteObject {
    static TeachingSubject: {
        new (json: any): {
            id: string;
            name: string;
            duration?: {
                hours: number;
                minutes: number;
            };
            parentSubjectName?: string;
            parentSubjectId?: string;
            _resolver: Resolver;
            r<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
                default?: R;
                strict?: boolean;
            }): R;
            toDict(exclude?: Set<string>): Record<string, unknown>;
        };
    };
    id: string;
    name: string;
    num: number;
    type: "teacher" | "staff";
    subjects: InstanceType<typeof TeachingStaff.TeachingSubject>[];
    /** @internal raw PRONOTE "G" discriminator */
    _type: number;
    constructor(json: any);
}
