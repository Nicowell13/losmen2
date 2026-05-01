"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getDashboard, getBooking, isLoggedIn } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    loadData();
  }, [router]);

  async function loadData() {
    try {
      const [dashData, bookingData] = await Promise.all([
        getDashboard(),
        getBooking(),
      ]);
      setStats(dashData);
      setRecentBookings(bookingData.slice(0, 5));
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div className="loading"><div className="spinner"></div></div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h2>Dashboard</h2>
          <p>Ringkasan data penginapan Anda hari ini</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card accent">
            <div className="stat-icon">🏠</div>
            <div className="stat-value">{stats?.totalKamar || 0}</div>
            <div className="stat-label">Total Kamar</div>
          </div>
          <div className="stat-card success">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{stats?.terisi || 0}</div>
            <div className="stat-label">Kamar Terisi</div>
          </div>
          <div className="stat-card info">
            <div className="stat-icon">🔑</div>
            <div className="stat-value">{stats?.tersedia || 0}</div>
            <div className="stat-label">Kamar Kosong</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-icon">📈</div>
            <div className="stat-value">{stats?.occupancyRate || 0}%</div>
            <div className="stat-label">Occupancy Rate</div>
          </div>
        </div>

        <div className="table-wrapper">
          <div className="table-header">
            <h3>📋 Booking Terbaru</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => router.push("/booking")}>
              Lihat Semua →
            </button>
          </div>
          {recentBookings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>Belum ada booking</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nama Tamu</th>
                  <th>Tipe Kamar</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => (
                  <tr key={b.id}>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{b.nama_tamu}</td>
                    <td>{b.tipe_kamar}</td>
                    <td>{new Date(b.check_in).toLocaleDateString("id-ID")}</td>
                    <td>{new Date(b.check_out).toLocaleDateString("id-ID")}</td>
                    <td>
                      <span className={`badge ${
                        b.status === "confirmed" ? "badge-success" :
                        b.status === "checked in" ? "badge-info" :
                        b.status === "cancelled" || b.status === "batal" ? "badge-danger" :
                        "badge-warning"
                      }`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
