import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const os = searchParams.get("os") || "mac"; // default to mac if none provided

  try {
    // Obtenemos el latest release desde la API de GitHub
    const res = await fetch(
      "https://api.github.com/repos/Simplex-lat/omniworker-releases/releases/latest",
      {
        headers: {
          "User-Agent": "OmniWorker-SaaS-AutoUpdater",
          Accept: "application/vnd.github.v3+json",
        },
        // Revalidamos máximo cada 5 minutos para no quemar el rate limit de github
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "No se pudo obtener la última versión desde GitHub" },
        { status: 500 }
      );
    }

    const data = await res.json();
    
    // Filtramos los assets buscando el que coincida con el OS solicitado
    let targetExtension = ".dmg";
    if (os === "win") targetExtension = ".exe";
    if (os === "linux") targetExtension = ".AppImage";

    const asset = data.assets.find((a: { name: string; browser_download_url: string }) =>
      a.name.toLowerCase().endsWith(targetExtension.toLowerCase())
    );

    if (!asset) {
      // Si no existe compilado para este OS todavía, mandamos al panel de releases por defecto
      return NextResponse.redirect("https://github.com/Simplex-lat/omniworker-releases/releases/latest");
    }

    // Redirigimos directamente al archivo .exe / .dmg
    return NextResponse.redirect(asset.browser_download_url);

  } catch (error) {
    console.error("Error fetching release:", error);
    return NextResponse.redirect("https://github.com/Simplex-lat/omniworker-releases/releases/latest");
  }
}
