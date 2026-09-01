import { jest, describe, it, expect } from "@jest/globals";

const runMock = jest.fn();

// ESM module namespaces are frozen, so `jest.spyOn` can't intercept the
// `run` binding that index.js imports.  Register the mock before the module
// under test is imported instead.
jest.unstable_mockModule("./find-python-projects.js", () => ({
  run: runMock,
}));

await import("./index.js");

describe("index", () => {
  it("calls run when imported", () => {
    expect(runMock).toHaveBeenCalled();
  });
});
