export type LabView = "atlas" | "surface" | "research";

export function parseLabView(value: string | null): LabView {
  return value === "surface" || value === "research" ? value : "atlas";
}
