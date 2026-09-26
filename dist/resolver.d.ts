export declare class Util {
    static gradeTranslate: string[];
    /** Filters an iterable of objects by attribute equality, e.g. `Util.get(list, {id: "3"})`. */
    static get<T>(iterable: Iterable<T>, filter: Partial<T>): T[];
    static gradeParse(value: string): string;
    /** Converts a PRONOTE-formatted date string to a JS Date truncated to the day. */
    static dateParse(formattedDate: string): Date;
    /** Converts a PRONOTE-formatted date(-time) string to a full JS Date. */
    static datetimeParse(formattedDate: string): Date;
    /** Strips HTML tags and unescapes entities, mirrors `Util.html_parse`. */
    static htmlParse(htmlText: string): string;
    static place2time(listeHeures: Array<{
        G: number;
        L: string;
    }>, place: number): {
        hour: number;
        minute: number;
    };
}
/**
 * Resolves an arbitrary value from a raw PRONOTE JSON dict by walking a path
 * of keys, then passes it through a converter. Mirrors `Object._Resolver`.
 */
export declare class Resolver {
    private jsonDict;
    constructor(jsonDict: any);
    call<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
        default?: R;
        strict?: boolean;
    }): R;
}
/** Base class for all pronoteTs data classes, mirrors `dataClasses.Object`. */
export declare abstract class PronoteObject {
    /** @internal */
    _resolver: Resolver;
    constructor(jsonDict: any);
    /** @internal shorthand for `this._resolver.call` */
    r<R>(converter: (value: any) => R, path: (string | number)[], opts?: {
        default?: R;
        strict?: boolean;
    }): R;
    /** Recursively serializes this object into a plain JSON-friendly object. */
    toDict(exclude?: Set<string>): Record<string, unknown>;
}
export declare const str: (v: any) => string;
export declare const num: (v: any) => number;
export declare const bool: (v: any) => boolean;
export declare const noop: <T>(v: T) => T;
