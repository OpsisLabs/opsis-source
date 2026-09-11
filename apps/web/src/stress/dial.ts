// Coordinates use the dial's SVG viewBox, independent of device size.
export function dialPercent(x: number, y: number): number {
  const angle = Math.atan2(Math.max(0, 158 - y), x - 150);
  return Math.round(100 - (angle / Math.PI) * 200);
}
