export declare class PronoteAPIError extends Error {
    pronoteErrorCode?: number;
    pronoteErrorMsg?: string;
    constructor(message?: string, opts?: {
        pronoteErrorCode?: number;
        pronoteErrorMsg?: string;
    });
}
/** Exception for known errors in the cryptography. */
export declare class CryptoError extends PronoteAPIError {
}
/** Raised when the QR code cannot be decrypted. */
export declare class QRCodeDecryptError extends CryptoError {
}
/** Raised when pronote returns error 22 (unknown object reference). */
export declare class ExpiredObject extends PronoteAPIError {
}
/** Child with this name was not found. */
export declare class ChildNotFound extends PronoteAPIError {
}
/** Base exception for any errors made by creating or manipulating data classes. */
export declare class DataError extends Error {
    constructor(message?: string);
}
/** Bad json */
export declare class ParsingError extends DataError {
    jsonDict: unknown;
    path: string[];
    constructor(message: string, jsonDict: unknown, path: string[]);
}
/** Error while exporting ICal. Pronote did not return token */
export declare class ICalExportError extends PronoteAPIError {
}
/** Bad date string */
export declare class DateParsingError extends PronoteAPIError {
    dateString: string;
    constructor(message: string, dateString: string);
}
/** Error while logging in with an ENT */
export declare class ENTLoginError extends PronoteAPIError {
}
/** The PRONOTE server does not have the functionality */
export declare class UnsupportedOperation extends PronoteAPIError {
}
/** The discussion is closed */
export declare class DiscussionClosed extends PronoteAPIError {
}
/** Error while processing 2FA (MFA) */
export declare class MFAError extends PronoteAPIError {
}
