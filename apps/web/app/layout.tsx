import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel — Mission Operations",
  description: "Real-time UAV mission simulation and fleet operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="shell">{children}</div>;
}

