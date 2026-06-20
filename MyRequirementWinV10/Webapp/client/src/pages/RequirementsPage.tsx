import { useEffect, useState } from "react";
import { api } from "../api";
import TestCasePanel from "../components/TestCasePanel";
import { Priority, Requirement, RequirementStatus } from "../types";

const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
const STATUSES: RequirementStatus[] = ["Draft", "Approved", "InProgress", "Implemented", "Deprecated"];

const emptyForm = {
  code: "",
  title: "",
  description: "",
  category: "",
  priority: "Medium" as Priority,
  status: "Draft" as RequirementStatus,
  source: ""
};

export default function RequirementsPage({ connected }: { connected: boolean }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api.listRequirements();
      setRequirements(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (connected) refresh();
  }, [connected]);

  function startEdit(req: Requirement) {
    setEditingId(req.id);
    setForm({
      code: req.code,
      title: req.title,
      description: req.description,
      category: req.category,
      priority: req.priority,
      status: req.status,
      source: req.source
    });
  }

  function startAdd() {
    setEditingId("__new__");
    setForm(emptyForm);
  }

  async function saveForm() {
    setError(null);
    try {
      if (editingId === "__new__") {
        await api.createRequirement(form);
      } else if (editingId) {
        await api.updateRequirement(editingId, form);
      }
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 요구사항과 모든 테스트 케이스를 삭제하시겠습니까?")) return;
    await api.deleteRequirement(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
  }

  if (!connected) {
    return (
      <div className="card">
        <p>먼저 "DB 연결" 메뉴에서 데이터베이스에 연결하세요.</p>
      </div>
    );
  }

  const selected = requirements.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="req-layout">
      <div className="card req-list-card">
        <div className="card-header">
          <h2>요구사항</h2>
          <button onClick={startAdd}>+ 추가</button>
        </div>
        {error && <p className="msg-error">{error}</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>코드</th>
              <th>제목</th>
              <th>우선순위</th>
              <th>상태</th>
              <th>테스트</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req) => (
              <tr
                key={req.id}
                className={req.id === selectedId ? "selected" : ""}
                onClick={() => setSelectedId(req.id)}
              >
                <td>{req.code}</td>
                <td>{req.title}</td>
                <td>{req.priority}</td>
                <td>{req.status}</td>
                <td>{req.testCaseCount}</td>
                <td className="row-actions">
                  <button onClick={(e) => { e.stopPropagation(); startEdit(req); }}>편집</button>
                  <button onClick={(e) => { e.stopPropagation(); remove(req.id); }}>삭제</button>
                </td>
              </tr>
            ))}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  요구사항이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId && (
        <div className="card req-form-card">
          <h3>{editingId === "__new__" ? "요구사항 추가" : "요구사항 편집"}</h3>
          <div className="form-grid">
            <label>
              코드
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label>
              제목
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              카테고리
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label>
              우선순위
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              상태
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RequirementStatus })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              출처
              <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </label>
            <label className="full-width">
              설명
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button onClick={saveForm}>저장</button>
            <button onClick={() => setEditingId(null)}>취소</button>
          </div>
        </div>
      )}

      {selected && !editingId && <TestCasePanel requirement={selected} />}
    </div>
  );
}
