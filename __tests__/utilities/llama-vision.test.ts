import { connectLlama } from "../../context/language-model/llama";
import type { LanguageModelSettings } from "../../context/language-model/types";
import { initLlama } from "llama.rn";
import * as FileSystem from "expo-file-system/legacy";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  readAsStringAsync: jest.fn(),
}));
jest.mock("llama.rn", () => ({
  initLlama: jest.fn(),
  loadLlamaModelInfo: jest.fn(async () => ({})),
}));

const native = {
  initMultimodal: jest.fn(),
  getMultimodalSupport: jest.fn(),
  release: jest.fn(),
};
const settings: LanguageModelSettings = {
  headers: {}, parameters: {},
  modelKey: "vision (local)",
  modelFiles: { "vision (local)": "file:///model.gguf" },
  projectorKey: "projector",
  projectorFiles: { projector: "file:///projector.gguf" },
};

beforeEach(() => {
  jest.resetAllMocks();
  (require("llama.rn").loadLlamaModelInfo as jest.Mock).mockResolvedValue({});
  (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue("R0dVRg==");
  (initLlama as jest.Mock).mockResolvedValue(native);
  native.initMultimodal.mockResolvedValue(true);
  native.getMultimodalSupport.mockResolvedValue({ vision: true });
  native.release.mockResolvedValue(undefined);
});

describe("local vision initialization", () => {
  it("enables vision only when native support is confirmed", async () => {
    const client = await connectLlama(settings);
    expect(client?.imagesSupported).toBe(true);
    expect(native.initMultimodal).toHaveBeenCalledWith({
      path: "file:///projector.gguf", use_gpu: true,
    });
  });
  it("keeps text-only models available without a projector", async () => {
    const client = await connectLlama({ ...settings, projectorKey: undefined });
    expect(client?.imagesSupported).toBe(false);
    expect(native.initMultimodal).not.toHaveBeenCalled();
  });
  it("rejects an invalid projector before allocating a native context", async () => {
    (FileSystem.readAsStringAsync as jest.Mock)
      .mockResolvedValueOnce("R0dVRg==").mockResolvedValueOnce("AAAAAA==");
    await expect(connectLlama(settings)).rejects.toThrow("projector");
    expect(initLlama).not.toHaveBeenCalled();
  });
  it("releases the context when initialization returns false", async () => {
    native.initMultimodal.mockResolvedValue(false);
    await expect(connectLlama(settings)).rejects.toThrow("initialization failed");
    expect(native.release).toHaveBeenCalledTimes(1);
    expect(native.getMultimodalSupport).not.toHaveBeenCalled();
  });
  it("releases the context when native initialization throws", async () => {
    native.initMultimodal.mockRejectedValue(new Error("incompatible projector"));
    await expect(connectLlama(settings)).rejects.toThrow("incompatible projector");
    expect(native.release).toHaveBeenCalledTimes(1);
  });
  it("does not advertise vision when the engine reports no vision support", async () => {
    native.getMultimodalSupport.mockResolvedValue({ vision: false });
    expect((await connectLlama(settings))?.imagesSupported).toBe(false);
  });
});
