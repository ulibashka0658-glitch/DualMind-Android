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
