// Packs a folder picked with <input webkitdirectory> into one .zip File so it fits the single-attachment path.
// No dependencies: a minimal ZIP writer (deflate-raw through CompressionStream when the browser has it, otherwise stored).

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".cache",
  ".idea",
  ".vscode",
]);
// Folders that hold credentials: never packed, and reported so the owner knows they were left out.
const SECRET_DIRS = new Set([".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", ".terraform"]);
// Secret-looking names are never packed; the picker reports what was left out.
const SKIP_FILE = [
  /^\.DS_Store$/i,
  /^\.env(\..*)?$/i,
  /\.(pem|p12|pfx|keystore)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /\.(key|jks|ppk|gpg)$/i,
  /^\.(npmrc|pypirc|netrc|htpasswd|pgpass|dockercfg)$/i,
  /\.(tfstate|tfvars)(\.backup)?$/i,
  /^(service[-_]?account|client[-_]?secrets?).*\.json$/i,
  /^kubeconfig$/i,
  /(^|[._-])(secret|secrets|credentials)([._-]|$)/i,
];
const MAX_FILES = 5000;
/** Everything is read into memory to be packed, so a folder this large is refused up front. */
const MAX_RAW_BYTES = 200 * 1024 * 1024;

export type FolderZip = {
  file: File;
  included: number;
  skipped: string[];
  /** The folder is too large to pack; nothing was read. */
  tooLarge?: boolean;
};

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function folderRootName(files: readonly File[]): string {
  const first = files.find((file) => file.webkitRelativePath)?.webkitRelativePath ?? "";
  return first.split("/")[0] || "folder";
}

export async function zipFolder(files: readonly File[]): Promise<FolderZip> {
  const root = folderRootName(files);
  const skipped: string[] = [];
  const chosen: { path: string; file: File }[] = [];
  for (const file of files) {
    const rel = file.webkitRelativePath || file.name;
    const parts = rel.split("/");
    const name = parts[parts.length - 1] ?? file.name;
    const dirs = parts.slice(1, -1);
    // A path that climbs out of the folder is never packed.
    if (parts.some((part) => part === "..")) continue;
    if (dirs.some((dir) => SECRET_DIRS.has(dir))) {
      skipped.push(rel);
      continue;
    }
    if (dirs.some((dir) => SKIP_DIRS.has(dir))) continue;
    if (SKIP_FILE.some((pattern) => pattern.test(name))) {
      skipped.push(rel);
      continue;
    }
    if (chosen.length >= MAX_FILES) {
      skipped.push(rel);
      continue;
    }
    chosen.push({ path: rel, file });
  }
  const rawBytes = chosen.reduce((total, item) => total + item.file.size, 0);
  if (rawBytes > MAX_RAW_BYTES) {
    return {
      file: new File([], `${root}.zip`, { type: "application/zip" }),
      included: 0,
      skipped,
      tooLarge: true,
    };
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { path, file } of chosen) {
    const raw = new Uint8Array(await file.arrayBuffer());
    const deflated = raw.length > 0 ? await deflateRaw(raw) : null;
    const useDeflate = deflated !== null && deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const nameBytes = encoder.encode(path);
    const { time, day } = dosDateTime(new Date(file.lastModified || Date.now()));
    const crc = crc32(raw);
    const method = useDeflate ? 8 : 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, method, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, day, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, chosen.length, true);
  end.setUint16(10, chosen.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const blob = new Blob([...chunks, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/zip",
  });
  return {
    file: new File([blob], `${root}.zip`, { type: "application/zip", lastModified: Date.now() }),
    included: chosen.length,
    skipped,
  };
}
