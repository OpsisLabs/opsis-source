import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { preloadVaultVisualizations, useVaultVisualizations } from "./vault-visualizations-loader";

function Probe() {
  const charts = useVaultVisualizations();
  return <p>{charts ? "charts ready" : "charts pending"}</p>;
}

describe("Vault chart loader", () => {
  // Once the code is in, a chart is part of the first render of its data, so
  // nothing is revealed later and the page does not move under the pointer.
  it("gives the charts on the first render once the code has loaded", async () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("charts pending");
    await preloadVaultVisualizations();
    expect(renderToStaticMarkup(<Probe />)).toContain("charts ready");
  });

  it("starts one load however often it is asked", () => {
    expect(preloadVaultVisualizations()).toBe(preloadVaultVisualizations());
  });
});
