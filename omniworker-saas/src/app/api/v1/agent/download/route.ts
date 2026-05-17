import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(request: Request) {
  // Opcional: Validar el token aquí si es necesario
  // const authHeader = headers().get("authorization");
  
  // Redirigir al archivo servido estáticamente por Nginx
  return NextResponse.redirect("https://worker.thelab.lat/downloads/omniworker-agent.tar.gz");
}
