import React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { LanguageModelProvider, useLLM } from "../context/language-model";

const mockConnect = jest.fn();
const mockSetModelKey = jest.fn();
let mockKey = "a";
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true, default: { getItem: jest.fn(async () => "Llama"), setItem: jest.fn(async () => {}) },
}));
jest.mock("../context/language-model/llama", () => ({}));
jest.mock("../context/language-model/providers", () => ({
  LanguageModelDefinitions: {
    Llama: { settings: ["modelKey"], connectWith: ["modelKey"], connect: (...args: unknown[]) => mockConnect(...args) },
  },
}));
jest.mock("../context/language-model/settings", () => ({
  useLanguageModelSettings: () => ({
    loaded: true, values: { modelKey: mockKey, modelFiles: {}, parameters: {} }, setModelKey: mockSetModelKey,
  }),
}));

beforeEach(() => { jest.useFakeTimers(); mockKey = "a"; mockConnect.mockReset(); });
afterEach(() => { jest.useRealTimers(); });

async function tick() {
  await act(async () => { jest.advanceTimersByTime(300); });
}

test("provider excludes concurrent prompts and releases only after generation settles", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const first = { prompt: jest.fn(() => pending), stop: jest.fn(async () => {}), release: jest.fn(async () => {}) };
  const second = { prompt: jest.fn(async () => {}), release: jest.fn(async () => {}) };
  mockConnect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const hook = renderHook(() => useLLM(), { wrapper: LanguageModelProvider });
  await act(async () => {});
  await tick();
  expect(hook.result.current.ready).toBe(true);
  let generation!: Promise<void>;
  await act(async () => {
    generation = hook.result.current.prompt([], jest.fn());
    await hook.result.current.prompt([], jest.fn());
  });
  expect(first.prompt).toHaveBeenCalledTimes(1);
  mockKey = "b";
  hook.rerender({});
  await tick();
  expect(first.stop).toHaveBeenCalledTimes(1);
  expect(first.release).not.toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(hook.result.current.ready).toBe(false);
  await act(async () => { finish(); await generation; });
  expect(first.release).toHaveBeenCalledTimes(1);
  expect(mockConnect).toHaveBeenCalledTimes(2);
  expect(hook.result.current.ready).toBe(true);
  hook.unmount();
  await act(async () => {});
});

test("failed native release prevents further connections until provider restart", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  const first = { prompt: jest.fn(async () => {}), release: jest.fn(async () => { throw new Error("release failure"); }) };
  mockConnect.mockResolvedValue(first);
  const hook = renderHook(() => useLLM(), { wrapper: LanguageModelProvider });
  try {
    await act(async () => {});
    await tick();
    expect(hook.result.current.ready).toBe(true);
    mockKey = "b";
    hook.rerender({});
    await tick();
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.busy).toBe(false);
    mockKey = "c";
    hook.rerender({});
    await tick();
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(hook.result.current.ready).toBe(false);
    expect(errorLog).toHaveBeenCalled();
  } finally {
    hook.unmount();
    await act(async () => {});
    errorLog.mockRestore();
  }
});


test("slow native release warns without allowing another model to connect", async () => {
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const first = { prompt: jest.fn(async () => {}), release: jest.fn(() => pending) };
  const second = { prompt: jest.fn(async () => {}), release: jest.fn(async () => {}) };
  mockConnect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const hook = renderHook(() => useLLM(), { wrapper: LanguageModelProvider });
  try {
    await act(async () => {});
    await tick();
    expect(hook.result.current.ready).toBe(true);
    mockKey = "b";
    hook.rerender({});
    await tick();
    expect(first.release).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("cleanup is taking longer"));
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.busy).toBe(true);
    await act(async () => { finish(); });
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.busy).toBe(false);
  } finally {
    await act(async () => { finish(); });
    hook.unmount();
    await act(async () => {});
    warning.mockRestore();
  }
});
