#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const serviceDirectories = {
  postgres: join(repoRoot, "infra", "postgres"),
  redis: join(repoRoot, "infra", "redis"),
  minio: join(repoRoot, "infra", "minio"),
};

const startOrder = ["postgres", "redis", "minio"];
const stopOrder = ["minio", "redis", "postgres"];
const allowedActions = new Set([
  "up",
  "down",
  "restart",
  "fresh",
  "status",
  "logs",
]);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    action: "status",
    services: [...startOrder],
    follow: false,
    tail: 100,
    pruneVolumes: false,
    pruneMinioData: false,
    force: false,
  };

  let actionSet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!actionSet && !current.startsWith("--")) {
      options.action = current.toLowerCase();
      actionSet = true;
      continue;
    }

    if (current === "--services") {
      const rawValue = argv[index + 1];
      if (!rawValue) {
        fail(
          "Missing value for --services. Example: --services postgres,redis",
        );
      }

      options.services = rawValue
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (current === "--follow") {
      options.follow = true;
      continue;
    }

    if (current === "--tail") {
      const rawValue = argv[index + 1];
      if (!rawValue) {
        fail("Missing value for --tail.");
      }

      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        fail(`Invalid value for --tail: ${rawValue}`);
      }

      options.tail = parsed;
      index += 1;
      continue;
    }

    if (current === "--prune-volumes") {
      options.pruneVolumes = true;
      continue;
    }

    if (current === "--prune-minio-data") {
      options.pruneMinioData = true;
      continue;
    }

    if (current === "--force") {
      options.force = true;
      continue;
    }

    fail(`Unknown argument: ${current}`);
  }

  if (!allowedActions.has(options.action)) {
    fail(
      `Unknown action: ${options.action}. Valid actions: ${[...allowedActions].join(", ")}`,
    );
  }

  const seen = new Set();
  options.services = options.services.filter((service) => {
    if (!Object.hasOwn(serviceDirectories, service) || seen.has(service)) {
      return false;
    }

    seen.add(service);
    return true;
  });

  if (options.services.length === 0) {
    fail(
      `No valid services provided. Valid services: ${Object.keys(serviceDirectories).join(", ")}`,
    );
  }

  return options;
}

function resolveServices(requested, order) {
  return order.filter((service) => requested.includes(service));
}

function getComposeInvocation() {
  const dockerComposePlugin = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
    shell: false,
  });

  if (dockerComposePlugin.status === 0) {
    return {
      command: "docker",
      prefix: ["compose"],
    };
  }

  const dockerComposeBinary = spawnSync("docker-compose", ["version"], {
    stdio: "ignore",
    shell: false,
  });

  if (dockerComposeBinary.status === 0) {
    return {
      command: "docker-compose",
      prefix: [],
    };
  }

  fail("Neither 'docker compose' nor 'docker-compose' is available on PATH.");
}

function runCommand(command, args, workingDirectory, label) {
  console.log(`\n==> [${label}] ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: workingDirectory,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function invokeCompose(compose, service, args) {
  runCommand(
    compose.command,
    [...compose.prefix, ...args],
    serviceDirectories[service],
    service,
  );
}

function ensureMinioNetwork() {
  const inspect = spawnSync("docker", ["network", "inspect", "sondn_net"], {
    stdio: "ignore",
    shell: false,
  });

  if (inspect.status === 0) {
    return;
  }

  runCommand("docker", ["network", "create", "sondn_net"], repoRoot, "minio");
}

function clearMinioData(force) {
  if (!force) {
    fail(
      "Removing MinIO data is destructive. Re-run with --prune-minio-data --force.",
    );
  }

  const minioDataPath = join(serviceDirectories.minio, "data");
  for (const entry of readdirSync(minioDataPath, { withFileTypes: true })) {
    rmSync(join(minioDataPath, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

function startServices(compose, services, forceRecreate) {
  for (const service of services) {
    if (service === "minio") {
      ensureMinioNetwork();
    }

    const args = ["up", "-d"];
    if (forceRecreate) {
      args.push("--force-recreate");
    }

    invokeCompose(compose, service, args);
  }
}

function stopServices(compose, services, pruneVolumes) {
  for (const service of services) {
    const args = ["down", "--remove-orphans"];
    if (pruneVolumes) {
      args.push("--volumes");
    }

    invokeCompose(compose, service, args);
  }
}

function showStatus(compose, services) {
  for (const service of services) {
    invokeCompose(compose, service, ["ps"]);
  }
}

function showLogs(compose, services, tail, follow) {
  if (follow && services.length !== 1) {
    fail(
      "Use --follow with a single service, for example: logs --services minio --follow",
    );
  }

  for (const service of services) {
    const args = ["logs", "--tail", String(tail)];
    if (follow) {
      args.push("--follow");
    }

    invokeCompose(compose, service, args);
  }
}

const options = parseArgs(process.argv.slice(2));
const compose = getComposeInvocation();
const selectedStartServices = resolveServices(options.services, startOrder);
const selectedStopServices = resolveServices(options.services, stopOrder);

if (options.pruneMinioData && !options.services.includes("minio")) {
  fail(
    "--prune-minio-data can only be used when minio is included in --services.",
  );
}

switch (options.action) {
  case "up": {
    startServices(compose, selectedStartServices, false);
    break;
  }

  case "down": {
    stopServices(compose, selectedStopServices, options.pruneVolumes);
    if (options.pruneMinioData) {
      clearMinioData(options.force);
    }
    break;
  }

  case "restart": {
    stopServices(compose, selectedStopServices, false);
    startServices(compose, selectedStartServices, false);
    break;
  }

  case "fresh": {
    stopServices(compose, selectedStopServices, options.pruneVolumes);
    if (options.pruneMinioData) {
      clearMinioData(options.force);
    }
    startServices(compose, selectedStartServices, true);
    break;
  }

  case "status": {
    showStatus(compose, selectedStartServices);
    break;
  }

  case "logs": {
    showLogs(compose, selectedStartServices, options.tail, options.follow);
    break;
  }

  default: {
    fail(`Unhandled action: ${options.action}`);
  }
}
