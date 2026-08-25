import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { AppStateProvider } from "@/lib/AppState";
import { DrillProvider } from "@/components/DrillDown";
import { loadDataset } from "@/lib/data";
import { availableFys, latestFyWithData } from "@/lib/fy";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BudgetProof — income, expenses & GST",
  description: "Personal rideshare income, expense and GST dashboard.",
};

const themeInit = `(function(){try{var t=localStorage.getItem('budgetproof.theme');var d=t? t==='dark' : true;document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Only the list of years crosses to the client here, not the dataset itself.
  const ds = loadDataset();
  const years = availableFys(ds);
  const fallbackFy = latestFyWithData(ds);
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        <AppStateProvider>
          <DrillProvider>
            <TopNav years={years} fallbackFy={fallbackFy} />
            {children}
          </DrillProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
