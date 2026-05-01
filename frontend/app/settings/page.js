"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getInfo, updateInfo, deleteInfo, isLoggedIn } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [infoList, setInfoList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    loadInfo();
  }, [router]);

  async function loadInfo() {
    try {
      const data = await getInfo();
      setInfoList(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function handleChange(idx, field, value) {
    const updated = [...infoList];
    updated[idx] = { ...updated[idx], [field]: value };
    setInfoList(updated);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const items = infoList.map((i) => ({ key: i.key, value: i.value }));
      await updateInfo(items);
      showToast("Pengaturan berhasil disimpan!", "success");
      loadInfo();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddInfo(e) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    try {
      await updateInfo([{ key: newKey.trim(), value: newValue.trim() }]);
      setNewKey("");
      setNewValue("");
      showToast("Info baru berhasil ditambahkan!", "success");
      loadInfo();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Yakin hapus info ini?")) return;
    try {
      await deleteInfo(id);
      showToast("Info berhasil dihapus.", "success");
      loadInfo();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Label yang lebih ramah untuk key yang diketahui
  const keyLabels = {
    deposit: "💰 Deposit",
    ukuran_kamar: "📐 Ukuran Kamar",
    listrik: "⚡ Listrik",
    laundry: "👕 Laundry",
    parkir: "🚗 Parkir",
    checkin: "🕐 Check-in/Check-out",
  };

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
          <h2>Pengaturan</h2>
          <p>Kelola informasi losmen yang ditampilkan ke tamu melalui chatbot</p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>📝 Informasi Losmen</h3>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "💾 Simpan Semua"}
            </button>
          </div>

          {infoList.map((item, idx) => (
            <div key={item.id} className="form-group" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ minWidth: 160 }}>
                <label style={{ marginBottom: 0, whiteSpace: "nowrap" }}>
                  {keyLabels[item.key] || item.key}
                </label>
                <span className="text-muted" style={{ fontSize: 11, display: "block" }}>{item.key}</span>
              </div>
              <textarea
                className="form-input"
                value={item.value}
                onChange={(e) => handleChange(idx, "value", e.target.value)}
                rows={2}
                style={{ flex: 1, minHeight: 44 }}
              />
              <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(item.id)} title="Hapus">🗑️</button>
            </div>
          ))}
        </div>

        {/* Tambah Info Baru */}
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>➕ Tambah Informasi Baru</h3>
          <form onSubmit={handleAddInfo} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: "0 0 200px", marginBottom: 0 }}>
              <label>Key</label>
              <input className="form-input" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="contoh: wifi_password" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Value</label>
              <input className="form-input" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Isi informasi..." />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: 44 }}>Tambah</button>
          </form>
        </div>

        {toast && <div className={`toast ${toast.type}`}>{toast.type === "success" ? "✅" : "❌"} {toast.msg}</div>}
      </main>
    </div>
  );
}
