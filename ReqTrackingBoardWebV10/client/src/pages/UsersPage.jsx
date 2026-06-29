import { useState, useCallback } from 'react';

import { Navigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import api from '../api';

import Layout from '../components/Layout';

import Modal from '../components/Modal';

import { useAuth } from '../context/AuthContext';

import { useAutoRefresh } from '../hooks/useAutoRefresh';



const emptyForm = {

  username: '', password: '', displayName: '', email: '', role: 'user', permission: 'view', isActive: true,

};



export default function UsersPage() {

  const { t } = useTranslation();

  const { isAdmin } = useAuth();

  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);

  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const [saving, setSaving] = useState(false);



  const load = useCallback(() => {

    api.get('/users').then(res => setUsers(res.data)).finally(() => setLoading(false));

  }, []);



  useAutoRefresh(load, isAdmin);



  const openAdd = () => {

    if (!isAdmin) return;

    setEditing(null);

    setForm(emptyForm);

    setModalOpen(true);

  };



  const openEdit = (user) => {

    setEditing(user);

    setForm({

      username: user.username, password: '', displayName: user.displayName, email: user.email || '',

      role: user.role, permission: user.permission || 'view', isActive: user.isActive,

    });

    setModalOpen(true);

  };



  const handleSave = async () => {

    if (!editing && !isAdmin) {

      alert(t('users.adminOnlyAdd'));

      return;

    }

    setSaving(true);

    try {

      if (editing) {

        const payload = {

          displayName: form.displayName, email: form.email.trim(), role: form.role,

          isActive: form.isActive,

        };

        if (form.role !== 'admin') payload.permission = form.permission;

        if (form.password) payload.password = form.password;

        const res = await api.put(`/users/${editing.id}`, payload);

        if (form.password && res.data.passwordNotificationSent) {

          alert(t('users.passwordNotificationSent', { email: form.email.trim() }));

        }

      } else {

        await api.post('/users', form.role === 'admin'

          ? { ...form, permission: 'view' }

          : form);

      }

      setModalOpen(false);

      load();

    } catch (err) {

      alert(err.response?.data?.error || t('common.error'));

    } finally {

      setSaving(false);

    }

  };



  const handleDelete = async (user) => {

    if (!confirm(t('users.confirmDelete'))) return;

    try {

      await api.delete(`/users/${user.id}`);

      load();

    } catch (err) {

      alert(err.response?.data?.error || t('common.error'));

    }

  };



  const set = (field) => (e) => {

    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

    if (field === 'role') {

      setForm(f => ({

        ...f,

        role: val,

        permission: val === 'admin' ? 'view' : (f.permission || 'view'),

      }));

      return;

    }

    setForm(f => ({ ...f, [field]: val }));

  };



  const formatPermission = (user) => {

    if (user.role === 'admin') return t('users.notApplicable');

    return user.permission === 'edit' ? t('users.editPerm') : t('users.view');

  };



  if (!isAdmin) return <Navigate to="/" replace />;



  return (

    <Layout>

      <div className="page-header">

        <h2>{t('users.title')}</h2>

        {isAdmin && (

          <button className="btn btn-primary" onClick={openAdd}>+ {t('users.add')}</button>

        )}

      </div>



      {loading ? (

        <div className="empty-state">{t('common.loading')}</div>

      ) : users.length === 0 ? (

        <div className="empty-state">{t('users.noData')}</div>

      ) : (

        <div className="table-container">

          <table>

            <thead>

              <tr>

                <th>{t('users.username')}</th>

                <th>{t('users.displayName')}</th>

                <th>{t('users.email')}</th>

                <th>{t('users.role')}</th>

                <th>{t('users.contentPermission')}</th>

                <th>{t('users.isActive')}</th>

                <th>{t('common.actions')}</th>

              </tr>

            </thead>

            <tbody>

              {users.map(user => (

                <tr key={user.id}>

                  <td><strong>{user.username}</strong></td>

                  <td>{user.displayName}</td>

                  <td>{user.email || '-'}</td>

                  <td>{user.role === 'admin' ? t('users.admin') : t('users.user')}</td>

                  <td>{formatPermission(user)}</td>

                  <td>{user.isActive ? '✅' : '❌'}</td>

                  <td className="actions-cell">

                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(user)}>{t('common.edit')}</button>

                    {user.username !== 'admin' && (

                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user)}>{t('common.delete')}</button>

                    )}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      )}



      <Modal

        open={modalOpen}

        onClose={() => setModalOpen(false)}

        title={editing ? t('users.edit') : t('users.add')}

        footer={

          <>

            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>

              {saving ? t('common.loading') : t('common.save')}

            </button>

          </>

        }

      >

        {!editing && (

          <div className="form-group">

            <label>{t('users.username')} *</label>

            <input className="form-control" value={form.username} onChange={set('username')} required />

          </div>

        )}

        <div className="form-group">

          <label>{t('users.displayName')} *</label>

          <input className="form-control" value={form.displayName} onChange={set('displayName')} required />

        </div>

        <div className="form-group">

          <label>{t('users.email')} *</label>

          <input className="form-control" type="email" value={form.email} onChange={set('email')} required />

        </div>



        <div className="form-group">

          <label>{t('users.password')}{editing ? ` (${t('users.passwordOptional')})` : ' *'}</label>

          <input

            className="form-control"

            type="password"

            value={form.password}

            onChange={set('password')}

          />

          {editing && (

            <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>

              {t('users.adminPasswordHint')}

            </small>

          )}

        </div>



        <div className="form-row">

          <div className="form-group">

            <label>{t('users.role')}</label>

            <select className="form-control" value={form.role} onChange={set('role')}>

              <option value="user">{t('users.user')}</option>

              <option value="admin">{t('users.admin')}</option>

            </select>

            {form.role === 'admin' && (

              <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>

                {t('users.adminRoleHint')}

              </small>

            )}

          </div>

          {form.role !== 'admin' && (

            <div className="form-group">

              <label>{t('users.contentPermission')}</label>

              <select className="form-control" value={form.permission} onChange={set('permission')}>

                <option value="view">{t('users.view')}</option>

                <option value="edit">{t('users.editPerm')}</option>

              </select>

              <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>

                {t('users.contentPermissionHint')}

              </small>

            </div>

          )}

        </div>

        {editing && (

          <div className="form-group">

            <label>

              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} style={{ marginRight: 8 }} />

              {t('users.isActive')}

            </label>

          </div>

        )}

      </Modal>

    </Layout>

  );

}


