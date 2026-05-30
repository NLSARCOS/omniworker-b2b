import fs from "fs";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface BlogPost {
  title: string;
  slug: string;
  description: string;
  date: string;
  author: string;
  category: string;
  keywords: string[];
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
      if (val.startsWith("[") && val.endsWith("]")) {
        val = val.slice(1, -1).split(",").map((s: string) => s.trim().replace(/"/g, ""));
      }
      if (!isNaN(Number(val)) && key.trim() !== "title" && key.trim() !== "slug") {
        val = Number(val);
      }
      if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      data[key.trim()] = val;
    }
  });

  return { data, content };
}

function getPost(slug: string): { data: BlogPost; content: string } | null {
  const filePath = path.join(process.cwd(), "content/blog", `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return parseFrontmatter(fileContent);
}

function getAllSlugs(): string[] {
  const contentDir = path.join(process.cwd(), "content/blog");
  if (!fs.existsSync(contentDir)) return [];
  return fs.readdirSync(contentDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Artículo no encontrado" };

  return {
    title: `${post.data.title} — Flux Agent Blog`,
    description: post.data.description,
    keywords: post.data.keywords,
    openGraph: {
      title: post.data.title,
      description: post.data.description,
      type: "article",
      publishedTime: post.data.date,
      authors: [post.data.author],
    },
  };
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.*$)/gm, '<h3 style="font-family:\'Fraunces\',serif;font-size:20px;font-weight:500;margin:32px 0 12px;color:var(--ink)">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 style="font-family:\'Fraunces\',serif;font-size:26px;font-weight:500;letter-spacing:-0.02em;margin:40px 0 16px;color:var(--ink)">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 style="font-family:\'Fraunces\',serif;font-size:36px;font-weight:500;letter-spacing:-0.03em;margin:0 0 24px;color:var(--ink)">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.*$)/gm, '<li style="margin:6px 0;padding-left:8px">$1</li>')
    .replace(/^\- (.*$)/gm, '<li style="margin:6px 0;padding-left:8px">$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--ink);font-weight:600;text-decoration:underline;text-underline-offset:3px">$1</a>')
    .replace(/\n\n/g, '</p><p style="font-size:17px;line-height:1.7;color:var(--ink);font-family:\'Inter\',sans-serif;margin:0 0 16px">')
    .replace(/\n/g, "<br/>");
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const htmlContent = markdownToHtml(post.content);

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <article style={{ maxWidth: 720, margin: "0 auto", padding: "80px 24px 100px" }}>
        {/* Breadcrumb */}
        <Link href="/blog" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 32, fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--muted)" }}>
          ← Volver al blog
        </Link>

        {/* Meta */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", marginBottom: 16 }}>
            {post.data.category} · {post.data.readTime} min de lectura
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1.05, margin: "0 0 16px" }}>
            {post.data.title}
          </h1>
          <p style={{ fontSize: 18, color: "var(--muted)", fontFamily: "'Inter', sans-serif", lineHeight: 1.5, margin: "0 0 16px" }}>
            {post.data.description}
          </p>
          <div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "'DM Mono', monospace", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Por {post.data.author}</span>
            <span>{new Date(post.data.date).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "3px double var(--ink)", marginBottom: 40 }} />

        {/* Content */}
        <div
          style={{ fontFamily: "'Inter', sans-serif" }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

        {/* CTA */}
        <div style={{ marginTop: 60, padding: 32, border: "2px solid var(--ink)", borderRadius: 10, background: "var(--paper-warm)", textAlign: "center" }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, margin: "0 0 8px" }}>
            ¿Listo para automatizar tu empresa?
          </h3>
          <p style={{ color: "var(--muted)", fontFamily: "'Inter', sans-serif", fontSize: 15, margin: "0 0 20px" }}>
            Prueba Flux Agent gratis y sin compromiso.
          </p>
          <Link
            href="/register"
            style={{ display: "inline-block", padding: "12px 32px", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, borderRadius: 8, textDecoration: "none", border: "1.5px solid var(--ink)" }}
          >
            Comenzar gratis
          </Link>
        </div>
      </article>
    </main>
  );
}
