export type ContractFact<T> = {
  value: T | null;
  reason: "explorer_unavailable" | "not_reported" | "malformed" | null;
  source: {
    provider: "blockscout";
    url: string;
    fetchedAt: string;
    fieldsUsed: string[];
  } | null;
};

export type ContractFacts = {
  sourceVerified: ContractFact<boolean>;
  name: ContractFact<string>;
  compilerVersion: ContractFact<string>;
  optimizationEnabled: ContractFact<boolean>;
  proxy: ContractFact<boolean>;
  implementations: ContractFact<string[]>;
  verifiedAt: ContractFact<string>;
};
