import { fileToVaultPhoto, MAX_SOURCE_PHOTO_BYTES } from "../vault/photo";
import type { VaultPhoto } from "../vault/types";

export async function catalogImageToVaultPhoto(
  imageUrl: string,
  catalogId: string,
  signal?: AbortSignal,
): Promise<VaultPhoto> {
  const url = validatedCatalogImageUrl(imageUrl);
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "force-cache",
    signal,
  });
  if (!response.ok || response.url !== url.href) {
    throw new Error("Catalog thumbnail is unavailable");
  }
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (mimeType !== "image/png") throw new Error("Catalog thumbnail has an invalid type");
  const blob = await response.blob();
  if (blob.size < 1 || blob.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error("Catalog thumbnail has an invalid size");
  }
  return fileToVaultPhoto(
    new File([blob], `${catalogId}-catalog.png`, { type: "image/png" }),
  );
}

function validatedCatalogImageUrl(value: string): URL {
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.protocol !== "https:"
    || url.hostname !== "assets.tcgdex.net"
    || url.port !== ""
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
    || segments.length !== 5
    || segments[0] !== "en"
    || segments[4] !== "low.png") {
    throw new Error("Catalog thumbnail URL is invalid");
  }
  return url;
}
