import { memo, type MouseEvent as ReactMouseEvent } from "react";

export const DiffView = memo(function DiffView({ text, wrap, onContextMenu }: { text: string; wrap: boolean; onContextMenu?: (event: ReactMouseEvent) => void }) {
  return (
    <pre className={wrap ? "diff wrap" : "diff"} onContextMenu={onContextMenu}>
      {text.split("\n").map((line, index) => {
        let kind = "";
        if (line.startsWith("@@")) kind = "hunk";
        else if (line.startsWith("+") && !line.startsWith("+++")) kind = "add";
        else if (line.startsWith("-") && !line.startsWith("---")) kind = "del";
        return <div className={kind} key={index}>{line || " "}</div>;
      })}
    </pre>
  );
}, (prev, next) => prev.text === next.text && prev.wrap === next.wrap);
