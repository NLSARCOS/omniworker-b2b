import { NextResponse } from "next/server";
export async function GET() {
  // Opcional: Validar el token aquí si es necesario
  // const authHeader = headers().get("authorization");
  
  // Redirigir al archivo servido estáticamente por Nginx
  return NextResponse.redirect("https://flux.simplex.lat/downloads/omniworker-agent.tar.gz");
}
