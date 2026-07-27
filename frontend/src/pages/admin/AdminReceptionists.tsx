import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { UserDto } from '../../types';
import { createReceptionist, getUsers } from '../../api/admin';
import { getErrorMessage } from '../../utils';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { toast } from '../../store/toasts';

export default function AdminReceptionists() {
  const [receptionists, setReceptionists] = useState<UserDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReceptionists(await getUsers('receptionist'));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Receptionists</h2>
          <p className="page-subtitle">
            Front-desk staff accounts. Employees don't self-register — accounts are created here.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Add receptionist</Button>
      </div>

      {loading && <Spinner block label="Loading receptionists…" />}
      {error && <p className="inline-error">{error}</p>}
      {receptionists && receptionists.length === 0 && (
        <EmptyState
          title="No receptionists yet"
          message="Add your first front-desk account to start managing bookings."
          action={<Button onClick={() => setCreating(true)}>Add receptionist</Button>}
        />
      )}

      {receptionists && receptionists.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {receptionists.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.fullName}</strong>
                  </td>
                  <td className="muted">{r.email}</td>
                  <td className="muted">{r.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateReceptionistModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CreateReceptionistModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createReceptionist({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      toast('Receptionist account created.', 'success');
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add receptionist" onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label className="form-group">
          <span>Full name</span>
          <input
            className="input"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label className="form-group">
            <span>Email</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="form-group">
            <span>Phone</span>
            <input
              className="input"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>
        <label className="form-group">
          <span>Temporary password</span>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="inline-error">{error}</p>}
        <div className="actions-row">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create receptionist
          </Button>
        </div>
      </form>
    </Modal>
  );
}
