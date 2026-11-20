import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { useStore } from "./store";
import { timeAgo } from "./lib";
import * as api from "./api";

const POLL_MS = 30000;
const ICONS = { shortlisted: "star", not_progressing: "x", accepted: "checkCircle", declined: "alert" };

/** "/applications" → My Applications; "/candidates?job=ID" → that job's candidates. */
function target(link) {
  const [path, query = ""] = (link || "").split("?");
  const jobId = new URLSearchParams(query).get("job") || undefined;
  if (path === "/applications") return ["applications", {}];
  if (path === "/candidates") return ["candidates", { jobId }];
  return null;
}

/** Bell in the top bar: unread badge (polled every 30 s with the backend), dropdown list, "Mark all read". */
export default function NotificationBell({ go }) {
  const { db, notify } = useStore();
  const remote = api.uses("employer");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]); // backend mode: loaded when the dropdown opens
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const last = useRef(null);
  const box = useRef(null);

  // Local mode reads the store directly, so the badge is always current.
  const local = remote ? null : api.getNotificationsSync(db);
  const list = local || items;
  const count = remote ? unread : local.filter((n) => !n.read).length;

  const loadList = useCallback(() => {
    setLoading(true);
    api.getNotifications().then(setItems).catch((e) => notify(e.message, "bad")).finally(() => setLoading(false));
  }, [notify]);

  // Poll the unread count. When it grows, refresh the application statuses the pages show.
  useEffect(() => {
    if (!remote) return;
    let live = true;
    const tick = () =>
      api.getUnreadCount().then((n) => {
        if (!live) return;
        setUnread(n);
        if (last.current !== null && n > last.current) api.getJobs().catch(() => {});
        last.current = n;
      }).catch(() => {}); // offline: try again at the next tick
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [remote]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  function toggle() {
    if (!open && remote) loadList();
    setOpen(!open);
  }

  async function openItem(n) {
    setOpen(false);
    try {
      if (!n.read) {
        await api.markNotificationRead(n.id);
        if (remote) { setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setUnread((c) => Math.max(0, c - 1)); last.current = Math.max(0, (last.current ?? 1) - 1); }
      }
    } catch (e) {
      notify(e.message, "bad");
    }
    const t = target(n.link);
    if (t) go(t[0], t[1]);
  }

  async function readAll() {
    try {
      await api.markAllNotificationsRead();
      if (remote) { setItems((prev) => prev.map((x) => ({ ...x, read: true }))); setUnread(0); last.current = 0; }
    } catch (e) {
      notify(e.message, "bad");
    }
  }

  return (
    <div className="bell" ref={box}>
      <button className="icon-btn bell__btn" onClick={toggle} aria-label={count ? `Notifications, ${count} unread` : "Notifications"} aria-haspopup="true" aria-expanded={open}>
        <Icon name="bell" size={19} />
        {count > 0 && <span className="bell__badge">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div className="bell__panel" role="menu" aria-label="Notifications">
          <div className="bell__head">
            <strong>Notifications</strong>
            <button className="btn btn--text" onClick={readAll} disabled={!count}>Mark all read</button>
          </div>
          <div className="bell__list" data-lenis-prevent>
            {list.length ? list.map((n) => (
              <button key={n.id} role="menuitem" className={`bell__item ${n.read ? "" : "is-unread"}`} onClick={() => openItem(n)}>
                <span className={`bell__icon bell__icon--${n.type}`}><Icon name={ICONS[n.type] || "bell"} size={15} /></span>
                <span className="bell__text">
                  <strong>{n.title}</strong>
                  <span>{n.body}</span>
                  <small>{timeAgo(n.createdAt)}</small>
                </span>
                {!n.read && <span className="bell__dot" aria-label="Unread" />}
              </button>
            )) : <p className="bell__empty">{loading ? "Loading…" : "You're all caught up."}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
