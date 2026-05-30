// src/app/api/admin/invoices/[id]/pdf/route.ts — Generate real PDF invoice
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";

function buildInvoicePDF(invoice: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const t = invoice.tenant;
    const amount = (invoice.amount / 100).toFixed(2);
    const createdAt = new Date(invoice.createdAt).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const paidAt = new Date(invoice.paidAt).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ── Header ──
    doc.fontSize(24).font("Helvetica-Bold").text("OMNIWORKER", 50, 50);
    doc.fontSize(10).font("Helvetica").fillColor("#666").text("Factura de Suscripción B2B", 50, 78);

    doc.fontSize(10).fillColor("#999").text("Factura #", 400, 50, { align: "right" });
    doc.fontSize(14).fillColor("#000").font("Helvetica-Bold").text(invoice.invoiceNumber, 400, 64, { align: "right" });
    doc.fontSize(10).fillColor("#999").font("Helvetica").text(`Emitida: ${createdAt}`, 400, 84, { align: "right" });

    // ── Divider ──
    doc.moveTo(50, 110).lineTo(550, 110).stroke("#000");

    // ── Client block ──
    doc.fontSize(10).fillColor("#999").text("CLIENTE / TENANT", 50, 130);
    doc.fontSize(13).fillColor("#000").font("Helvetica-Bold").text(t.name, 50, 146);
    doc.fontSize(10).fillColor("#555").font("Helvetica").text(t.contactName || "—", 50, 164);
    doc.fontSize(10).fillColor("#555").text(t.contactEmail || "—", 50, 178);
    doc.fontSize(9).fillColor("#888").text(`Slug: ${t.slug}`, 50, 194);

    // ── Payment block ──
    doc.fontSize(10).fillColor("#999").text("DETALLES DEL PAGO", 350, 130);
    const details = [
      ["Estado:", invoice.status],
      ["Método:", invoice.paymentMethod],
      ["Fecha de pago:", paidAt],
      ["Moneda:", invoice.currency],
    ];
    let y = 146;
    for (const [label, value] of details) {
      doc.fontSize(10).fillColor("#555").font("Helvetica").text(label, 350, y);
      doc.fontSize(10).fillColor("#000").font("Helvetica-Bold").text(String(value), 480, y, { align: "right", width: 70 });
      y += 16;
    }

    // ── Plan ──
    if (t.plan?.name) {
      doc.fontSize(10).fillColor("#999").text("PLAN CONTRATADO", 50, 220);
      doc.fontSize(11).fillColor("#000").font("Helvetica-Bold").text(t.plan.name, 50, 236);
    }

    // ── Concept table ──
    const tableTop = 280;
    doc.rect(50, tableTop, 500, 24).fill("#f5f5f5").stroke("#ddd");
    doc.fontSize(10).fillColor("#000").font("Helvetica-Bold").text("CONCEPTO", 60, tableTop + 7);
    doc.text("TOTAL", 460, tableTop + 7, { align: "right", width: 80 });

    doc.rect(50, tableTop + 24, 500, 60).stroke("#ddd");
    doc.fontSize(10).fillColor("#333").font("Helvetica").text(
      invoice.description || "Pago de suscripción B2B — OmniWorker Platform",
      60,
      tableTop + 36,
      { width: 350 }
    );
    doc.fontSize(11).fillColor("#000").font("Helvetica-Bold").text(`$${amount}`, 460, tableTop + 36, { align: "right", width: 80 });

    // ── Total box ──
    const totalY = tableTop + 110;
    doc.moveTo(50, totalY).lineTo(550, totalY).stroke("#000");
    doc.fontSize(11).fillColor("#666").font("Helvetica").text("TOTAL PAGADO", 50, totalY + 14);
    doc.fontSize(28).fillColor("#000").font("Helvetica-Bold").text(`$${amount} ${invoice.currency}`, 400, totalY + 8, { align: "right" });

    // ── Footer ──
    doc.fontSize(8).fillColor("#aaa").font("Helvetica").text(
      `Documento generado electrónicamente por OmniWorker SaaS · ID: ${invoice.id}`,
      50,
      750,
      { align: "center", width: 500 }
    );
    doc.fontSize(8).fillColor("#aaa").text("Si tiene dudas, contacte a soporte.", 50, 762, { align: "center", width: 500 });

    doc.end();
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      tenant: {
        select: {
          name: true,
          slug: true,
          contactName: true,
          contactEmail: true,
          plan: { select: { name: true } },
        },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  }

  try {
    const pdfBuffer = await buildInvoicePDF(invoice);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="factura-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error al generar PDF: " + (err?.message || String(err)) },
      { status: 500 }
    );
  }
}
