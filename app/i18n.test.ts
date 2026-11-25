import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("preserves empty translations on the server and in the browser", async () => {
  const { createRequestI18n } = await import("./i18n");
  const serverI18n = await createRequestI18n("en");
  const key = "components.entityPage.publicIdDetails.ordinalSuffix";

  expect(serverI18n.t(key)).toBe("");
  await serverI18n.changeLanguage("ja");
  expect(serverI18n.t(key)).toBe("つ目");

  vi.resetModules();
  vi.stubGlobal("document", { cookie: "app_locale=en" });
  const { default: browserI18n } = await import("./i18n");
  expect(browserI18n.t(key)).toBe("");
  await browserI18n.changeLanguage("ja");
  expect(browserI18n.t(key)).toBe("つ目");
});
