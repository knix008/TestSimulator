/** Number of columns in the shared requirements / test-case list table. */
export const REQ_TABLE_COLUMN_COUNT = 10;

/** Shared column widths for requirements list and test case list alignment. */
export default function ReqDataTableColGroup() {
  return (
    <colgroup>
      <col className="req-col-code" />
      <col className="req-col-title" />
      <col className="req-col-description" />
      <col className="req-col-category" />
      <col className="req-col-priority" />
      <col className="req-col-req-status" />
      <col className="req-col-test" />
      <col className="req-col-source" />
      <col className="req-col-parent" />
      <col className="req-col-actions" />
    </colgroup>
  );
}
