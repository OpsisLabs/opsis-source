export class SqlRefusal extends Error {
  constructor() {
    super("Query refused");
    this.name = "SqlRefusal";
  }
}
const refuse = (): never => {
  throw new SqlRefusal();
};
const forbidden =
  /^(install|load|attach|detach|copy|export|import|set|reset|pragma|call|create|alter|drop|insert|update|delete|merge|vacuum|force|checkpoint|execute|prepare|grant|revoke|secret|read_\w*|write_\w*|glob|query|query_table|http\w*|sqlite\w*|postgres\w*|mysql\w*|iceberg\w*|delta\w*|parquet_scan|csv_scan|json_scan|st_read|random|gen_random_uuid|setseed|transaction_timestamp|get_current_timestamp|current_localtimestamp|current_localtime|uuid\w*|now|today|current_timestamp|current_date|current_time|nextval|setval)$/i;
/** Deliberately narrow SQL dialect. Comments are token separators, never concatenated. */
export function guardQuery(query: string): string {
  if (
    !query.trim() ||
    query.length > 50_000 ||
    Array.from(query).some((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    return refuse();
  let i = 0;
  let terminator = -1;
  const tokens: string[] = [];
  while (i < query.length) {
    const tail = query.slice(i);
    if (/^\s/.test(tail)) {
      i++;
      continue;
    }
    if (tail.startsWith("--")) {
      const end = query.indexOf("\n", i + 2);
      i = end < 0 ? query.length : end + 1;
      continue;
    }
    if (tail.startsWith("/*")) {
      let depth = 1;
      i += 2;
      while (i < query.length && depth) {
        if (query.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (query.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) return refuse();
      continue;
    }
    if (tail[0] === "'" || tail[0] === '"') {
      const quote = tail[0];
      let value = "";
      let closed = false;
      i++;
      while (i < query.length) {
        if (query[i] === quote) {
          if (query[i + 1] === quote) {
            value += quote;
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        value += query[i++];
      }
      if (
        !closed ||
        (quote === '"' && forbidden.test(value)) ||
        /[\\/:~]|\.(?:parquet|csv|json|db|duckdb|wasm|txt)\b|^\./i.test(value)
      )
        return refuse();
      tokens.push("<quoted>");
      continue;
    }
    const word = /^[a-z_][a-z_0-9]*/i.exec(tail)?.[0];
    if (word) {
      if (forbidden.test(word)) return refuse();
      tokens.push(word.toLowerCase());
      i += word.length;
      continue;
    }
    // No dollar strings, interpolation, backslash escapes, backticks or URL syntax.
    if (!"0123456789.,()+*-/=<>!%:;[]|&^".includes(tail[0])) return refuse();
    if (tail[0] === ":" && !(tail.startsWith("::") || query[i - 1] === ":"))
      return refuse();
    if (tail[0] === ";") terminator = i;
    tokens.push(tail[0]);
    i++;
  }
  if (tokens[0] !== "select" && tokens[0] !== "with") return refuse();
  if (tokens.at(-1) === ";") tokens.pop();
  if (tokens.includes(";")) return refuse();
  // Wrap the *exact* text with a newline so a trailing comment cannot hide the cap.
  return terminator < 0
    ? query
    : `${query.slice(0, terminator)} ${query.slice(terminator + 1)}`;
}
export function boundedQuery(query: string, cap: number): string {
  const sql = guardQuery(query);
  if (!Number.isInteger(cap) || cap < 1 || cap > 10_000) return refuse();
  // Strip only the optional terminal semicolon (including trailing comments).
  // A semicolon inside a literal must retain its meaning: guard disallows inner
  // statements, and a wrapper without a trailing terminator works for all cases.
  const end = sql;
  return `SELECT * FROM (\n${end}\n) AS opsis_result LIMIT ${cap + 1}`;
}
