import { parseOpenDatasetManifest, type OpenDataset } from "@rh-chain/shared";
import { OpenDataError, verifyDatasetBytes } from "./model";
const options = (signal: AbortSignal): RequestInit => ({
  signal,
  credentials: "omit",
  redirect: "error",
  referrerPolicy: "no-referrer",
  cache: "no-store",
});
async function readBounded(
  response: Response,
  max: number,
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > max || !response.body)
    throw new OpenDataError("fileError");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) throw new OpenDataError("fileError");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export async function fetchDatasetManifest(
  signal: AbortSignal,
  enabled = false,
) {
  if (!enabled) return null;
  const response = await fetch("/data/opsis/manifest.json", options(signal));
  if (
    response.status === 404 ||
    (response.ok && response.headers.get("content-type")?.includes("text/html"))
  )
    return null;
  if (!response.ok) throw new OpenDataError("manifestError");
  try {
    return parseOpenDatasetManifest(
      JSON.parse(
        new TextDecoder().decode(await readBounded(response, 1_000_000)),
      ),
    );
  } catch {
    throw new OpenDataError("manifestError");
  }
}
export async function fetchDataset(
  dataset: OpenDataset,
  signal: AbortSignal,
): Promise<Uint8Array> {
  // Also validate at this public boundary; file names can never select a URL/path.
  parseOpenDatasetManifest({ version: 1, datasets: [dataset] });
  const response = await fetch(
    `/data/opsis/${dataset.fileName}`,
    options(signal),
  );
  if (!response.ok) throw new OpenDataError("fileError");
  const bytes = await readBounded(response, 32 * 1024 * 1024);
  await verifyDatasetBytes(bytes, dataset.sha256);
  return bytes;
}
