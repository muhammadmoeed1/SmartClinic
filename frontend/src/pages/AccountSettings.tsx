import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import * as authApi from '../api/auth';
import { getErrorMessage } from '../utils';
import Button from '../components/Button';
import { toast } from '../store/toasts';

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await authApi.updateProfile(phone.trim());
      updateUser(updated);
      toast('Profile updated.', 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast('Password changed.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <div>
          <h2>Account settings</h2>
          <p className="page-subtitle">Update your contact details or change your password.</p>
        </div>
      </div>

      <div className="stack">
        <form className="card stack" onSubmit={(e) => void saveProfile(e)}>
          <h3 className="card__title">Profile</h3>
          <div className="form-row">
            <label className="form-group">
              <span>Full name</span>
              <input className="input" value={user.fullName} disabled />
            </label>
            <label className="form-group">
              <span>Email</span>
              <input className="input" value={user.email} disabled />
            </label>
          </div>
          <label className="form-group">
            <span>Phone</span>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+92-300-0000000"
            />
          </label>
          <div className="actions-row">
            <Button type="submit" loading={savingProfile}>
              Save profile
            </Button>
          </div>
        </form>

        <form className="card stack" onSubmit={(e) => void savePassword(e)}>
          <h3 className="card__title">Change password</h3>
          <label className="form-group">
            <span>Current password</span>
            <input
              className="input"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label className="form-group">
              <span>New password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label className="form-group">
              <span>Confirm new password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
          </div>
          {passwordError && <p className="inline-error">{passwordError}</p>}
          <div className="actions-row">
            <Button type="submit" loading={savingPassword}>
              Change password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
