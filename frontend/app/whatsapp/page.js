"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  getWhatsAppStatus,
  getWhatsAppQR,
  startWhatsApp,
  stopWhatsApp,
  restartWhatsApp,
  logoutWhatsApp,
  isLoggedIn,
} from "@/lib/api";

export default function WhatsAppPage() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [toast, setToast] = useState(null);
  const qrIntervalRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    checkStatus();
    return () => clearQrPolling();
  }, [router]);

  async function checkStatus() {
    setLoading(true);
    try {
      const data = await getWhatsAppStatus();
      setStatus(data);

      // Jika status SCAN_QR_CODE, mulai polling QR
      if (data.status === "SCAN_QR_CODE") {
        startQrPolling();
      } else {
        clearQrPolling();
        setQrImage(null);
      }
    } catch (err) {
      setStatus({ status: "ERROR", message: "Gagal cek status: " + err.message });
    } finally {
      setLoading(false);
    }
  }

  function startQrPolling() {
    clearQrPolling();
    fetchQR(); // Fetch pertama langsung
    qrIntervalRef.current = setInterval(async () => {
      await fetchQR();
      // Cek status juga — apakah sudah connect?
      try {
        const data = await getWhatsAppStatus();
        setStatus(data);
        if (data.status === "WORKING") {
          clearQrPolling();
          setQrImage(null);
          showToast("✅ WhatsApp berhasil terhubung!", "success");
        }
      } catch (e) {}
    }, 5000); // Refresh QR setiap 5 detik
  }

  function clearQrPolling() {
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current);
      qrIntervalRef.current = null;
    }
  }

  async function fetchQR() {
    try {
      const data = await getWhatsAppQR();
      if (data.qr) {
        setQrImage(data.qr);
      }
    } catch (err) {
      console.error("QR fetch error:", err);
    }
  }

  async function handleAction(action, actionName) {
    setActionLoading(actionName);
    try {
      let result;
      switch (action) {
        case "start":
          result = await startWhatsApp();
          break;
        case "stop":
          result = await stopWhatsApp();
          break;
        case "restart":
          result = await restartWhatsApp();
          break;
        case "logout":
          if (!confirm("Yakin mau logout? Anda perlu scan QR lagi setelah ini.")) {
            setActionLoading("");
            return;
          }
          result = await logoutWhatsApp();
          break;
      }
      showToast(result.message || "Berhasil!", "success");
      // Tunggu sebentar lalu cek status
      setTimeout(checkStatus, 2000);
    } catch (err) {
      showToast(err.message || "Gagal!", "error");
    } finally {
      setActionLoading("");
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function getStatusColor(s) {
    switch (s) {
      case "WORKING": return "var(--success)";
      case "SCAN_QR_CODE": return "var(--warning)";
      case "STARTING": return "var(--info)";
      case "STOPPED": return "var(--text-muted)";
      case "FAILED":
      case "ERROR": return "var(--danger)";
      default: return "var(--text-secondary)";
    }
  }

  function getStatusBadge(s) {
    switch (s) {
      case "WORKING": return "badge-success";
      case "SCAN_QR_CODE": return "badge-warning";
      case "STARTING": return "badge-info";
      case "FAILED":
      case "ERROR": return "badge-danger";
      default: return "badge-info";
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
          <h2>WhatsApp Connection</h2>
          <p>Kelola koneksi WhatsApp WAHA untuk chatbot</p>
        </div>

        {/* Status Card */}
        <div className="wa-status-card">
          <div className="wa-status-header">
            <div className="wa-status-indicator">
              <div
                className="status-dot"
                style={{ background: getStatusColor(status?.status) }}
              ></div>
              <div>
                <h3>Status Sesi: <span className={`badge ${getStatusBadge(status?.status)}`}>{status?.status || "UNKNOWN"}</span></h3>
                <p style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: 14 }}>
                  {status?.message}
                </p>
                {status?.me && (
                  <p style={{ color: "var(--accent)", marginTop: 8, fontSize: 13 }}>
                    📱 {status.me.pushName || status.me.id || "Connected"}
                  </p>
                )}
              </div>
            </div>

            <div className="wa-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAction("start", "start")}
                disabled={!!actionLoading}
              >
                {actionLoading === "start" ? "⏳..." : "▶️ Start"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleAction("restart", "restart")}
                disabled={!!actionLoading}
              >
                {actionLoading === "restart" ? "⏳..." : "🔄 Restart"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleAction("stop", "stop")}
                disabled={!!actionLoading}
              >
                {actionLoading === "stop" ? "⏳..." : "⏹️ Stop"}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleAction("logout", "logout")}
                disabled={!!actionLoading}
              >
                {actionLoading === "logout" ? "⏳..." : "🚪 Logout"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={checkStatus}
                disabled={!!actionLoading}
              >
                🔍 Refresh
              </button>
            </div>
          </div>
        </div>

        {/* QR Code */}
        {status?.status === "SCAN_QR_CODE" && (
          <div className="qr-card">
            <div className="qr-header">
              <h3>📱 Scan QR Code</h3>
              <p>Buka WhatsApp di HP → Menu → Perangkat Tertaut → Tautkan Perangkat</p>
            </div>

            <div className="qr-body">
              {qrImage ? (
                <div className="qr-wrapper">
                  <img src={qrImage} alt="WhatsApp QR Code" className="qr-image" />
                  <p className="qr-hint">QR code auto-refresh setiap 5 detik</p>
                </div>
              ) : (
                <div className="qr-loading">
                  <div className="spinner"></div>
                  <p>Memuat QR Code...</p>
                </div>
              )}
            </div>

            <div className="qr-steps">
              <div className="step">
                <span className="step-num">1</span>
                <span>Buka <strong>WhatsApp</strong> di HP Anda</span>
              </div>
              <div className="step">
                <span className="step-num">2</span>
                <span>Tap <strong>⋮ Menu</strong> → <strong>Perangkat Tertaut</strong></span>
              </div>
              <div className="step">
                <span className="step-num">3</span>
                <span>Tap <strong>Tautkan Perangkat</strong></span>
              </div>
              <div className="step">
                <span className="step-num">4</span>
                <span>Arahkan kamera HP ke QR di atas</span>
              </div>
            </div>
          </div>
        )}

        {/* Connected Info */}
        {status?.status === "WORKING" && (
          <div className="card" style={{ marginTop: 24, textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <h3 style={{ fontSize: 20, marginBottom: 8 }}>WhatsApp Terhubung!</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Chatbot sedang aktif dan siap menerima pesan masuk.
            </p>
            {status?.me && (
              <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 15 }}>
                📱 {status.me.pushName || ""} ({status.me.id || ""})
              </p>
            )}
          </div>
        )}

        {/* Not Found */}
        {status?.status === "NOT_FOUND" && (
          <div className="card" style={{ marginTop: 24, textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔌</div>
            <h3 style={{ fontSize: 20, marginBottom: 8 }}>Sesi Belum Ada</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
              Klik tombol <strong>Start</strong> untuk membuat sesi baru dan mendapatkan QR code.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => handleAction("start", "start")}
              disabled={!!actionLoading}
            >
              {actionLoading === "start" ? "⏳ Memulai..." : "▶️ Mulai Sesi Baru"}
            </button>
          </div>
        )}

        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === "success" ? "✅" : "❌"} {toast.msg}
          </div>
        )}

        <style jsx>{`
          .wa-status-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 24px;
          }
          .wa-status-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            flex-wrap: wrap;
          }
          .wa-status-indicator {
            display: flex;
            align-items: flex-start;
            gap: 16px;
          }
          .status-dot {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            margin-top: 6px;
            flex-shrink: 0;
            animation: pulse 2s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .wa-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .qr-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            margin-top: 24px;
            overflow: hidden;
          }
          .qr-header {
            padding: 24px;
            border-bottom: 1px solid var(--border);
          }
          .qr-header h3 {
            font-size: 18px;
            margin-bottom: 6px;
          }
          .qr-header p {
            color: var(--text-secondary);
            font-size: 14px;
          }
          .qr-body {
            display: flex;
            justify-content: center;
            padding: 40px 24px;
          }
          .qr-wrapper {
            text-align: center;
          }
          .qr-image {
            width: 300px;
            height: 300px;
            border-radius: 12px;
            border: 3px solid var(--accent);
            background: white;
            padding: 12px;
            object-fit: contain;
          }
          .qr-hint {
            margin-top: 12px;
            font-size: 12px;
            color: var(--text-muted);
          }
          .qr-loading {
            text-align: center;
            padding: 40px;
          }
          .qr-loading p {
            margin-top: 16px;
            color: var(--text-muted);
          }
          .qr-steps {
            display: flex;
            gap: 0;
            border-top: 1px solid var(--border);
          }
          .step {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            font-size: 13px;
            color: var(--text-secondary);
            border-right: 1px solid var(--border);
          }
          .step:last-child {
            border-right: none;
          }
          .step-num {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: var(--accent-muted);
            color: var(--accent);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 13px;
            flex-shrink: 0;
          }
          @media (max-width: 768px) {
            .wa-status-header {
              flex-direction: column;
            }
            .qr-steps {
              flex-direction: column;
            }
            .step {
              border-right: none;
              border-bottom: 1px solid var(--border);
            }
            .qr-image {
              width: 250px;
              height: 250px;
            }
          }
        `}</style>
      </main>
    </div>
  );
}
