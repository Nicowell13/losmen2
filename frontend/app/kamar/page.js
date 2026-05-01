"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getKamar, createKamar, updateKamar, deleteKamar, isLoggedIn } from "@/lib/api";

export default function KamarPage() {
  const router = useRouter();
  const [kamarList, setKamarList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ tipe: "", harga: "", total_kamar: "", fasilitas: "", keterangan: "" });

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    loadKamar();
  }, [router]);

  async function loadKamar() {
    try {
      const data = await getKamar();
      setKamarList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditItem(null);
    setForm({ tipe: "", harga: "", total_kamar: "", fasilitas: "", keterangan: "" });
    setShowModal(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({
      tipe: item.tipe,
      harga: item.harga.toString(),
      total_kamar: item.total_kamar.toString(),
      fasilitas: item.fasilitas || "",
      keterangan: item.keterangan || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      tipe: form.tipe,
      harga: parseInt(form.harga),
      total_kamar: parseInt(form.total_kamar),
      fasilitas: form.fasilitas,
      keterangan: form.keterangan,
    };

    try {
      if (editItem) {
        await updateKamar(editItem.id, payload);
        showToast("Kamar berhasil diupdate!", "success");
      } else {
        await createKamar(payload);
        showToast("Kamar baru berhasil ditambahkan!", "success");
      }
      setShowModal(false);
      loadKamar();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Yakin hapus tipe kamar ini?")) return;
    try {
      await deleteKamar(id);
      showToast("Kamar berhasil dihapus.", "success");
      loadKamar();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function formatRupiah(num) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(num);
  }

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
          <h2>Kelola Kamar</h2>
          <p>Atur tipe kamar, harga, dan fasilitas penginapan Anda</p>
        </div>

        <div className="table-wrapper">
          <div className="table-header">
            <h3>🏠 Daftar Tipe Kamar</h3>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Tambah Tipe</button>
          </div>

          {kamarList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏠</div>
              <p>Belum ada tipe kamar. Klik tombol di atas untuk menambahkan.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tipe Kamar</th>
                  <th>Harga / Bulan</th>
                  <th>Total Kamar</th>
                  <th>Fasilitas</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {kamarList.map((k) => (
                  <tr key={k.id}>
                    <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{k.tipe}</td>
                    <td className="text-accent" style={{ fontWeight: 600 }}>{formatRupiah(k.harga)}</td>
                    <td>{k.total_kamar}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.fasilitas}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(k)}>✏️ Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(k.id)}>🗑️</button>
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
                <h3>{editItem ? "Edit Tipe Kamar" : "Tambah Tipe Kamar Baru"}</h3>
                <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Tipe Kamar *</label>
                    <input className="form-input" value={form.tipe} onChange={(e) => setForm({...form, tipe: e.target.value})} placeholder='Contoh: Sendiri (1 orang)' required />
                  </div>
                  <div className="form-group">
                    <label>Harga per Bulan (Rp) *</label>
                    <input className="form-input" type="number" value={form.harga} onChange={(e) => setForm({...form, harga: e.target.value})} placeholder="3300000" required />
                  </div>
                  <div className="form-group">
                    <label>Total Kamar *</label>
                    <input className="form-input" type="number" value={form.total_kamar} onChange={(e) => setForm({...form, total_kamar: e.target.value})} placeholder="40" required />
                  </div>
                  <div className="form-group">
                    <label>Fasilitas</label>
                    <textarea className="form-input" value={form.fasilitas} onChange={(e) => setForm({...form, fasilitas: e.target.value})} placeholder="AC, Kamar Mandi Dalam, WiFi, ..." />
                  </div>
                  <div className="form-group">
                    <label>Keterangan Tambahan</label>
                    <textarea className="form-input" value={form.keterangan} onChange={(e) => setForm({...form, keterangan: e.target.value})} placeholder="Info tambahan tentang kamar..." />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                  <button type="submit" className="btn btn-primary">{editItem ? "💾 Simpan Perubahan" : "➕ Tambah Kamar"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && <div className={`toast ${toast.type}`}>{toast.type === "success" ? "✅" : "❌"} {toast.msg}</div>}
      </main>
    </div>
  );
}
