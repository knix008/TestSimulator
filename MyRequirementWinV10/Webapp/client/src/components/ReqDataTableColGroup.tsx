/** Shared column widths for requirements list and test case list alignment. */
export default function ReqDataTableColGroup() {
  return (
    <colgroup>
      <col className="req-col-code" />
      <col className="req-col-title" />
      <col className="req-col-priority" />
      <col className="req-col-req-status" />
      <col className="req-col-test" />
      <col className="req-col-actions" />
    </colgroup>
  );
}
