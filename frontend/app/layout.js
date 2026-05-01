import "./globals.css";

export const metadata = {
  title: "Admin Panel — Losmen Bahagia",
  description: "Dashboard admin untuk mengelola kamar, booking, dan informasi Losmen Bahagia.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
