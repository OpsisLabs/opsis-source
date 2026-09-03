import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Secondary information stays keyboard-accessible without competing with a task. */
export function WorkspaceDisclosure({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`workspace-details ${className}`}>
      <summary>
        <span>{title}</span>
        <ChevronDown size={16} className="disclosure-chevron" />
      </summary>
      <div className="workspace-disclosure-content">{children}</div>
    </details>
  );
}
