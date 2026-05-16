import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8 sm:p-20 font-mono flex flex-col items-center justify-center border-[16px] border-black m-4 bg-white text-black">
      <div className="max-w-3xl w-full">
        <h1 className="text-6xl sm:text-8xl font-bold uppercase tracking-tighter mb-8 leading-none">
          OmniWorker
        </h1>

        <div className="border-t-4 border-black py-8">
          <p className="text-2xl sm:text-3xl font-bold uppercase leading-snug mb-8">
            Agente autónomo local.
            <br />
            Razonamiento en la nube.
            <br />
            Cero costos ocultos.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/register"
              className="btn-brutal text-xl bg-black text-white hover:bg-gray-800 text-center"
            >
              Empezar gratis →
            </Link>
            <Link
              href="/login"
              className="btn-brutal text-xl text-center"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="card-brutal">
            <h2 className="text-2xl font-bold uppercase mb-4 border-b-2 border-black pb-2">
              Privacidad Total
            </h2>
            <p className="text-lg">
              Tus documentos y RAG se procesan 100% en local usando modelos SLM
              eficientes.
            </p>
          </div>
          <div className="card-brutal">
            <h2 className="text-2xl font-bold uppercase mb-4 border-b-2 border-black pb-2">
              Poder SaaS
            </h2>
            <p className="text-lg">
              Cuando necesitas resolver problemas complejos, el agente enruta la
              tarea a nuestro LLM Gateway.
            </p>
          </div>
          <div className="card-brutal">
            <h2 className="text-2xl font-bold uppercase mb-4 border-b-2 border-black pb-2">
              Multi-equipo
            </h2>
            <p className="text-lg">
              Crea un workspace para tu empresa. Conecta múltiples agentes en
              diferentes equipos.
            </p>
          </div>
          <div className="card-brutal">
            <h2 className="text-2xl font-bold uppercase mb-4 border-b-2 border-black pb-2">
              Edge Agents
            </h2>
            <p className="text-lg">
              Instala el agente en cada PC. Ejecuta tools localmente con control
              total desde la nube.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
