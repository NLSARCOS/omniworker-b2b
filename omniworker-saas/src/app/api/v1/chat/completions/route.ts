import { NextResponse } from "next/server";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado. Token requerido." }, { status: 401 });
    }

    // 1. Validar Usuario (Decodificar MVP JWT)
    const token = authHeader.split(" ")[1];
    let email = "";
    if (token.startsWith("jwt-mock-")) {
      email = Buffer.from(token.replace("jwt-mock-", ""), "base64").toString("utf-8");
    } else {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (user.tokenBalance <= 0) {
      return NextResponse.json({ error: "Saldo de tokens insuficiente. Actualice su plan." }, { status: 402 });
    }

    // 3. Determinar el Proveedor y la URL Base según el modelo solicitado
    const body = await request.json();
    const requestedModel = (body.model || "gpt-4o-mini").toLowerCase();
    
    let targetProvider = "openai";
    let targetUrl = "https://api.openai.com/v1/chat/completions";

    if (requestedModel.includes("deepseek")) {
      targetProvider = "deepseek";
      targetUrl = "https://api.deepseek.com/chat/completions";
    } else if (requestedModel.includes("opencode")) {
      targetProvider = "opencode-go";
      targetUrl = "https://opencode.ai/zen/go/v1/chat/completions";
    } else if (requestedModel.includes("moonshot") || requestedModel.includes("kimi")) {
      targetProvider = "moonshot";
      targetUrl = "https://api.moonshot.cn/v1/chat/completions";
    } else if (requestedModel.includes("minimax")) {
      targetProvider = "minimax";
      targetUrl = "https://api.minimax.chat/v1/text/chatcompletion_v2";
    } else if (requestedModel.includes("claude")) {
      targetProvider = "anthropic";
      // Nota: Anthropic requiere formateo diferente si no se usa un shim (OpenRouter). 
      // Por simplicidad en este MVP asumiremos endpoints compatibles con OpenAI.
      targetUrl = "https://api.anthropic.com/v1/messages"; 
    }

    // 4. Obtener Llave Maestra del Superadmin para el proveedor seleccionado
    const masterProvider = await prisma.masterProvider.findFirst({ 
      where: { isActive: true, provider: targetProvider } 
    });

    if (!masterProvider || !masterProvider.apiKey) {
      return NextResponse.json({ error: `Servicio temporalmente no disponible para el proveedor: ${targetProvider}` }, { status: 503 });
    }

    console.log(`[OmniWorker Cloud] Enrutando petición de ${email} hacia -> ${targetProvider} (${requestedModel})`);

    // 5. Facturación: Descontar tokens
    const isStream = body.stream === true;
    const cost = 50; // Costo fijo MVP

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: { decrement: cost } }
    });

    await prisma.taskLog.create({
      data: {
        userId: user.id,
        promptTokens: cost,
        completionTks: 0,
        modelUsed: requestedModel,
        taskType: "cloud_reasoning"
      }
    });

    // 6. Llamar a la API de IA (compatible con OpenAI)
    const aiResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${masterProvider.apiKey}`
        // Anthropic requiere un header extra "x-api-key" y "anthropic-version" si se llamara directo, 
        // pero idealmente el cliente ya envía esto o usamos un Gateway compatible.
      },
      body: JSON.stringify({
        ...body,
        model: requestedModel
      })
    });

    if (!aiResponse.ok) {
      const errTxt = await aiResponse.text();
      console.error(`[OmniWorker Cloud] Error ${targetProvider}:`, errTxt);
      return NextResponse.json({ error: `Error del proveedor remoto (${targetProvider})` }, { status: 502 });
    }

    // 7. Retornar el flujo (stream o json)
    if (isStream) {
      return new Response(aiResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    } else {
      const data = await aiResponse.json();
      return NextResponse.json(data);
    }

  } catch (error) {
    console.error("[LLM Gateway Error]", error);
    return NextResponse.json({ error: "Error interno del proxy IA" }, { status: 500 });
  }
}
