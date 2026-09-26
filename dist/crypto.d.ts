export declare function md5(data: Buffer): Buffer;
export declare function sha256HexUpper(data: string): string;
/**
 * The encryption part of the API: AES (session data) + RSA (initial handshake).
 * Faithful port of pronotepy's `_Encryption`, including the hardcoded PRONOTE
 * RSA-1024 public key taken from eleve.js.
 */
export declare class Encryption {
    static readonly RSA_1024_MODULUS = 130337874517286041778445012253514395801341480334668979416920989365464528904618150245388048105865059387076357492684573172203245221386376405947824377827224846860699130638566643129067735803555082190977267155957271492183684665050351182476506458843580431717209261903043895605014125081521285387341454154194253026277n;
    static readonly RSA_1024_EXPONENT = 65537n;
    aesIv: Buffer;
    aesIvTemp: Buffer;
    aesKey: Buffer;
    aesEncrypt(data: Buffer): Buffer;
    aesDecrypt(data: Buffer): Buffer;
    aesSetIv(iv?: Buffer): void;
    aesSetKey(key?: Buffer): void;
    /** RSA PKCS#1 v1.5 encrypt against PRONOTE's hardcoded public key. */
    rsaEncrypt(data: Buffer): Buffer;
}
