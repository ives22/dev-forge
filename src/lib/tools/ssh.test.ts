import { describe, expect, it } from "vitest";
import { clampRsaBits, generateSshKeyPair, sha256Fingerprint, sshPublicWireFromJwk, updateSshPublicKeyComment } from "./ssh";

function readString(bytes: Uint8Array, offset: number): { value: string; next: number } {
  const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  const start = offset + 4;
  const end = start + length;
  return {
    value: new TextDecoder().decode(bytes.slice(start, end)),
    next: end
  };
}

describe("ssh key utilities", () => {
  it("clamps RSA bits to supported strengths", () => {
    expect(clampRsaBits(1)).toBe(2048);
    expect(clampRsaBits(2500)).toBe(3072);
    expect(clampRsaBits(4096)).toBe(4096);
    expect(clampRsaBits(Number.NaN)).toBe(4096);
  });

  it("encodes RSA JWK public keys as OpenSSH wire data", () => {
    const { type, wire } = sshPublicWireFromJwk(
      {
        kty: "RSA",
        e: "AQAB",
        n: "gA"
      },
      { algorithm: "rsa", curve: "P-256" }
    );

    const typeString = readString(wire, 0);
    const exponentLengthOffset = typeString.next;
    const exponentLength =
      (wire[exponentLengthOffset] << 24) |
      (wire[exponentLengthOffset + 1] << 16) |
      (wire[exponentLengthOffset + 2] << 8) |
      wire[exponentLengthOffset + 3];

    expect(type).toBe("ssh-rsa");
    expect(typeString.value).toBe("ssh-rsa");
    expect(exponentLength).toBe(3);
  });

  it("encodes ECDSA public keys with the named curve", () => {
    const { type, wire } = sshPublicWireFromJwk(
      {
        kty: "EC",
        crv: "P-256",
        x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        y: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"
      },
      { algorithm: "ecdsa", curve: "P-256" }
    );

    const typeString = readString(wire, 0);
    const curveString = readString(wire, typeString.next);

    expect(type).toBe("ecdsa-sha2-nistp256");
    expect(typeString.value).toBe("ecdsa-sha2-nistp256");
    expect(curveString.value).toBe("nistp256");
  });

  it("generates a complete RSA key pair", async () => {
    const keyPair = await generateSshKeyPair({
      algorithm: "rsa",
      rsaBits: 2048,
      curve: "P-256",
      comment: "dev@example.com"
    });

    expect(keyPair.label).toBe("RSA 2048");
    expect(keyPair.publicKey).toMatch(/^ssh-rsa [A-Za-z0-9+/=]+ dev@example\.com$/);
    expect(keyPair.privateKey).toContain("-----BEGIN PRIVATE KEY-----");
    expect(keyPair.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
  });

  it("creates stable SHA256 fingerprint text", async () => {
    await expect(sha256Fingerprint(new Uint8Array([1, 2, 3]))).resolves.toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
  });

  it("updates only the OpenSSH public key comment", () => {
    expect(updateSshPublicKeyComment("ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC old", "  dev   laptop  ")).toBe(
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC dev laptop"
    );
  });
});
