import { hashBytes, OpenDataError, type LocalFile } from "./model";
export const MAX_FILE_BYTES = 50_000_000;
export const MAX_TOTAL_BYTES = 100_000_000;
export function validateLocalFiles(
  files: readonly Pick<File, "name" | "size">[],
) {
  if (
    !files.length ||
    files.length > 4 ||
    files.some((f) => !f.size || f.size > MAX_FILE_BYTES) ||
    files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES
  )
    throw new OpenDataError("localLimit");
  for (const file of files)
    if (
      !/\.csv$/i.test(file.name) ||
      file.name.length > 255 ||
      Array.from(file.name).some(
        (c) => c.charCodeAt(0) < 32 || c === "/" || c === "\\",
      )
    )
      throw new OpenDataError("csvError", file.name);
}
export function tableNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let base =
      name
        .replace(/\.csv$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "") || "csv";
    if (!/^[a-z]/.test(base)) base = `csv_${base}`;
    base = base.slice(0, 55);
    let id = base,
      suffix = 2;
    while (used.has(id)) id = `${base}_${suffix++}`;
    used.add(id);
    return id;
  });
}
export async function readLocalFiles(
  files: readonly File[],
): Promise<LocalFile[]> {
  validateLocalFiles(files);
  const names = tableNames(files.map((f) => f.name));
  const inputs: LocalFile[] = [];
  for (const [i, file] of files.entries()) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (buffer.byteLength !== file.size)
      throw new OpenDataError("csvError", file.name);
    inputs.push({
      kind: "local",
      name: file.name,
      id: names[i],
      sha256: await hashBytes(buffer),
      bytes: buffer.byteLength,
      buffer,
    });
  }
  return inputs;
}
