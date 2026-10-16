import { useState } from "react";
import { useNavigate } from "react-router";
import { useCopy } from "../copy";
import { workspaceLink } from "../model";
import { searchIdentity } from "./search-model";
import { ToolIcon } from "./icons";

export default function PublicSearch({
  overview = false,
  menu = false,
  onNavigate,
}: {
  overview?: boolean;
  menu?: boolean;
  onNavigate?: () => void;
}) {
  const c = useCopy();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const id = overview ? "guide-entity" : menu ? "menu-entity" : "nav-entity";
  return (
    <form
      className={`opsis-search ${overview ? "opsis-overview-search" : "opsis-top-search"}`}
      onSubmit={(event) => {
        event.preventDefault();
        const identity = searchIdentity(value);
        if (identity) {
          navigate(workspaceLink("/research", identity));
          onNavigate?.();
        }
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {c("Public address or transaction hash", "公开地址或交易哈希")}
      </label>
      <ToolIcon name="research" />
      <input
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={c(
          "Paste a token, wallet or transaction",
          "粘贴代币、钱包地址或交易哈希",
        )}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={!searchIdentity(value)}
        aria-label={c("Research →", "研究 →")}
      >
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
