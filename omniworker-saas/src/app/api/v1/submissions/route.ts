// src/app/api/v1/submissions/route.ts — Public Contact Form Submission API
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const submissionSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  email: z.string().email("El correo electrónico no es válido"),
  companySize: z.string().max(50).nullable().optional(),
  useCase: z.string().max(2000).nullable().optional(),
  source: z.string().min(1, "El origen es requerido").max(150),
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = submissionSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, companySize, useCase, source } = parsed.data;

    const submission = await prisma.contactSubmission.create({
      data: {
        name,
        email,
        companySize: companySize || null,
        useCase: useCase || null,
        source,
      },
    });

    return NextResponse.json({ success: true, id: submission.id });
  } catch (err: any) {
    console.error("[Submissions API] Error creating submission:", err);
    return NextResponse.json(
      { error: "Error interno del servidor al procesar la solicitud" },
      { status: 500 }
    );
  }
}
