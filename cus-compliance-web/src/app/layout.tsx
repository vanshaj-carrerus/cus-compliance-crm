import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Roboto,
  Poppins,
  Open_Sans,
  Lato,
  Montserrat,
  Nunito,
} from "next/font/google";
import "./globals.css";
import "./aurora.css";
import "./dashboard.css";
import PwaProvider from "@/components/PwaProvider";
import GlassFX from "@/components/GlassFX";
import ThemeFX from "@/components/ThemeFX";
import "./settings.css";
import "./extras.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Optional fonts users can pick in Settings. preload:false = the files are only
// downloaded by browsers that actually use them. (next/font needs literal options.)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", preload: false });
const roboto = Roboto({ variable: "--font-roboto", weight: ["300", "400", "500", "700", "900"], subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({ variable: "--font-poppins", weight: ["300", "400", "500", "600", "700", "800"], subsets: ["latin"], display: "swap", preload: false });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], display: "swap", preload: false });
const lato = Lato({ variable: "--font-lato", weight: ["300", "400", "700", "900"], subsets: ["latin"], display: "swap", preload: false });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: "CareerUS Compliance CRM",
  description: "CareerUS Solutions Compliance CRM",
  applicationName: "CUS CRM",
  appleWebApp: {
    capable: true,
    title: "CUS CRM",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "any" },
      { url: "/logo.png", type: "image/png", sizes: "128x128" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
  themeColor: "#5a6cf0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${roboto.variable} ${poppins.variable} ${openSans.variable} ${lato.variable} ${montserrat.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}
        <PwaProvider />
        <GlassFX />
        <ThemeFX />
      </body>
    </html>
  );
}
