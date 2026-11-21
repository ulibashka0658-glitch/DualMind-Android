import { nativeDownloads, nativeDownloaderAvailable, normalizeDownload } from "../utils/dualmind-native-download";
import { NativeModules, Platform } from "react-native";

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: { DualMindDownload: {
    enqueue: jest.fn(), query: jest.fn(), tracked: jest.fn(), cancel: jest.fn(),
  }},
}));

const base = { id: "42", status: 2, reason: 0, bytes: 50, total: 100 };

describe("native download progress", () => {
  test.each([[1,"pending"],[2,"running"],[4,"waiting"],[8,"completed"],[16,"failed"],[99,"unknown"]])("maps status %s", (status, state) => {
    expect(normalizeDownload({...base, status: Number(status)}).state).toBe(state);
  });
  it("caps unfinished progress at 99", () => {
    expect(normalizeDownload({...base, bytes: 100}).percent).toBe(99);
  });
  it("reports completed separately", () => {
    expect(normalizeDownload({...base, status: 8}).percent).toBe(100);
  });
  it("handles unknown total and invalid bytes", () => {
    expect(normalizeDownload({...base, total: -1, bytes: NaN})).toMatchObject({total: null, bytes: 0, percent: null});
  });
  it("preserves waiting reason and progress", () => {
    expect(normalizeDownload({...base, status: 4, reason: 2})).toMatchObject({state: "waiting", reason: 2, percent: 50});
  });
});

describe("native download bridge", () => {
  const module = NativeModules.DualMindDownload;
  beforeEach(() => jest.clearAllMocks());
  it("forwards enqueue and cancellation", async () => {
    module.enqueue.mockResolvedValue("42");
    module.cancel.mockResolvedValue(true);
    await expect(nativeDownloads.enqueue("model", "https://huggingface.co/a/b", "a.gguf")).resolves.toBe("42");
    expect(module.enqueue).toHaveBeenCalledWith("model", "https://huggingface.co/a/b", "a.gguf");
    await expect(nativeDownloads.cancel("model")).resolves.toBe(true);
    expect(module.cancel).toHaveBeenCalledWith("model");
  });
  it("normalizes queries and preserves missing records", async () => {
    module.query.mockResolvedValueOnce(base).mockResolvedValueOnce(null);
    await expect(nativeDownloads.query("model")).resolves.toMatchObject({percent: 50});
    await expect(nativeDownloads.query("model")).resolves.toBeNull();
  });
  it("returns persisted identifiers", async () => {
    module.tracked.mockResolvedValue({model: "42"});
    await expect(nativeDownloads.tracked()).resolves.toEqual({model: "42"});
  });
  it("propagates native errors", async () => {
    module.query.mockRejectedValue(new Error("native error"));
    await expect(nativeDownloads.query("model")).rejects.toThrow("native error");
  });
  it("rejects unavailable bridges", () => {
    expect(Platform.OS).toBe("android");
    expect(nativeDownloaderAvailable()).toBe(true);
    delete NativeModules.DualMindDownload;
    try {
      expect(nativeDownloaderAvailable()).toBe(false);
      expect(() => nativeDownloads.tracked()).toThrow("unavailable");
    } finally {
      NativeModules.DualMindDownload = module;
    }
  });
});
