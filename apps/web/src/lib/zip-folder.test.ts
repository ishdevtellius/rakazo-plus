// @vitest-environment node

import { describe, expect, it } from "vitest";
import { folderRootName, zipFolder } from "./zip-folder";

function pick(relativePath: string, content = "x"): File {
  const file = new File([content], relativePath.split("/").at(-1) ?? "f", {
    lastModified: 1_700_000_000_000,
  });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

async function entryNames(zip: File): Promise<string[]> {
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const names: string[] = [];
  for (let i = 0; i + 46 <= bytes.length; i += 1) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(i + 28, true);
    names.push(new TextDecoder().decode(bytes.slice(i + 46, i + 46 + nameLength)));
  }
  return names;
}

describe("zipFolder", () => {
  it("packs ordinary files and names the zip after the folder", async () => {
    const zipped = await zipFolder([pick("app/readme.md"), pick("app/src/index.ts")]);
    expect(folderRootName([pick("app/readme.md")])).toBe("app");
    expect(zipped.included).toBe(2);
    expect(zipped.file.name).toBe("app.zip");
    expect(await entryNames(zipped.file)).toEqual(["app/readme.md", "app/src/index.ts"]);
  });

  it.each([
    "app/.env",
    "app/.env.production",
    "app/id_ecdsa",
    "app/id_dsa.pub",
    "app/server.key",
    "app/terraform.tfstate",
    "app/prod.tfvars",
    "app/service-account-prod.json",
    "app/client_secret.json",
    "app/kubeconfig",
    "app/.htpasswd",
    "app/.pgpass",
    "app/aws_credentials",
    "app/cert.pem",
  ])("leaves out %s and reports it", async (path) => {
    const zipped = await zipFolder([pick("app/readme.md"), pick(path)]);
    expect(zipped.skipped).toContain(path);
    expect(await entryNames(zipped.file)).toEqual(["app/readme.md"]);
  });

  it("leaves out folders that hold credentials and says so, but not build folders", async () => {
    const zipped = await zipFolder([
      pick("app/readme.md"),
      pick("app/.ssh/id_ed25519"),
      pick("app/.aws/config"),
      pick("app/node_modules/x/index.js"),
      pick("app/dist/out.js"),
    ]);
    expect(await entryNames(zipped.file)).toEqual(["app/readme.md"]);
    expect(zipped.skipped).toEqual(["app/.ssh/id_ed25519", "app/.aws/config"]);
  });

  it("never packs a path that climbs out of the folder", async () => {
    const zipped = await zipFolder([pick("app/readme.md"), pick("app/../../etc/passwd")]);
    expect(await entryNames(zipped.file)).toEqual(["app/readme.md"]);
  });

  it("refuses a folder too large to read into memory, without reading it", async () => {
    const huge = pick("app/big.bin");
    Object.defineProperty(huge, "size", { value: 300 * 1024 * 1024 });
    const zipped = await zipFolder([pick("app/readme.md"), huge]);
    expect(zipped.tooLarge).toBe(true);
    expect(zipped.included).toBe(0);
    expect(zipped.file.size).toBe(0);
  });
});
