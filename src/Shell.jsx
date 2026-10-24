import { Icon } from "./Icons";
import { initials } from "./lib";
import { Brand, ThemeToggle, Toast } from "./ui";
import { useStore } from "./store";

export const NAV = {
  candidate: [
    { id: "overview", label: "Overview", icon: "home" },
    { id: "cv", label: "CV & Skill Gap", icon: "file" },
    { id: "jobs", label: "Job Matches", icon: "briefcase" },
    { id: "interview", label: "Mock Interview", icon: "mic" },
    { id: "progress", label: "Progress", icon: "chart" },
    { id: "profile", label: "Profile & Privacy", icon: "shield" },
  ],
  employer: [
    { id: "overview", label: "Overview", icon: "home" },
    { id: "jobs", label: "Job Postings", icon: "briefcase" },
    { id: "candidates", label: "Candidates", icon: "users" },
  ],
  admin: [
    { id: "overview", label: "Overview", icon: "home" },
    { id: "domains", label: "Domains & Roles", icon: "layers" },
    { id: "skills", label: "Skills", icon: "tag" },
    { id: "questions", label: "Question Templates", icon: "book" },
    { id: "criteria", label: "Criteria & Rules", icon: "sliders" },
    { id: "users", label: "Users", icon: "users" },
  ],
};

const SUBTITLE = { candidate: "Candidate workspace", employer: "Employer portal", admin: "Admin console" };

export function Shell({ page, go, menuOpen, setMenuOpen, badges = {}, promo, children }) {
  const { user, logout, toast } = useStore();
  const items = NAV[user.role];
  const current = items.find((n) => n.id === page);

  return (
    <div className="shell">
      <div className={`scrim ${menuOpen ? "scrim--show" : ""}`} onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <Brand subtitle={SUBTITLE[user.role]} />
          <button className="icon-btn sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><Icon name="x" /></button>
        </div>
        <p className="sidebar__label">Menu</p>
        <nav className="nav" aria-label="Main">
          {items.map((item) => (
            <button key={item.id} className={`nav__item ${page === item.id ? "is-active" : ""}`} onClick={() => go(item.id)} aria-current={page === item.id ? "page" : undefined}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {badges[item.id] > 0 && <span className="nav__count">{badges[item.id]}</span>}
            </button>
          ))}
        </nav>
        {promo}
        <div className="sidebar__user">
          <span className="avatar">{initials(user.name)}</span>
          <div className="sidebar__user-text">
            <strong>{user.name}</strong>
            <span>{user.company || user.email}</span>
          </div>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" size={17} /></button>
        </div>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-btn topbar__menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
            <nav className="crumbs" aria-label="Breadcrumb">
              <span>{SUBTITLE[user.role]}</span>
              <Icon name="chevronRight" size={14} />
              <strong>{current?.label}</strong>
            </nav>
          </div>
          <div className="topbar__right">
            <span className={`role-pill role-pill--${user.role}`}><Icon name={user.role === "employer" ? "building" : user.role === "admin" ? "settings" : "user"} size={13} /> {user.role}</span>
            {user.face?.template ? (
              <span className="status-pill" title="Face verification enabled"><Icon name="shield" size={14} /> Face login on</span>
            ) : (
              <span className="status-pill status-pill--warn" title="Face verification not set up"><Icon name="alert" size={14} /> Face login off</span>
            )}
            <ThemeToggle />
          </div>
        </header>
        {children}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
