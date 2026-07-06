import { describe, expect, it } from "vitest";
import { decodeJwt, encodeJwt, sampleJwtHeader, sampleJwtPayload, verifyJwt } from "./jwt";

describe("JWT transform", () => {
  it("encodes and decodes HS256 token", async () => {
    const token = await encodeJwt(JSON.stringify(sampleJwtHeader), JSON.stringify(sampleJwtPayload), "HS256", "devforge-secret");
    const decoded = decodeJwt(token);
    expect(decoded.ok).toBe(true);
    expect(decoded.payload.sub).toBe("devforge-user");
  });

  it("detects HMAC verify failure", async () => {
    const token = await encodeJwt(JSON.stringify(sampleJwtHeader), JSON.stringify(sampleJwtPayload), "HS256", "devforge-secret");
    const verified = await verifyJwt(token, "wrong-secret");
    expect(verified.supported).toBe(true);
    expect(verified.ok).toBe(false);
  });

  it("marks RS algorithms as decode-only", async () => {
    const decoded = await verifyJwt("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig", "secret");
    expect(decoded.supported).toBe(false);
  });
});
