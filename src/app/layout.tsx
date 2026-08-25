import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BudgetProof",
  description: "Private, browser-based budget and expense tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
