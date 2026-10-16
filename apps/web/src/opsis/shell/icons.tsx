export type ToolIconName =
  | "research"
  | "stock"
  | "trades"
  | "world"
  | "check"
  | "perp"
  | "shocks"
  | "watch"
  | "saved"
  | "lab";
const paths: Record<ToolIconName, string> = {
  research: "M20 20l-6-6M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  stock: "M5 2h14v20H5zM8 7h8M8 11h8M8 15h5",
  trades: "M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4",
  world:
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c-6 6-6 14 0 20 6-6 6-14 0-20",
  check: "M5 2h14v20H5zM8 6h8M8 11h1M14 11h1M8 16h1M14 16h1",
  perp: "M4 21v-5M11 21V9M18 21V3",
  shocks: "M1 12h5l3-9 5 18 4-9h5",
  watch:
    "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  saved: "M5 2h14v20l-7-5-7 5z",
  lab: "M2 2h7v7H2zM15 2h7v7h-7zM2 15h7v7H2zM15 15h7v7h-7z",
};
export function ToolIcon({ name }: { name: ToolIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
