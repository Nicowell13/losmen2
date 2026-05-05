import "./globals.css";

export const metadata = {
  title: "Admin Panel — Magnolia Mansion",
  description: "Dashboard admin untuk mengelola kamar, booking, dan informasi Magnolia Mansion.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
