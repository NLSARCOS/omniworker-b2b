import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";

// Función recursiva para buscar archivos page.tsx
function getRoutes(dir: string, baseDir: string = ""): string[] {
  const routes: string[] = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Ignorar carpetas privadas, APIs y componentes de layout/rutas especiales
      if (
        file === "dashboard" ||
        file === "admin" ||
        file === "api" ||
        file === "components" ||
        file.startsWith("_") ||
        file.startsWith("(")
      ) {
        continue;
      }
      routes.push(...getRoutes(fullPath, path.join(baseDir, file)));
    } else if (file === "page.tsx") {
      // Es una ruta pública
      routes.push(baseDir);
    }
  }

  return routes;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://flux.simplex.lat";
  const appDir = path.join(process.cwd(), "src/app");
  
  try {
    const publicRoutes = getRoutes(appDir);
    
    return publicRoutes.map((route) => {
      // Normalizar la URL (remover slashes extras)
      const cleanRoute = route ? `/${route}` : "";
      const isHome = cleanRoute === "";
      
      return {
        url: `${baseUrl}${cleanRoute}`,
        lastModified: new Date(),
        changeFrequency: isHome ? "weekly" : "monthly",
        priority: isHome ? 1.0 : 0.8,
      };
    });
  } catch (error) {
    console.error("Error generating dynamic sitemap:", error);
    // Fallback estático de seguridad
    return [
      { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
      { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
      { url: `${baseUrl}/register`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    ];
  }
}
