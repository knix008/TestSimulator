import { useEffect, useState } from 'react';
import { createUser, deleteUser, listUsers, updateUser } from '../api/client';
import type { AppUser, CreateUserInput, UpdateUserInput } from '../types/project';
import { formatPermissionSummary, normalizePermissionInput } from '../utils/permissions';
import './UserManagementPanel.css';

interface UserManagementPanelProps {
  open: boolean;
  currentUserId: number | null;
  onClose: () => void;
}

type FormMode = 'create' | 'edit';

const emptyCreateForm: CreateUserInput = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  role: 'user',
  canRead: true,
  canModify: false,
  isActive: true,
};

export function UserManagementPanel({ open, currentUserId, onClose }: UserManagementPanelProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [createForm, setCreateForm] = useState<CreateUserInput>(emptyCreateForm);
  const [editForm, setEditForm] = useState<UpdateUserInput>({});

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setFormMode(null);
    setEditingUser(null);
    setMessage(null);
    void loadUsers();
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await createUser(createForm);
      setCreateForm(emptyCreateForm);
      setFormMode(null);
      setMessage('사용자가 추가되었습니다.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await updateUser(editingUser.id, editForm);
      setEditingUser(null);
      setEditForm({});
      setFormMode(null);
      setMessage('사용자 정보가 저장되었습니다.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (user: AppUser) => {
    if (!window.confirm(`'${user.username}' 사용자를 삭제하시겠습니까?`)) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await deleteUser(user.id);
      setMessage('사용자가 삭제되었습니다.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (user: AppUser) => {
    setFormMode('edit');
    setEditingUser(user);
    setEditForm({
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      canRead: user.canRead,
      canModify: user.canModify,
      isActive: user.isActive,
      password: '',
    });
  };

  const renderPermissionFields = (
    role: 'admin' | 'user',
    canRead: boolean,
    canModify: boolean,
    onChange: (next: { canRead: boolean; canModify: boolean }) => void,
  ) => {
    const isAdminRole = role === 'admin';
    return (
      <div className="user-mgmt-permissions">
        <span className="user-mgmt-permissions-label">권한</span>
        <label className="user-mgmt-checkbox">
          <input
            type="checkbox"
            checked={isAdminRole || canRead}
            disabled={isAdminRole || canModify}
            onChange={(e) => onChange(normalizePermissionInput(role, e.target.checked, canModify))}
          />
          읽기
        </label>
        <label className="user-mgmt-checkbox">
          <input
            type="checkbox"
            checked={isAdminRole || canModify}
            disabled={isAdminRole}
            onChange={(e) => onChange(normalizePermissionInput(role, canRead, e.target.checked))}
          />
          수정
        </label>
        {isAdminRole && <span className="user-mgmt-permissions-note">관리자는 모든 권한을 가집니다.</span>}
      </div>
    );
  };

  return (
    <div className="user-mgmt-backdrop">
      <div className="user-mgmt-panel">
        <header>
          <h2>사용자 관리</h2>
          <p className="user-mgmt-storage-note">사용자 정보는 DB 테이블(mp_users)에 저장됩니다.</p>
          <button type="button" className="panel-close-button" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="user-mgmt-toolbar">
          <button
            type="button"
            onClick={() => {
              setFormMode('create');
              setEditingUser(null);
              setCreateForm(emptyCreateForm);
            }}
            disabled={loading}
          >
            사용자 추가
          </button>
        </div>

        {formMode === 'create' && (
          <section className="user-mgmt-form">
            <h3>새 사용자</h3>
            <div className="user-mgmt-form-grid">
              <label>
                사용자 ID
                <input
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                />
              </label>
              <label>
                표시 이름
                <input
                  value={createForm.displayName ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                />
              </label>
              <label>
                이메일
                <input
                  type="email"
                  value={createForm.email ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
              </label>
              <label>
                역할
                <select
                  value={createForm.role}
                  onChange={(e) => {
                    const role = e.target.value as 'admin' | 'user';
                    const permissions = normalizePermissionInput(
                      role,
                      createForm.canRead ?? true,
                      createForm.canModify ?? false,
                    );
                    setCreateForm({
                      ...createForm,
                      role,
                      canRead: permissions.canRead,
                      canModify: permissions.canModify,
                    });
                  }}
                >
                  <option value="user">일반 사용자</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
              {renderPermissionFields(
                createForm.role,
                createForm.canRead ?? true,
                createForm.canModify ?? false,
                (next) => setCreateForm({ ...createForm, ...next }),
              )}
              <label className="user-mgmt-checkbox">
                <input
                  type="checkbox"
                  checked={createForm.isActive ?? true}
                  onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.checked })}
                />
                활성
              </label>
            </div>
            <div className="user-mgmt-form-actions">
              <button type="button" onClick={() => setFormMode(null)} disabled={loading}>
                취소
              </button>
              <button type="button" className="primary" onClick={handleCreate} disabled={loading}>
                추가
              </button>
            </div>
          </section>
        )}

        {formMode === 'edit' && editingUser && (
          <section className="user-mgmt-form">
            <h3>사용자 편집: {editingUser.username}</h3>
            <div className="user-mgmt-form-grid">
              <label>
                사용자 ID
                <input
                  value={editForm.username ?? editingUser.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                />
              </label>
              <label>
                표시 이름
                <input
                  value={editForm.displayName ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                />
              </label>
              <label>
                이메일
                <input
                  type="email"
                  value={editForm.email ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </label>
              <label>
                새 비밀번호
                <input
                  type="password"
                  value={editForm.password ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="변경하지 않으면 비워 두세요"
                />
              </label>
              <label>
                역할
                <select
                  value={editForm.role ?? editingUser.role}
                  onChange={(e) => {
                    const role = e.target.value as 'admin' | 'user';
                    const permissions = normalizePermissionInput(
                      role,
                      editForm.canRead ?? editingUser.canRead,
                      editForm.canModify ?? editingUser.canModify,
                    );
                    setEditForm({
                      ...editForm,
                      role,
                      canRead: permissions.canRead,
                      canModify: permissions.canModify,
                    });
                  }}
                >
                  <option value="user">일반 사용자</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
              {renderPermissionFields(
                editForm.role ?? editingUser.role,
                editForm.canRead ?? editingUser.canRead,
                editForm.canModify ?? editingUser.canModify,
                (next) => setEditForm({ ...editForm, ...next }),
              )}
              <label className="user-mgmt-checkbox">
                <input
                  type="checkbox"
                  checked={editForm.isActive ?? editingUser.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                />
                활성
              </label>
            </div>
            <div className="user-mgmt-form-actions">
              <button type="button" onClick={() => setFormMode(null)} disabled={loading}>
                취소
              </button>
              <button type="button" className="primary" onClick={handleUpdate} disabled={loading}>
                저장
              </button>
            </div>
          </section>
        )}

        <div className="user-mgmt-table-wrap">
          <table>
            <thead>
              <tr>
                <th>사용자 ID</th>
                <th>표시 이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>권한</th>
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.displayName}</td>
                  <td>{user.email || '-'}</td>
                  <td>{user.role === 'admin' ? '관리자' : '일반'}</td>
                  <td>{formatPermissionSummary(user.canRead, user.canModify)}</td>
                  <td>{user.isActive ? '활성' : '비활성'}</td>
                  <td className="user-mgmt-actions">
                    <button type="button" onClick={() => startEdit(user)} disabled={loading}>
                      편집
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(user)}
                      disabled={loading || user.id === currentUserId}
                      title={user.id === currentUserId ? '본인 계정은 삭제할 수 없습니다' : undefined}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {message && <div className="user-mgmt-message">{message}</div>}
        {error && <div className="user-mgmt-error">{error}</div>}
      </div>
    </div>
  );
}
