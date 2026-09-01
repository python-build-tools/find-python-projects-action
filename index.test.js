import { jest } from "@jest/globals";

const runMock = jest.fn();

jest.unstable_mockModule("./find-python-projects.js", () => ({
  determineSkips: jest.fn(),
  findPythonProjects: jest.fn(),
  run: runMock,
}));

describe("index", () => {
  it("calls run when imported", async () => {
    await import("./index.js");

    expect(runMock).toHaveBeenCalled();
  });
});
