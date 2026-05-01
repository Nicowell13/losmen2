"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getBooking, getKamar, createBooking, updateBooking, deleteBooking, isLoggedIn } from "@/lib/api";

export default function BookingPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState([]);
  const [kamarTypes, setKamarTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const emptyForm = { nama_tamu: "", no_hp: "", tipe_kamar: "", check_in: "", check_out: "", status: "confirmed", catatan: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    loadData();
  }, [router]);

  async function loadData() {
    try {
      const [bData, kData] = await Promise.all([getBooking(), getKamar()]);
      setBookings(bData);
      setKamarTypes(kData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function openAdd() {
    setEditItem(null);
    setForm({ ...emptyForm, tipe_kamar: kamarTypes[0]?.tipe || "" });
    setShowModal(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({
      nama_tamu: item.nama_tamu,
      no_hp: item.no_hp || "",
      tipe_kamar: item.tipe_kamar || "",
      check_in: item.check_in ? item.check_in.split("T")[0] : "",
      check_out: item.check_out ? item.check_out.split("T")[0] : "",
      status: item.status || "confirmed",
      catatan: item.catatan || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editItem) {
        await updateBooking(editItem.id, form);
        showToast("Booking berhasil diupdate!", "success");
      } else {
        await createBooking(form);
        showToast("Booking baru berhasil ditambahkan!", "success");
      }
      setShowModal(false);
      loadData();
    } catch (err) { showToast(err.message, "error"); }
  }

  async function handleDelete(id) {
    if (!confirm("Yakin hapus booking ini?")) return;
    try {
      await deleteBooking(id);
      showToast("Booking berhasil dihapus.", "success");
      loadData();
    } catch (err) { showToast(err.message, "error"); }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = filterStatus
    ? bookings.filter((b) => b.status === filterStatus)
    : bookings;

  if (loading) {
    return (
      <div className="app-layout"><Sidebar /><main className="main-content"><div className="loading"><div className="spinner"></div></div></main></div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h2>Kelola Booking</h2>
          <p>Lihat dan kelola semua reservasi penghuni</p>
        </div>

        <div className="table-wrapper">
          <div className="table-header">
            <div className="flex items-center gap-3">
              <h3>📋 Daftar Booking ({filtered.length})</h3>
              <select
                className="form-input"
                style={{ width: "auto", padding: "6px 32px 6px 12px", fontSize: 12 }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Semua Status</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked in">Checked In</option>
                <option value="checked out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Tambah Booking</button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>Belum ada booking{filterStatus ? ` dengan status "${filterStatus}"` : ""}.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nama Tamu</th>
                  <th>No HP</th>
                  <th>Tipe Kamar</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{b.nama_tamu}</td>
                    <td>{b.no_hp || "-"}</td>
                    <td>{b.tipe_kamar}</td>
                    <td>{new Date(b.check_in).toLocaleDateString("id-ID")}</td>
                    <td>{new Date(b.check_out).toLocaleDateString("id-ID")}</td>
                    <td>
                      <span className={`badge ${
                        b.status === "confirmed" ? "badge-success" :
                        b.status === "checked in" ? "badge-info" :
                        b.status === "cancelled" || b.status === "batal" ? "badge-danger" :
                        "badge-warning"
                      }`}>{b.status}</span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editItem ? "Edit Booking" : "Tambah Booking Baru"}</h3>
                <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Nama Tamu *</label>
                    <input className="form-input" value={form.nama_tamu} onChange={(e) => setForm({...form, nama_tamu: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>No HP</label>
                    <input className="form-input" value={form.no_hp} onChange={(e) => setForm({...form, no_hp: e.target.value})} placeholder="628xxx" />
                  </div>
                  <div className="form-group">
                    <label>Tipe Kamar *</label>
                    <select className="form-input" value={form.tipe_kamar} onChange={(e) => setForm({...form, tipe_kamar: e.target.value})} required>
                      <option value="">-- Pilih Tipe --</option>
                      {kamarTypes.map((k) => <option key={k.id} value={k.tipe}>{k.tipe}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Check In *</label>
                    <input className="form-input" type="date" value={form.check_in} onChange={(e) => setForm({...form, check_in: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Check Out *</label>
                    <input className="form-input" type="date" value={form.check_out} onChange={(e) => setForm({...form, check_out: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-input" value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
                      <option value="confirmed">Confirmed</option>
                      <option value="checked in">Checked In</option>
                      <option value="checked out">Checked Out</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Catatan</label>
                    <textarea className="form-input" value={form.catatan} onChange={(e) => setForm({...form, catatan: e.target.value})} placeholder="Catatan tambahan..." />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                  <button type="submit" className="btn btn-primary">{editItem ? "💾 Simpan" : "➕ Tambah"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toast && <div className={`toast ${toast.type}`}>{toast.type === "success" ? "✅" : "❌"} {toast.msg}</div>}
      </main>
    </div>
  );
}
