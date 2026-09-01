import { jest } from "@jest/globals";
import mapValues from "lodash/mapValues.js";

// ESM namespace objects are sealed, so jest.spyOn cannot patch @actions/core.
// Mock the module before importing the code under test instead.
const infoMock = jest.fn();
const getInputMock = jest.fn();
const setFailedMock = jest.fn();
const setOutputMock = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  info: infoMock,
  getInput: getInputMock,
  setFailed: setFailedMock,
  setOutput: setOutputMock,
}));

const { run } = await import("./find-python-projects.js");

describe("find-python-projects", () => {

  const inputsDefaults = {
    "additional-export-paths": "",
    "exclude-commands": "",
  };
  let inputs = {};
  let outputs = {};

  beforeEach(() => {
    jest.clearAllMocks();
    inputs = {
      ...inputsDefaults,
    };
    outputs = {};

    // Mock the action's inputs
    getInputMock.mockImplementation((name) => {
      return inputs[name];
    });

    setOutputMock.mockImplementation((name, value) => {
      outputs[name] = value;
    });
  });

  it("finds projects", async () => {
    inputs["root-dir"] = "test-fixtures/multi-project";
    await run();
    expect(deserializeJsonValues(outputs)).toMatchSnapshot();
    expect(infoMock).toHaveBeenCalled();
  });

  it("Calls setFailed on error", async () => {
    inputs["root-dir"] = "test-fixtures/invalid-project";
    await run();
    expect(setFailedMock).toHaveBeenCalled();
  });

  it("Exports keys as instructed", async () => {
    inputs["additional-export-paths"] = "tool.export.me.please,not.present";
    inputs["root-dir"] = "test-fixtures/project-with-exports";
    await run();
    expect(deserializeJsonValues(outputs)).toMatchSnapshot();
    expect(infoMock).toHaveBeenCalled();
  });

  it("doesn't export commands we should globally skip", async () => {
    inputs["root-dir"] = "test-fixtures/multi-project";
    inputs["exclude-commands"] = "test";
    await run();
    expect(deserializeJsonValues(outputs)).toMatchSnapshot();
    expect(infoMock).toHaveBeenCalled();
  });

  it("doesn't export commands we should skip for certain projects", async () => {
    inputs["root-dir"] = "test-fixtures/multi-project";
    inputs["exclude-commands"] = `
        project=sub-project-2,command=something-arbitrary
        project=project-5,command=test
        project=project-5,command=install
    `;
    await run();
    expect(deserializeJsonValues(outputs)).toMatchSnapshot();
    expect(infoMock).toHaveBeenCalled();
  });
});

function deserializeJsonValues(obj) {
  return mapValues(obj, (val) => JSON.parse(val));
}
