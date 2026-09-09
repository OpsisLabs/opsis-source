export type ShoppingBrief = { name: string; set: string; number: string; printing: string; condition: string; grader: string; grade: string };
export function shoppingQuery(brief: ShoppingBrief): string {
  const parts = [brief.name, brief.set, brief.number, brief.printing, brief.condition, brief.grader, brief.grade].map(part => part.trim());
  if (!parts[0] || !parts[1] || !parts[2] || parts.some(part => part.length > 80)) throw new Error("Enter a card name, set and collector number; keep each field under 81 characters.");
  return parts.filter(Boolean).join(" ");
}
export function shoppingLinks(brief: ShoppingBrief) {
  const query = shoppingQuery(brief);
  const base = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
  return { query, listings: base, completed: `${base}&LH_Sold=1&LH_Complete=1` };
}
