import "./globals.css";

export const metadata = {
  title: "YouTube Clone",
  description: "YouTube clone built with Next.js and YouTube Data API",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
