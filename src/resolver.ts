import { DateParsingError, ParsingError } from "./exceptions.js";

// ---------------------------------------------------------------------------
// Util - direct port of dataClasses.Util
// ---------------------------------------------------------------------------

export class Util {
  static gradeTranslate = [
    "Absent",
    "Dispense",
    "NonNote",
    "Inapte",
    "NonRendu",
    "AbsentZero",
    "NonRenduZero",
    "Felicitations",
  ];

  /** Filters an iterable of objects by attribute equality, e.g. `Util.get(list, {id: "3"})`. */
  static get<T>(iterable: Iterable<T>, filter: Partial<T>): T[] {
    const output: T[] = [];
    outer: for (const item of iterable) {
      for (const key of Object.keys(filter as object) as (keyof T)[]) {
        if ((item as any)[key] !== (filter as any)[key]) continue outer;
      }
      output.push(item);
    }
    return output;
  }

  static gradeParse(value: string): string {
    if (value.includes("|")) {
      return Util.gradeTranslate[parseInt(value[1], 10) - 1];
    }
    return value;
  }

  /** Converts a PRONOTE-formatted date string to a JS Date truncated to the day. */
  static dateParse(formattedDate: string): Date {
    let m: RegExpMatchArray | null;
    if ((m = formattedDate.match(/^\d{2}\/\d{2}\/\d{4}$/))) {
      return parseFrDate(formattedDate, "DMY4");
    } else if ((m = formattedDate.match(/^\d{2}\/\d{2}\/\d{2}$/))) {
      return parseFrDate(formattedDate, "DMY2");
    } else if ((m = formattedDate.match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/))) {
      return parseFrDateTime(formattedDate, "DMY4HMS");
    } else if ((m = formattedDate.match(/^\d{2}\/\d{2}\/\d{2} \d{2}h\d{2}$/))) {
      return parseFrDateTime(formattedDate, "DMY2HM");
    } else if ((m = formattedDate.match(/^\d{2}\/\d{2}$/))) {
      return parseFrDate(`${formattedDate}/${new Date().getFullYear()}`, "DMY4");
    } else if ((m = formattedDate.match(/^\d{4}$/))) {
      const now = new Date();
      const hours = parseInt(formattedDate.slice(0, 2), 10);
      const minutes = parseInt(formattedDate.slice(2), 10);
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      return truncateToDay(d);
    }
    throw new DateParsingError("Could not parse date", formattedDate);
  }

  /** Converts a PRONOTE-formatted date(-time) string to a full JS Date. */
  static datetimeParse(formattedDate: string): Date {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(formattedDate)) {
      return parseFrDate(formattedDate, "DMY4");
    } else if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(formattedDate)) {
      return parseFrDateTime(formattedDate, "DMY4HMS");
    } else if (/^\d{2}\/\d{2}\/\d{2} \d{2}h\d{2}$/.test(formattedDate)) {
      return parseFrDateTime(formattedDate, "DMY2HM");
    }
    throw new DateParsingError("Could not parse date", formattedDate);
  }

  /** Strips HTML tags and unescapes entities, mirrors `Util.html_parse`. */
  static htmlParse(htmlText: string): string {
    const stripped = htmlText.replace(/<.*?>/gs, "");
    return unescapeHtml(stripped);
  }

  static place2time(listeHeures: Array<{ G: number; L: string }>, place: number): { hour: number; minute: number } {
    let p = place;
    if (p > listeHeures.length) {
      p = p % (listeHeures.length - 1);
    }
    const startTime = listeHeures.find((x) => x.G === p);
    if (!startTime) throw new Error(`Could not find starting time for place ${place}`);
    const m = startTime.L.match(/(\d{2})h(\d{2})/);
    if (!m) throw new Error(`Could not parse time ${startTime.L}`);
    return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
  }
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function truncateToDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseFrDate(s: string, fmt: "DMY4" | "DMY2"): Date {
  const [d, mo, y] = s.split("/").map((x) => parseInt(x, 10));
  const year = fmt === "DMY2" ? 2000 + y : y;
  return new Date(year, mo - 1, d);
}

function parseFrDateTime(s: string, fmt: "DMY4HMS" | "DMY2HM"): Date {
  if (fmt === "DMY4HMS") {
    const [datePart, timePart] = s.split(" ");
    const [d, mo, y] = datePart.split("/").map((x) => parseInt(x, 10));
    const [h, mi, se] = timePart.split(":").map((x) => parseInt(x, 10));
    return new Date(y, mo - 1, d, h, mi, se);
  }
  const [datePart, timePart] = s.split(" ");
  const [d, mo, y] = datePart.split("/").map((x) => parseInt(x, 10));
  const m2 = timePart.match(/(\d{2})h(\d{2})/)!;
  return new Date(2000 + y, mo - 1, d, parseInt(m2[1], 10), parseInt(m2[2], 10));
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function unescapeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&\w+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

// ---------------------------------------------------------------------------
// Object / Resolver - direct port of dataClasses.Object._Resolver
// ---------------------------------------------------------------------------

const MISSING = Symbol("missing");

/**
 * Resolves an arbitrary value from a raw PRONOTE JSON dict by walking a path
 * of keys, then passes it through a converter. Mirrors `Object._Resolver`.
 */
export class Resolver {
  constructor(private jsonDict: any) {}

  call<R>(
    converter: (value: any) => R,
    path: (string | number)[],
    opts: { default?: R; strict?: boolean } = {}
  ): R {
    const strict = opts.strict ?? true;
    let jsonValue: any = this.jsonDict;
    for (const p of path) {
      if (jsonValue == null || !(p in Object(jsonValue))) {
        if ("default" in opts) {
          jsonValue = opts.default;
          return jsonValue as R;
        } else if (strict) {
          throw new ParsingError("Could not follow path", this.jsonDict, path.map(String));
        } else {
          return undefined as unknown as R;
        }
      }
      jsonValue = jsonValue[p as any];
    }
    try {
      return converter(jsonValue);
    } catch (e) {
      if (e instanceof ParsingError) throw e;
      throw new ParsingError(`Error while converting value: ${e}`, this.jsonDict, path.map(String));
    }
  }
}

/** Base class for all pronoteTs data classes, mirrors `dataClasses.Object`. */
export abstract class PronoteObject {
  /** @internal */
  _resolver: Resolver;

  constructor(jsonDict: any) {
    this._resolver = new Resolver(jsonDict);
  }

  /** @internal shorthand for `this._resolver.call` */
  r<R>(converter: (value: any) => R, path: (string | number)[], opts?: { default?: R; strict?: boolean }): R {
    return this._resolver.call(converter, path, opts);
  }

  /** Recursively serializes this object into a plain JSON-friendly object. */
  toDict(exclude: Set<string> = new Set()): Record<string, unknown> {
    const serialize = (v: unknown): unknown => {
      if (v instanceof PronoteObject) return v.toDict();
      return v;
    };
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this)) {
      if (key.startsWith("_") || exclude.has(key)) continue;
      out[key] = Array.isArray(value) ? value.map(serialize) : serialize(value);
    }
    return out;
  }
}

export const str = (v: any): string => String(v);
export const num = (v: any): number => Number(v);
export const bool = (v: any): boolean => Boolean(v);
export const noop = <T>(v: T): T => v;
