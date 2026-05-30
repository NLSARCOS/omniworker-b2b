"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

const PRIVATE_PREFIXES = ["/dashboard", "/admin"];

export function GTMScript() {
  const pathname = usePathname();
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPrivate) return null;

  return (
    <Script id="gtm-head" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','GTM-PJGW6NH9');`}
    </Script>
  );
}

export function GTMNoscript() {
  const pathname = usePathname();
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPrivate) return null;

  return (
    <noscript>
      <iframe
        src="https://www.googletagmanager.com/ns.html?id=GTM-PJGW6NH9"
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
