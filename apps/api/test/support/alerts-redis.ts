/** In-memory command-boundary fake for key-layout/serialization tests. It does
 * not execute Lua; the integration suite verifies the real script and races. */
export class AlertRedisFake {
  values = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  sorted = new Map<string, Map<string, number>>();
  expiry = new Map<string, number>();
  operations: unknown[][] = [];
  constructor(public time: number) {}
  private expire() {
    for (const [key, at] of this.expiry) if (at <= this.time) this.del(key);
  }
  private del(key: string) {
    this.values.delete(key);
    this.sets.delete(key);
    this.sorted.delete(key);
    this.expiry.delete(key);
  }
  async get(key: string) {
    this.expire();
    return this.values.get(key) ?? null;
  }
  async mget(...keys: string[]) {
    return Promise.all(keys.map((key) => this.get(key)));
  }
  async eval(
    script: string,
    count: number,
    prefix: string,
    op: string,
    ...args: (string | number)[]
  ) {
    this.expire();
    this.operations.push([script, count, prefix, op, ...args]);
    const set = (key: string) => {
      if (!this.sets.has(key)) this.sets.set(key, new Set());
      return this.sets.get(key)!;
    };
    const sorted = (key: string) => {
      if (!this.sorted.has(key)) this.sorted.set(key, new Map());
      return this.sorted.get(key)!;
    };
    const chatClean = (h: string) => {
      const key = `${prefix}chat:${h}`,
        ids = this.sets.get(key);
      if (!ids) return;
      for (const id of ids)
        if (!this.values.has(`${prefix}rule:${id}`)) ids.delete(id);
      if (!ids.size) {
        this.del(key);
        return;
      }
      this.expiry.set(
        key,
        Math.max(
          ...[...ids].map(
            (id) =>
              JSON.parse(this.values.get(`${prefix}rule:${id}`)!).expiresAt,
          ),
        ),
      );
    };
    const trim = (name: string) => {
      const key = `${prefix}${name}`,
        ids = this.sorted.get(key);
      if (!ids) return;
      for (const [id, expiry] of ids)
        if (
          expiry <= this.time ||
          !this.values.has(
            `${prefix}${name === "active" ? "rule" : "journal"}:${id}`,
          )
        )
          ids.delete(id);
      if (!ids.size) this.del(key);
    };
    if (op === "create") {
      const row = JSON.parse(String(args[0]));
      trim("active");
      chatClean(row.deliveryHmac);
      const chatKey = `${prefix}chat:${row.deliveryHmac}`;
      if ((this.sets.get(chatKey)?.size ?? 0) >= 3) return "ALERTS_RULE_LIMIT";
      if ((this.sorted.get(`${prefix}active`)?.size ?? 0) >= 1000)
        return "ALERTS_CAPACITY_STOP";
      const key = `${prefix}rule:${row.id}`;
      this.values.set(key, String(args[0]));
      this.expiry.set(key, row.expiresAt);
      set(chatKey).add(row.id);
      chatClean(row.deliveryHmac);
      sorted(`${prefix}active`).set(row.id, row.expiresAt);
      this.expiry.set(
        `${prefix}active`,
        Math.max(...this.sorted.get(`${prefix}active`)!.values()),
      );
      return "OK";
    }
    if (op === "list") {
      chatClean(String(args[0]));
      return [...(this.sets.get(`${prefix}chat:${args[0]}`) ?? [])];
    }
    if (op === "active" || op === "events") {
      const z = op === "active" ? "active" : "journal-index";
      trim(z);
      return [...(this.sorted.get(`${prefix}${z}`)?.keys() ?? [])];
    }
    if (op === "enqueue") {
      const row = JSON.parse(String(args[0])),
        raw = this.values.get(`${prefix}rule:${row.ruleId}`);
      if (!raw) return 0;
      const key = `${prefix}journal:${row.id}`,
        expiry = JSON.parse(raw).expiresAt;
      if (this.values.has(key)) return 0;
      this.values.set(key, String(args[0]));
      this.expiry.set(key, expiry);
      set(`${prefix}journals:${row.ruleId}`).add(row.id);
      this.expiry.set(`${prefix}journals:${row.ruleId}`, expiry);
      sorted(`${prefix}journal-index`).set(row.id, expiry);
      this.expiry.set(
        `${prefix}journal-index`,
        Math.max(...this.sorted.get(`${prefix}journal-index`)!.values()),
      );
      return 1;
    }
    if (op === "remove") {
      const chatKey = `${prefix}chat:${args[0]}`;
      let count = 0;
      for (const id of this.sets.get(chatKey) ?? [])
        if (!args[1] || args[1] === id) {
          if (this.values.has(`${prefix}rule:${id}`)) count++;
          this.del(`${prefix}rule:${id}`);
          for (const event of this.sets.get(`${prefix}journals:${id}`) ?? []) {
            this.del(`${prefix}journal:${event}`);
            this.sorted.get(`${prefix}journal-index`)?.delete(event);
          }
          this.del(`${prefix}journals:${id}`);
          this.sorted.get(`${prefix}active`)?.delete(id);
          this.sets.get(chatKey)?.delete(id);
        }
      chatClean(String(args[0]));
      trim("active");
      trim("journal-index");
      return count;
    }
    throw new Error(`Fake operation not implemented: ${op}`);
  }
}
