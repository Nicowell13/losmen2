"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout, getStoredAdmin } from "@/lib/api";

const navItems = [
  { href: "/dashboard", icon: "📊", label: "Dashboard" },
  { href: "/whatsapp", icon: "📱", label: "WhatsApp" },
  { href: "/kamar", icon: "🏠", label: "Kelola Kamar" },
  { href: "/booking", icon: "📋", label: "Booking" },
  { href: "/settings", icon: "⚙️", label: "Pengaturan" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const admin = getStoredAdmin();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>🏨 Losmen Bahagia</h1>
        <p>Admin: {admin?.username || "admin"}</p>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? "active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="nav-link" onClick={logout}>
          <span className="nav-icon">🚪</span>
          Keluar
        </button>
      </div>
    </aside>
  );
}
