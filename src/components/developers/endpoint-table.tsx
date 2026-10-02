import { cn } from "@/lib/utils";

/** METHOD · PATH · PURPOSE in mono, hairline rows. */
export function EndpointTable({ endpoints, className }: { endpoints: ReadonlyArray<readonly [string, string, string]>; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-y border-hairline text-[13px]">
        <thead>
          <tr className="text-left">
            <th className="microlabel border-b border-border py-2 pr-4 font-normal">Method</th>
            <th className="microlabel border-b border-border py-2 pr-4 font-normal">Path</th>
            <th className="microlabel border-b border-border py-2 font-normal">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map(([method, path, desc]) => (
            <tr key={path}>
              <td className="border-b border-hairline py-2.5 pr-4 align-top font-mono text-[11.5px] tracking-[0.08em]">
                <span className={cn("inline-flex items-center gap-1.5", method === "POST" ? "text-ink" : "text-muted")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", method === "POST" ? "bg-ink" : "bg-border-strong")} aria-hidden />
                  {method}
                </span>
              </td>
              <td className="border-b border-hairline py-2.5 pr-4 align-top font-mono text-[12.5px] text-ink">{path}</td>
              <td className="border-b border-hairline py-2.5 align-top text-[13px] text-muted">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
