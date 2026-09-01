import { describe, it, expect } from "@jest/globals";

import { determineSkips } from "./find-python-projects.js";

describe("determineSkips", () => {
  const GLOBAL_KEY = "__GLOBAL__";

  it("puts command under the global key when no project is specified", () => {
    const input = `
      command=test
    `;
    expect(determineSkips(input)).toEqual({ [GLOBAL_KEY]: ["test"] });
  });

  it("uses project name as key and command as value when both are provided", () => {
    const input = `
      project=my_project,command=package
    `;
    expect(determineSkips(input)).toEqual({ my_project: ["package"] });
  });

  it("handles multiple lines: global + project", () => {
    const input = `
      command=test
      project=my_project,command=package
    `;
    expect(determineSkips(input)).toEqual({
      [GLOBAL_KEY]: ["test"],
      my_project: ["package"],
    });
  });

  it("trims whitespace and ignores empty lines", () => {
    const input = `

        command= build

        project=alpha ,  command=deploy

    `;
    expect(determineSkips(input)).toEqual({
      [GLOBAL_KEY]: ["build"],
      alpha: ["deploy"],
    });
  });

  it("append more entries when the same project appears multiple times", () => {
    const input = `
      project=alpha,command=build
      project=alpha,command=test
    `;
    expect(determineSkips(input)).toEqual({ alpha: ["build", "test"] });
  });

  it("falls back to the raw line when neither project nor command is present", () => {
    const input = "test";
    expect(determineSkips(input)).toEqual({
      [GLOBAL_KEY]: ["test"],
    });
  });
});
