export class PronoteAPIError extends Error {
  pronoteErrorCode?: number;
  pronoteErrorMsg?: string;

  constructor(message?: string, opts: { pronoteErrorCode?: number; pronoteErrorMsg?: string } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.pronoteErrorCode = opts.pronoteErrorCode;
    this.pronoteErrorMsg = opts.pronoteErrorMsg;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Exception for known errors in the cryptography. */
export class CryptoError extends PronoteAPIError {}

/** Raised when the QR code cannot be decrypted. */
export class QRCodeDecryptError extends CryptoError {}

/** Raised when pronote returns error 22 (unknown object reference). */
export class ExpiredObject extends PronoteAPIError {}

/** Child with this name was not found. */
export class ChildNotFound extends PronoteAPIError {}

/** Base exception for any errors made by creating or manipulating data classes. */
export class DataError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Bad json */
export class ParsingError extends DataError {
  jsonDict: unknown;
  path: string[];

  constructor(message: string, jsonDict: unknown, path: string[]) {
    super(message);
    this.jsonDict = jsonDict;
    this.path = path;
  }
}

/** Error while exporting ICal. Pronote did not return token */
export class ICalExportError extends PronoteAPIError {}

/** Bad date string */
export class DateParsingError extends PronoteAPIError {
  dateString: string;

  constructor(message: string, dateString: string) {
    super(message);
    this.dateString = dateString;
  }
}

/** Error while logging in with an ENT */
export class ENTLoginError extends PronoteAPIError {}

/** The PRONOTE server does not have the functionality */
export class UnsupportedOperation extends PronoteAPIError {}

/** The discussion is closed */
export class DiscussionClosed extends PronoteAPIError {}

/** Error while processing 2FA (MFA) */
export class MFAError extends PronoteAPIError {}
