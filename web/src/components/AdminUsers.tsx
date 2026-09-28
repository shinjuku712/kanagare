import { useEffect, useState } from 'react';
import type { AdminUserRow } from '@shared/types';
import { api } from '../api.ts';
import { toast, useStore } from '../store.ts';
import { Avatar, Check, Segmented, ConfirmDialog, IconTrash, Modal } from './ui.tsx';

export function AdminUsers({ onClose }: { onClose: () => void }) {
  const { user: me } = useStore();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);
  const [resetting, setResetting] = useState<AdminUserRow | null>(null);

  const load = () => {
    api.adminUsers().then(setUsers).catch((e) => toast(e.message));
  };
  useEffect(load, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const u = await api.adminCreateUser(email.trim(), password, isAdmin);
      toast(`User created: ${u.email}`);
      setEmail('');
      setPassword('');
      setIsAdmin(false);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (u: AdminUserRow, admin: boolean) => {
    try {
      await api.adminSetRole(u.id, admin);
      toast(admin ? `${u.email} is now an admin` : `${u.email} is now a member`);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed');
      load();
    }
  };

  return (
    <Modal onClose={onClose} className="admin-modal" labelledBy="admin-title">
      <h2 id="admin-title">Users</h2>

      <form className="admin-add" onSubmit={addUser}>
        <input
          className="field"
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="field"
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 chars)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Check checked={isAdmin} onChange={setIsAdmin} label="Admin" />
        <button className="btn primary" type="submit" disabled={busy}>
          Add
        </button>
      </form>

      <div>
        {users.map((u) => {
          const isMe = me?.id === u.id;
          return (
            <div key={u.id} className="user-row">
              <Avatar email={u.email} size={26} />
              <span className="ur-identity">
                <span className="ur-email">
                  {u.email}
                  {isMe && <span className="ur-you"> (you)</span>}
                </span>
                <span className="ur-sub">since {u.created_at.slice(0, 10)}</span>
              </span>
              <Segmented
                value={u.is_admin ? 'admin' : 'member'}
                ariaLabel={`Role for ${u.email}`}
                options={[
                  { value: 'member', label: 'Member' },
                  { value: 'admin', label: 'Admin' },
                ]}
                onChange={(v) => void setRole(u, v === 'admin')}
              />
              <button className="btn ghost sm" onClick={() => setResetting(u)}>
                Reset password
              </button>
              <button className="icon-btn danger" aria-label={`Delete ${u.email}`} disabled={isMe} onClick={() => setDeleting(u)}>
                <IconTrash size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete user"
          message={`Delete ${deleting.email}? Their cards stay on the boards, editable by admins. This cannot be undone.`}
          onConfirm={() => {
            api
              .adminDeleteUser(deleting.id)
              .then(() => {
                toast(`Deleted ${deleting.email}`);
                load();
              })
              .catch((e) => toast(e instanceof Error ? e.message : 'Failed to delete'));
          }}
          onClose={() => setDeleting(null)}
        />
      )}

      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
        />
      )}
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const submit = () => {
    if (password.length < 8) {
      toast('Password must be at least 8 characters');
      return;
    }
    api
      .adminSetPassword(user.id, password)
      .then(() => {
        toast(`Password reset for ${user.email} — they've been logged out everywhere`);
        onClose();
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Failed'));
  };
  return (
    <Modal onClose={onClose} labelledBy="reset-title">
      <h2 id="reset-title">Reset password</h2>
      <p style={{ color: 'var(--text2)', fontSize: '0.875rem', marginBottom: '0.875rem' }}>{user.email}</p>
      <input
        className="field"
        data-autofocus
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="New password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={submit}>
          Reset
        </button>
      </div>
    </Modal>
  );
}
