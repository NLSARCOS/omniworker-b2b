import fs from "fs";
import path from "path";
import Link from "next/link";

interface BlogPost {
  title: string;
  slug: string;
  description: string;
  date: string;
  author: string;
  category: string;
  readTime: number;
}

function parseFrontmatter(fileContent: string): { data: BlogPost; content: string } {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {} as BlogPost, content: fileContent };

  const frontmatter = match[1];
  const content = match[2];
  const data: any = {};

  frontmatter.split("\n").forEach((line) => {
    const [key, ...rest] = line.split(": ");
    if (key && rest.length) {
      let val = rest.join(": ").trim();
      // Parse arrays
      if (val.startsWith("[") && val.endsWith("]")) {
        val = val.slice(1, -1).split(",").map((s) => s.trim().replace(/"/g, ""));
      }
      // Parse numbers
      if (!isNaN(Number(val)) && key.trim() !== "title" && key.trim() !== "slug") {
        val = Number(val);
      }
      // Remove quotes
      if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      data[key.trim()] = val;
    }
  });

  return { data, content };
}

function getAllPosts(): BlogPost[] {
  const contentDir = path.join(process.cwd(), "content/blog");
  if (!fs.existsSync(contentDir)) return [];

  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".md"));
  const posts = files.map((file) => {
    const content = fs.readFileSync(path.join(contentDir, file), "utf-8");
    const { data } = parseFrontmatter(content);
    return data as BlogPost;
  });

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 48px" }}>
        <div style={{ marginBottom: 48 }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24, fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--muted)" }}>
            ← Volver al inicio
          </Link>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 0.95, margin: "0 0 16px" }}>
            Blog
          </h1>
          <p style={{ fontSize: 18, color: "var(--muted)", fontFamily: "'Inter', sans-serif", maxWidth: 560, lineHeight: 1.6 }}>
            Ideas, guías y novedades sobre automatización empresarial y asistentes digitales. Por Flux Agent.
          </p>
        </div>

        {/* Posts Grid */}
        {posts.length === 0 ? (
          <p style={{ color: "var(--muted)", fontFamily: "'Inter', sans-serif", fontSize: 16 }}>
            Próximamente más artículos. ¡Vuelve pronto!
          </p>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{ textDecoration: "none", color: "inherit", display: "block", padding: 32, border: "1.5px solid var(--rule)", borderRadius: 10, background: "var(--paper)", transition: "border-color 0.2s" }}
              >
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 12 }}>
                  {post.category} · {post.readTime} min de lectura
                </div>
                <h2 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", margin: "0 0 8px", color: "var(--ink)" }}>
                  {post.title}
                </h2>
                <p style={{ fontSize: 15, color: "var(--muted)", fontFamily: "'Inter', sans-serif", lineHeight: 1.5, margin: "0 0 12px" }}>
                  {post.description}
                </p>
                <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
                  {new Date(post.date).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })} · Por {post.author}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
