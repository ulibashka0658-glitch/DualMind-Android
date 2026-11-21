import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import DiagnosticsSettingsGroup from "../components/groups/diagnostics-settings-group";

const mockSetModel = jest.fn();
jest.mock("@/context", () => ({
  useSystem: () => ({ colorScheme: { onSurface: "#ffffff", primary: "#222222", onPrimary: "#ffffff" } }),
  useLLM: () => ({ type: "Llama", ready: true, busy: false, imagesSupported: false, models: ["actual-model"], setModel: mockSetModel }),
}));
jest.mock("@/context/ui-language", () => ({
  useUiLanguage: () => ({ language: "en" }),
  translateUi: (_language: string, _ru: string, en: string) => en,
}));
jest.mock("expo-application", () => ({}));
jest.mock("expo-device", () => ({}));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "local-command-" + Math.random().toString(36).slice(2)) }));
jest.mock("@/utilities/logger", () => ({ getLogs: () => [] }));

afterEach(() => { jest.restoreAllMocks(); mockSetModel.mockClear(); });

test.each(["allow", "cancel", "dismiss"] as const)("consent UI: %s", async choice => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(<DiagnosticsSettingsGroup />);
  fireEvent.press(screen.getByText("Check command confirmation"));
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  const [, , buttons, options] = alert.mock.calls[0];
  await act(async () => {
    if (choice === "dismiss") options?.onDismiss?.();
    else buttons?.find(b => b.text === (choice === "allow" ? "Allow" : "Cancel"))?.onPress?.();
  });
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
  const report = JSON.parse(alert.mock.calls[1][1] ?? "{}");
  expect(report.ok).toBe(choice === "allow");
  expect(report.simulated).toBe(choice === "allow");
  if (choice !== "allow") expect(report.error).toBe("user_denied");
  expect(mockSetModel).not.toHaveBeenCalled();
});

test("local read commands return current model state and list", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(<DiagnosticsSettingsGroup />);
  fireEvent.press(screen.getByText("Check local commands"));
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  const report = JSON.parse(alert.mock.calls[0][1] ?? "[]");
  expect(report).toHaveLength(3);
  expect(report.every((entry: {ok: boolean}) => entry.ok)).toBe(true);
  expect(report[0].data).toMatchObject({ provider: "Llama", ready: true });
  expect(report[2].data).toEqual(["actual-model"]);
  expect(mockSetModel).not.toHaveBeenCalled();
});
