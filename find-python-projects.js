import * as core from "@actions/core";

import fs from "node:fs/promises";
import path from "node:path";

import globby from "globby";
import TOML from "@iarna/toml";
import _get from "lodash/get.js";

export { determineSkips, findPythonProjects, run };

const GLOBAL_KEY = "__GLOBAL__"; // reserved key for commands without a project specified

async function run() {
  try {
    const rootDir = core.getInput("root-dir");
    const desiredExportPathsRaw = core.getInput("additional-export-paths");
    const desiredExportPaths =
      desiredExportPathsRaw === "" ? null : desiredExportPathsRaw.split(",");

    core.info(`Searching in "${rootDir}" ...`);

    const skips = determineSkips(core.getInput("exclude-commands"));
    const output = await findPythonProjects(rootDir, desiredExportPaths, skips);

    core.setOutput("projects", JSON.stringify(output.projects));
    core.setOutput(
      "projects-by-command",
      JSON.stringify(output.projectsByCommand),
    );
    core.setOutput("paths", JSON.stringify(output.paths));
  } catch (error) {
    core.setFailed(error.message);
  }
}

/**
 * @param {string} rootDir
 * @param {string[]?} desiredExportPaths
 * @param {Object<string, string>} skips
 */
async function findPythonProjects(rootDir, desiredExportPaths, skips) {
  const globbyOpts = {
    gitignore: true,
  };
  if (rootDir) {
    globbyOpts.cwd = rootDir;
  }

  const candidatePaths = await globby("**/pyproject.toml", globbyOpts);
  candidatePaths.sort();

  const projects = [];

  for await (const candidatePath of candidatePaths) {
    const pyprojectPath = path.join(rootDir, candidatePath);
    const project = await createProjectResult(
      pyprojectPath,
      desiredExportPaths,
      skips,
    );
    projects.push(project);
  }

  return {
    projects: projects,
    paths: projects.map((project) => project.path),
    projectsByCommand: getProjectsByCommand(projects),
  };
}

/**
 * @param {string} pyprojectPath
 * @param {string[]?} desiredExportPaths
 * @param {Object<string, string>} skips
 */
async function createProjectResult(pyprojectPath, desiredExportPaths, skips) {
  const projectToml = await fs.readFile(pyprojectPath);
  const projectTomlParsed = TOML.parse(projectToml);

  const projectName = getBestConfig(projectTomlParsed, PROJECT_NAME_PATHS);
  const pythonVersion = getBestConfig(projectTomlParsed, PYTHON_VERSION_PATHS);

  const commands = generateCommands(projectTomlParsed);
  const commandsFiltered = Object.fromEntries(
    Object.entries(commands).filter(([commandName]) => {
      const globalSkips = skips[GLOBAL_KEY] ?? [];
      const projectSkips = skips[projectName] ?? [];
      return (
        !globalSkips.includes(commandName) &&
        !projectSkips.includes(commandName)
      );
    }),
  );

  const arbitraryMetadata = {};
  if (desiredExportPaths) {
    desiredExportPaths.forEach((path) => {
      arbitraryMetadata[path] = _get(projectTomlParsed, path);
    });
  }

  return {
    buildBackend: getBuildBackend(projectTomlParsed),
    commands: commandsFiltered,
    directory: path.dirname(pyprojectPath),
    name: projectName,
    path: pyprojectPath,
    pythonVersion: pythonVersion,
    exports: arbitraryMetadata,
  };
}

function getProjectsByCommand(projects) {
  const commands = {};

  for (const project of projects) {
    for (const [commandName, commandValue] of Object.entries(
      project.commands,
    )) {
      if (!commandValue) continue;

      let commandEntry = commands[commandName];
      if (!commandEntry) {
        commandEntry = commands[commandName] = [];
      }
      commandEntry.push(project);
    }
  }

  return commands;
}

function getBestConfig(configRoot, knownPaths, defaultValue = null) {
  for (const knownPath of knownPaths) {
    const value = _get(configRoot, knownPath);
    if (value) return value;
  }
  return defaultValue;
}

function getBuildBackend(projectTomlParsed) {
  return projectTomlParsed?.["build-system"]?.["build-backend"];
}

function generateCommands(projectTomlParsed) {
  const commands = {};

  for (const source of KNOWN_COMMAND_SOURCES) {
    const sourceCommands = _get(projectTomlParsed, source.tomlPath);
    if (!sourceCommands) continue;

    for (const [commandName, commandTomlValue] of Object.entries(
      sourceCommands,
    )) {
      // Skip if the command has already been set.
      if (commands[commandName]) continue;

      const runnerPrefix = source.context.runnerPrefix;
      if (runnerPrefix) {
        commands[commandName] = runnerPrefix + " " + commandName;
      } else {
        commands[commandName] = commandTomlValue;
      }
    }
  }

  if (!commands.install) {
    commands.install = determineInstallCommand(projectTomlParsed);
  }

  return commands;
}

/**
 * Parse a GitHub Actions input representing what commands to skip for certain projects into
 * a map of project → commandToSkip.
 *
 * Rules:
 * - If a project is defined, the project name becomes the key, and the command is its value.
 * - If no project is defined, the command goes under the reserved "__GLOBAL__" key.
 *
 * @param {string} skipsInput - The raw input string.
 * @returns {Record<string, string[]>} Object mapping project (or "__GLOBAL__") to its commands to skip.
 */
function determineSkips(skipsInput) {
  const lines = skipsInput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const skipsMap = {};
  for (const line of lines) {
    const pairs = line.split(",").map((p) => p.trim());

    // Get an object where keys are what's before the `=` and values are
    // what's after.
    const kv = Object.fromEntries(
      pairs.map((p) => {
        const [k, v] = p.split("=", 2);
        return [k.trim(), v?.trim()];
      }),
    );

    let project = kv.project;
    let command = kv.command;
    if (project && !command) {
      continue;
    }

    project = project ?? GLOBAL_KEY;
    command = command ?? line.trim();

    let entry = skipsMap[project];
    if (!entry) {
      entry = skipsMap[project] = [];
    }
    entry.push(command);
  }
  return skipsMap;
}

function determineInstallCommand(projectTomlParsed) {
  const buildBackend = getBuildBackend(projectTomlParsed);

  if (!buildBackend) return null;

  const buildBackendPackage = buildBackend.split(".")[0];

  return INSTALL_COMMANDS_BY_BUILD_BACKEND_PACKAGE[buildBackendPackage] ?? null;
}

const INSTALL_COMMANDS_BY_BUILD_BACKEND_PACKAGE = {
  poetry: "poetry install",
  pdm: "pdm install",
};

const PROJECT_NAME_PATHS = [
  "project.name", // PEP-621
  "tool.poetry.name",
];

const PYTHON_VERSION_PATHS = [
  "project.requires-python", // PEP-621
  "tool.poetry.dependencies.python",
];

const POE_RUN_PREFIX = "poe";
const PDM_RUN_PREFIX = "pdm run";

const KNOWN_COMMAND_SOURCES = [
  { tomlPath: "tool.tasks", context: {} },
  { tomlPath: "tool.pdm.scripts", context: { runnerPrefix: PDM_RUN_PREFIX } },
  { tomlPath: "tool.poe.tasks", context: { runnerPrefix: POE_RUN_PREFIX } },
];
