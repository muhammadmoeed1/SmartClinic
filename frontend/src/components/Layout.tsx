import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';
import NotificationBell from './NotificationBell';
import {
  IconCalendar,
  IconChart,
  IconDashboard,
  IconFile,
  IconLogout,
  IconMenu,
  IconPlus,
  IconRoom,
  IconShield,
  IconStethoscope,
  LogoMark,
} from './Icons';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  patient: [
    { to: '/patient', label: 'Dashboard', icon: <IconDashboard />, end: true },
    { to: '/patient/book', label: 'Book appointment', icon: <IconPlus /> },
    { to: '/patient/records', label: 'My records', icon: <IconFile /> },
  ],
  doctor: [
    { to: '/doctor', label: 'Today', icon: <IconDashboard />, end: true },
    { to: '/doctor/records', label: 'Patient records', icon: <IconFile /> },
  ],
  receptionist: [
    { to: '/reception', label: 'Booking board', icon: <IconCalendar />, end: true },
    { to: '/reception/walkin', label: 'Book for patient', icon: <IconPlus /> },
    { to: '/reception/preauth', label: 'Pre-auth tracker', icon: <IconShield /> },
  ],
  admin: [
    { to: '/admin', label: 'Analytics', icon: <IconChart />, end: true },
    { to: '/admin/doctors', label: 'Doctors', icon: <IconStethoscope /> },
    { to: '/admin/rooms', label: 'Rooms', icon: <IconRoom /> },
  ],
};

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

const ROLE_LABEL: Record<Role, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  admin: 'Administrator',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile drawer on every navigation.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  if (!user) return null;
  const items = NAV[user.role];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {navOpen && (
        <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}
      <aside className={`sidebar ${navOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <span className="sidebar__logo">
            <LogoMark size={34} />
          </span>
          <span className="sidebar__name">SmartClinic</span>
          <span className="sidebar__role">
            <span>{ROLE_LABEL[user.role]}</span>
          </span>
        </div>
        <nav className="sidebar__nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            >
              {item.icon}
              <span className="sidebar__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <button className="sidebar__link sidebar__logout" onClick={handleLogout}>
            <IconLogout />
            <span className="sidebar__label">Log out</span>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="icon-btn sidebar-toggle"
              onClick={() => setNavOpen((o) => !o)}
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
            >
              <IconMenu size={20} />
            </button>
            <div className="topbar__role">{ROLE_LABEL[user.role]} portal</div>
          </div>
          <div className="topbar__right">
            <NotificationBell />
            <div className="topbar__user">
              <span className="topbar__avatar">{initials(user.fullName)}</span>
              <span className="topbar__username">{user.fullName}</span>
            </div>
            <button className="icon-btn" onClick={handleLogout} title="Log out" aria-label="Log out">
              <IconLogout size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
