import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import ReqDataTableColGroup from "./ReqDataTableColGroup";
import { Requirement, TestCase, TestRunStatus, TestStep } from "../types";

const RUN_STATUSES: TestRunStatus[] = ["NotRun", "Pass", "Fail", "Blocked"];

interface FormState {
  code: string;
  title: string;
  preconditions: string;
  expectedResult: string;
  steps: TestStep[];
}

const emptyForm: FormState = { code: "", title: "", preconditions: "", expectedResult: "", steps: [] };

export default function TestCasePanel({ requirement, editable }: { requirement: Requirement; editable: boolean }) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [runFormFor, setRunFormFor] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<TestRunStatus>("Pass");
  const [runNotes, setRunNotes] = useState("");
  const [runBy, setRunBy] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api.listTestCases(requirement.id);
      setTestCases(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    setEditingId(null);
  }, [requirement.id]);

  function startAdd() {
    setEditingId("__new__");
    setForm(emptyForm);
  }

  function startEdit(tc: TestCase) {
    setEditingId(tc.id);
    setForm({ code: tc.code, title: tc.title, preconditions: tc.preconditions, expectedResult: tc.expectedResult, steps: tc.steps });
  }

  function addStep() {
    setForm((f) => ({ ...f, steps: [...f.steps, { testCaseId: "", order: f.steps.length, action: "", expectedOutcome: "" }] }));
  }

  function updateStep(idx: number, key: "action" | "expectedOutcome", value: string) {
    setForm((f) => ({ ...f, steps: f.steps.map((s, i) => (i === idx ? { ...s, [key]: value } : s)) }));
  }

  function removeStep(idx: number) {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })) }));
  }

  async function save() {
    setError(null);
    try {
      if (editingId === "__new__") {
        await api.createTestCase({ ...form, requirementId: requirement.id });
      } else if (editingId) {
        await api.updateTestCase(editingId, form);
      }
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 테스트 케이스를 삭제하시겠습니까?")) return;
    await api.deleteTestCase(id);
    await refresh();
  }

  async function submitRun(testCaseId: string) {
    await api.addTestRun(testCaseId, { status: runStatus, notes: runNotes, executedBy: runBy });
    setRunFormFor(null);
    setRunNotes("");
    setRunBy("");
    await refresh();
  }

  return (
    <div className="card test-case-card">
      <div className="card-header">
        <h2>테스트 케이스 — {requirement.code || requirement.title}</h2>
        {editable && <button onClick={startAdd}>+ 테스트 케이스 추가</button>}
      </div>
      {error && <p className="msg-error">{error}</p>}

      {testCases.length > 0 && (
        <table className="data-table req-data-table test-case-list-table">
          <ReqDataTableColGroup />
          <tbody>
            {testCases.map((tc) => {
              const runState = tc.runs[0]?.status ?? "NotRun";
              return (
                <Fragment key={tc.id}>
                  <tr className="test-case-row">
                    <td>{tc.code || "(코드 없음)"}</td>
                    <td className="req-col-title-cell">{tc.title}</td>
                    <td className="req-col-spacer" />
                    <td className="req-col-spacer" />
                    <td className="req-col-run">
                      <span className={`status-pill status-${runState.toLowerCase()}`}>{runState}</span>
                    </td>
                    <td className="row-actions">
                      {editable && (
                        <>
                          <button type="button" onClick={() => startEdit(tc)}>편집</button>
                          <button type="button" onClick={() => setRunFormFor(tc.id)}>실행 기록</button>
                          <button type="button" onClick={() => remove(tc.id)}>삭제</button>
                        </>
                      )}
                    </td>
                  </tr>

                  {runFormFor === tc.id && (
                    <tr className="test-case-detail-row">
                      <td colSpan={6}>
                        <div className="run-form">
                          <select value={runStatus} onChange={(e) => setRunStatus(e.target.value as TestRunStatus)}>
                            {RUN_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <input placeholder="실행자" value={runBy} onChange={(e) => setRunBy(e.target.value)} />
                          <input placeholder="메모" value={runNotes} onChange={(e) => setRunNotes(e.target.value)} />
                          <button type="button" onClick={() => submitRun(tc.id)}>저장</button>
                          <button type="button" onClick={() => setRunFormFor(null)}>취소</button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {tc.steps.length > 0 && (
                    <tr className="test-case-detail-row">
                      <td colSpan={6}>
                        <table className="data-table steps-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>동작</th>
                              <th>예상 결과</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tc.steps.map((s) => (
                              <tr key={s.order}>
                                <td>{s.order + 1}</td>
                                <td>{s.action}</td>
                                <td>{s.expectedOutcome}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {testCases.length === 0 && !editingId && <p className="empty-row">테스트 케이스가 없습니다.</p>}

      {editable && editingId && (
        <div className="test-case-form">
          <h3>{editingId === "__new__" ? "테스트 케이스 추가" : "테스트 케이스 편집"}</h3>
          <div className="form-grid">
            <label>
              코드
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label>
              제목
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="full-width">
              전제 조건
              <textarea value={form.preconditions} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} />
            </label>
            <label className="full-width">
              예상 결과
              <textarea value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} />
            </label>
          </div>

          <h4>단계</h4>
          <div className="steps-edit-table">
            <div className="step-edit-header">
              <span>#</span>
              <span>동작</span>
              <span>예상 결과</span>
              <span />
            </div>
            {form.steps.map((step, idx) => (
              <div key={idx} className="step-row">
                <span className="step-num">{idx + 1}</span>
                <input placeholder="동작" value={step.action} onChange={(e) => updateStep(idx, "action", e.target.value)} />
                <input placeholder="예상 결과" value={step.expectedOutcome} onChange={(e) => updateStep(idx, "expectedOutcome", e.target.value)} />
                <button type="button" onClick={() => removeStep(idx)}>삭제</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addStep}>+ 단계 추가</button>

          <div className="form-actions">
            <button onClick={save}>저장</button>
            <button onClick={() => setEditingId(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
