import { fileToVaultPhoto, MAX_SOURCE_PHOTO_BYTES } from "../vault/photo";
import { translateCurrent } from "../i18n/translate";
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
    throw new Error(translateCurrent("collectibles.thumbnail.unavailable"));
  }
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (mimeType !== "image/png") throw new Error(translateCurrent("collectibles.thumbnail.invalidType"));
  const blob = await response.blob();
  if (blob.size < 1 || blob.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error(translateCurrent("collectibles.thumbnail.invalidSize"));
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
    throw new Error(translateCurrent("collectibles.thumbnail.invalidUrl"));
  }
  return url;
}
