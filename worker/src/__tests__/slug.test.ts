import { describe, expect, it } from "vite-plus/test";
import { slugify, generateDeploymentId } from "../slug.ts";

describe("slugify", () => {
  it("lowercases ASCII", () => {
    expect(slugify("My Project")).toBe("my-project");
  });

  it("replaces underscores with dashes", () => {
    expect(slugify("hello_world")).toBe("hello-world");
  });

  it("collapses multiple dashes", () => {
    expect(slugify("a---b")).toBe("a-b");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("-hello-")).toBe("hello");
  });

  it("returns site for non-ASCII only input", () => {
    expect(slugify("设计稿")).toBe("site");
  });

  it("returns site for empty input", () => {
    expect(slugify("")).toBe("site");
  });

  it("caps length at 56 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(56);
  });

  it("handles mixed ASCII and non-ASCII", () => {
    expect(slugify("my-项目-test")).toBe("my-test");
  });

  it("handles dots and special chars", () => {
    expect(slugify("my.project.v2")).toBe("my-project-v2");
  });
});

describe("generateDeploymentId", () => {
  it("generates id with 6-char random prefix", () => {
    const id = generateDeploymentId("test");
    expect(id).toMatch(/^[a-z0-9]{6}-test$/);
  });

  it("generates unique ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateDeploymentId("test"));
    }
    expect(ids.size).toBe(100);
  });
});
