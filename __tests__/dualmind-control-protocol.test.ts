import { parseControlCommand, redactDiagnostics, requiresUserConfirmation } from "../utils/dualmind-control-protocol";

describe("DualMind control protocol", () => {
  test("accepts a valid read-only request", () => {
    expect(parseControlCommand({ version: 1, id: "request_123", action: "status.read" }).action)
      .toBe("status.read");
  });

  test("rejects unknown commands", () => {
    expect(() => parseControlCommand({ version: 1, id: "request_123", action: "shell.exec" }))
      .toThrow("Unsupported control command");
  });

  test("requires explicit model identifier", () => {
    expect(() => parseControlCommand({ version: 1, id: "request_123", action: "models.select" }))
      .toThrow("Missing modelId");
  });

  test("requires confirmation for changes", () => {
    expect(requiresUserConfirmation("models.select")).toBe(true);
    expect(requiresUserConfirmation("status.read")).toBe(false);
  });

  test("redacts secrets from nested logs and URLs", () => {
    const result = redactDiagnostics({
      apiKey: "sensitive",
      message: "Bearer mytoken https://example.org/?api_key=verysecret",
    }) as { apiKey: string; message: string };
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.message).not.toContain("mytoken");
    expect(result.message).not.toContain("verysecret");
  });

  test("handles circular structures without crashing", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(redactDiagnostics(circular)).toEqual({ self: "[circular]" });
    expect(() => parseControlCommand({
      version: 1, id: "request_123", action: "status.read", params: circular,
    })).toThrow("Invalid command parameters");
  });
});
