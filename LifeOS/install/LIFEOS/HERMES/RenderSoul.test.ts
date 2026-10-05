import { describe, expect, test } from "bun:test";
import { renderCoachConstitution } from "./RenderSoul.ts";

describe("Hermes soul characterization", () => {
  test("Notion coach soul is generic and contains its method", () => {
    const soul = renderCoachConstitution();
    expect(soul).toContain("Current → Ideal State");
    expect(soul).toContain("canonical");
    expect(soul).not.toContain("PRINCIPAL_MEMORY");
    expect(soul).not.toContain("Fixture Person's private goal");
  });
});
