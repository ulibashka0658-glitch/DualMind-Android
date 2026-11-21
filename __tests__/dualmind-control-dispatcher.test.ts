import { createControlDispatcher } from "../utils/dualmind-control-dispatcher";

function setup(allowed = true) {
  const selectModel = jest.fn();
  const cancelTask = jest.fn();
  const confirm = jest.fn(async () => allowed);
  const dispatch = createControlDispatcher({
    status: () => ({ ready: true }),
    diagnostics: () => ({ apiKey: "secret" }),
    models: () => ["model-a"],
    tasks: () => ["task-a"],
    selectModel, cancelTask, confirm,
  });
  return { dispatch, selectModel, cancelTask, confirm };
}
const command = (action: string, params?: Record<string, unknown>) => ({
  version: 1, id: "command-001", action, params,
});
test("reads status without confirmation", async () => {
  const s = setup();
  expect(await s.dispatch(command("status.read"))).toMatchObject({ ok: true, data: { ready: true } });
  expect(s.confirm).not.toHaveBeenCalled();
});
test("redacts diagnostics", async () => {
  expect(await setup().dispatch(command("diagnostics.read"))).toMatchObject({ ok: true, data: { apiKey: "[REDACTED]" } });
});
test("denial prevents model changes", async () => {
  const s = setup(false);
  expect(await s.dispatch(command("models.select", { modelId: "model-a" }))).toMatchObject({ ok: false, error: "user_denied" });
  expect(s.selectModel).not.toHaveBeenCalled();
});
test("confirmed model changes execute only once", async () => {
  const s = setup();
  const cmd = command("models.select", { modelId: "model-a" });
  expect(await s.dispatch(cmd)).toMatchObject({ ok: true });
  expect(await s.dispatch(cmd)).toMatchObject({ ok: false, error: "duplicate_command" });
  expect(s.selectModel).toHaveBeenCalledTimes(1);
});
test("unknown target is rejected", async () => {
  const s = setup();
  expect(await s.dispatch(command("tasks.cancel", { taskId: "missing" }))).toMatchObject({ ok: false, error: "unknown_target" });
  expect(s.cancelTask).not.toHaveBeenCalled();
});
test("unsupported command is rejected", async () => {
  expect(await setup().dispatch(command("shell.run"))).toMatchObject({ ok: false });
});

describe("model lifecycle commands", () => {
  function lifecycle(allowed = true, enabled = true) {
    const stopModel = jest.fn(async () => {});
    const unloadModel = jest.fn(async () => {});
    const confirm = jest.fn(async () => allowed);
    const dispatch = createControlDispatcher({
      status: () => ({}), diagnostics: () => ({}),
      models: () => ["model-a"], tasks: () => [],
      selectModel: jest.fn(), cancelTask: jest.fn(), confirm,
      ...(enabled ? { stopModel, unloadModel } : {}),
    });
    return { dispatch, stopModel, unloadModel, confirm };
  }
  for (const action of ["models.stop", "models.unload"]) {
    test(action + " requires consent", async () => {
      const s = lifecycle(false);
      expect(await s.dispatch(command(action))).toMatchObject({ ok: false, error: "user_denied" });
      expect(s.stopModel).not.toHaveBeenCalled();
      expect(s.unloadModel).not.toHaveBeenCalled();
    });
    test(action + " fails closed without handler", async () => {
      const s = lifecycle(true, false);
      expect(await s.dispatch(command(action))).toMatchObject({ ok: false, error: "unsupported_action" });
      expect(s.confirm).not.toHaveBeenCalled();
    });
    test(action + " executes only once", async () => {
      const s = lifecycle();
      const cmd = command(action);
      expect(await s.dispatch(cmd)).toMatchObject({ ok: true, data: { accepted: true } });
      expect(await s.dispatch(cmd)).toMatchObject({ ok: false, error: "duplicate_command" });
      expect(action === "models.stop" ? s.stopModel : s.unloadModel).toHaveBeenCalledTimes(1);
      expect(action === "models.stop" ? s.unloadModel : s.stopModel).not.toHaveBeenCalled();
    });
  }
  test("blocks overlapping lifecycle commands and unlocks after completion", async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const unloadModel = jest.fn();
    const dispatch = createControlDispatcher({
      status: () => ({}), diagnostics: () => ({}), models: () => [], tasks: () => [],
      selectModel: jest.fn(), cancelTask: jest.fn(), confirm: async () => true,
      stopModel: () => pending, unloadModel,
    });
    const first = dispatch(command("models.stop"));
    const second = { ...command("models.unload"), id: "command-002" };
    expect(await dispatch(second)).toMatchObject({ ok: false, error: "dispatcher_busy" });
    expect(unloadModel).not.toHaveBeenCalled();
    finish();
    expect(await first).toMatchObject({ ok: true });
    expect(await dispatch(second)).toMatchObject({ ok: true });
    expect(unloadModel).toHaveBeenCalledTimes(1);
  });
  test("handler failure does not leave dispatcher locked", async () => {
    const dispatch = createControlDispatcher({
      status: () => ({}), diagnostics: () => ({}), models: () => [], tasks: () => [],
      selectModel: jest.fn(), cancelTask: jest.fn(), confirm: async () => true,
      stopModel: async () => { throw new Error("failure"); }, unloadModel: jest.fn(),
    });
    expect(await dispatch(command("models.stop"))).toMatchObject({ ok: false, error: "command_failed" });
    expect(await dispatch({ ...command("models.unload"), id: "command-002" })).toMatchObject({ ok: true });
  });
});
