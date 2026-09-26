import { createHash, createCipheriv, createDecipheriv, createPublicKey, publicEncrypt, randomBytes, constants } from "node:crypto";
import { CryptoError } from "./exceptions.js";

export function md5(data: Buffer): Buffer {
  return createHash("md5").update(data).digest();
}

export function sha256HexUpper(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex").toUpperCase();
}

/** Converts a decimal-string big integer into a big-endian Buffer (used for RSA JWK components). */
function bigIntToBuffer(value: bigint): Buffer {
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return Buffer.from(hex, "hex");
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The encryption part of the API: AES (session data) + RSA (initial handshake).
 * Faithful port of pronotepy's `_Encryption`, including the hardcoded PRONOTE
 * RSA-1024 public key taken from eleve.js.
 */
export class Encryption {
  // taken from eleve.js - same constant pronotepy uses
  static readonly RSA_1024_MODULUS =
    130337874517286041778445012253514395801341480334668979416920989365464528904618150245388048105865059387076357492684573172203245221386376405947824377827224846860699130638566643129067735803555082190977267155957271492183684665050351182476506458843580431717209261903043895605014125081521285387341454154194253026277n;
  static readonly RSA_1024_EXPONENT = 65537n;

  aesIv: Buffer = Buffer.alloc(16, 0);
  aesIvTemp: Buffer = randomBytes(16);
  aesKey: Buffer = md5(Buffer.alloc(0));

  aesEncrypt(data: Buffer): Buffer {
    const cipher = createCipheriv("aes-128-cbc", this.aesKey, this.aesIv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  aesDecrypt(data: Buffer): Buffer {
    try {
      const decipher = createDecipheriv("aes-128-cbc", this.aesKey, this.aesIv);
      return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch (e) {
      throw new CryptoError(
        "Decryption failed while trying to un pad. (probably bad decryption key/iv)"
      );
    }
  }

  aesSetIv(iv?: Buffer): void {
    this.aesIv = iv ?? md5(this.aesIvTemp);
  }

  aesSetKey(key?: Buffer): void {
    if (key) this.aesKey = md5(key);
  }

  /** RSA PKCS#1 v1.5 encrypt against PRONOTE's hardcoded public key. */
  rsaEncrypt(data: Buffer): Buffer {
    const n = base64url(bigIntToBuffer(Encryption.RSA_1024_MODULUS));
    const e = base64url(bigIntToBuffer(Encryption.RSA_1024_EXPONENT));
    const publicKey = createPublicKey({
      key: { kty: "RSA", n, e },
      format: "jwk",
    });
    return publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, data);
  }
}
