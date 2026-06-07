import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GTMScript, GTMNoscript } from "./components/GTMProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://flux.simplex.lat"),
  title: "Flux Agent — El asistente digital que trabaja por tu empresa",
  description:
    "Flux Agent asigna a tu empresa un asistente digital que atiende clientes, gestiona tareas y automatiza procesos — sin contratar a nadie más. By Simplex Latam.",
};

const globalJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://flux.simplex.lat/#organization",
      "name": "Flux Agent",
      "alternateName": "Simplex Latam",
      "url": "https://flux.simplex.lat",
      "logo": {
        "@type": "ImageObject",
        "url": "https://flux.simplex.lat/logo.svg",
      },
      "description": "Plataforma de agentes de IA autónomos para empresas latinoamericanas. Fuerza laboral digital 24/7.",
      "foundingDate": "2025",
      "areaServed": {
        "@type": "Place",
        "name": "Latinoamérica",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://flux.simplex.lat/#website",
      "url": "https://flux.simplex.lat",
      "name": "Flux Agent",
      "publisher": { "@id": "https://flux.simplex.lat/#organization" },
      "inLanguage": "es",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://flux.simplex.lat/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="google-site-verification" content="xbsXB7XNWQBYUZAS6WXFFyls3wNXzvyUJPUbcBfqh7E" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(globalJsonLd) }}
        />
        <GTMScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,400..900,0..100,0..1&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <GTMNoscript />
        {children}
      </body>
    </html>
  );
}
