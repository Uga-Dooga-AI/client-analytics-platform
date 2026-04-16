import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionMaterial() {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) {
    return null;
  }

  return createHash("sha256").update(raw).digest();
}

export function hasConfigEncryption() {
  return Boolean(getEncryptionMaterial());
}

export function encryptSecret(value?: string | null) {
  if (!value) {
    return null;
  }

  const key = getEncryptionMaterial();
  if (!key) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required to store live connector secrets.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload?: string | null) {
  if (!payload) {
    return null;
  }

  const key = getEncryptionMaterial();
  if (!key) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required to decrypt live connector secrets.");
  }

  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Unsupported secret payload format.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
