import { CookieJar } from "tough-cookie";
import { Communication, KeepAlive } from "./communication.js";
import { Encryption } from "./crypto.js";
import * as dc from "./dataClasses.js";
export type ENTFunction = (username: string, password: string, opts: {
    pronote_url?: string;
}) => Promise<CookieJar>;
export type LoginMode = "normal" | "qr_code" | "token";
export interface ClientOptions {
    ent?: ENTFunction;
    mode?: LoginMode;
    uuid?: string;
    accountPin?: string;
    clientIdentifier?: string;
    deviceName?: string;
}
/** Base class for every PRONOTE client. Handles the full login/session lifecycle. */
export declare class ClientBase {
    pronoteUrl: string;
    username: string;
    password: string;
    ent?: ENTFunction;
    loginMode: LoginMode;
    uuid: string;
    accountPin?: string;
    clientIdentifier?: string;
    deviceName?: string;
    communication: Communication;
    encryption: Encryption;
    attributes: Record<string, string>;
    funcOptions: any;
    parametresUtilisateur: any;
    info: dc.ClientInfo;
    startDay: Date;
    week: number;
    logged_in: boolean;
    lastConnection: Date | null;
    periods_: dc.Period[] | null;
    protected _refreshing: boolean;
    protected _expired: boolean;
    private _ready;
    constructor(pronoteUrl: string, username?: string, password?: string, opts?: ClientOptions);
    /** Resolves once the client has finished the handshake, login and initial state fetch. */
    ready(): Promise<this>;
    private _init;
    /** Preferred entry point: constructs the client and waits for login to complete. */
    static login<T extends typeof ClientBase>(this: T, pronoteUrl: string, username: string, password: string, opts?: ClientOptions): Promise<InstanceType<T>>;
    static qrcodeLogin<T extends typeof ClientBase>(this: T, qrCode: {
        login: string;
        jeton: string;
        url: string;
    }, pin: string, uuid: string, opts?: {
        accountPin?: string;
        clientIdentifier?: string;
        deviceName?: string;
        skip2fa?: boolean;
    }): Promise<InstanceType<T>>;
    static tokenLogin<T extends typeof ClientBase>(this: T, pronoteUrl: string, username: string, password: string, uuid: string, opts?: {
        accountPin?: string;
        clientIdentifier?: string;
        deviceName?: string;
    }): Promise<InstanceType<T>>;
    private _login;
    private _do2fa;
    exportCredentials(): {
        pronoteUrl: string;
        username: string;
        password: string;
        clientIdentifier?: string;
        uuid: string;
    };
    getWeek(date: Date): number;
    get periods(): dc.Period[];
    /** Returns a controller to keep the connection alive via periodic pings. Call `.start()`/`.stop()`. */
    keepAlive(): KeepAlive;
    refresh(): Promise<void>;
    sessionCheck(): Promise<boolean>;
    post(functionName: string, onglet?: number, data?: Record<string, unknown>): Promise<any>;
    requestQrCodeData(pin: string): Promise<Record<string, unknown>>;
}
/** A student PRONOTE client. */
export declare class Client extends ClientBase {
    lessons(dateFrom: Date, dateTo?: Date): Promise<dc.Lesson[]>;
    exportIcal(): Promise<string>;
    homework(dateFrom: Date, dateTo?: Date): Promise<dc.Homework[]>;
    generateTimetablePdf(opts?: {
        day?: Date;
        portrait?: boolean;
        overflow?: 0 | 1 | 2;
        fontSize?: [number, number];
    }): Promise<string>;
    getRecipients(): Promise<dc.Recipient[]>;
    getTeachingStaff(): Promise<dc.TeachingStaff[]>;
    newDiscussion(subject: string, message: string, recipients: dc.Recipient[]): Promise<void>;
    discussions(onlyUnread?: boolean): Promise<dc.Discussion[]>;
    informationAndSurveys(opts?: {
        dateFrom?: Date;
        dateTo?: Date;
        onlyUnread?: boolean;
    }): Promise<dc.Information[]>;
    menus(dateFrom: Date, dateTo?: Date): Promise<dc.Menu[]>;
    currentPeriod(): Promise<dc.Period>;
}
/** A parent PRONOTE client, with access to one or more children. */
export declare class ParentClient extends Client {
    children: dc.ClientInfo[];
    private _selectedChild;
    protected _afterLogin(): Promise<void>;
    ready(): Promise<this>;
    setChild(child: string | dc.ClientInfo): void;
    post(functionName: string, onglet?: number, data?: Record<string, unknown>): Promise<any>;
}
/** A PRONOTE client for "Vie Scolaire" (school life staff) accounts. */
export declare class VieScolaireClient extends ClientBase {
    classes: dc.StudentClass[];
    protected _afterLogin(): Promise<void>;
    ready(): Promise<this>;
}
