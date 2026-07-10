"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const [m3uUrl, setM3uUrl] = useState("");
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successData, setSuccessData] = useState(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setSuccessData(null);
      setErrorMsg("");
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSuccessData(null);
      setErrorMsg("");
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!m3uUrl.trim()) return;

    setIsLoading(true);
    setErrorMsg("");
    setSuccessData(null);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: m3uUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Erro ao processar lista.");
      }

      setSuccessData(data);
      setM3uUrl("");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUploadSubmit = async () => {
    if (!file) return;

    setIsLoading(true);
    setErrorMsg("");
    setSuccessData(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Erro ao fazer upload do arquivo.");
      }

      setSuccessData(data);
      setFile(null);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex-grow flex items-center justify-center min-h-screen bg-[#07080d]">
        <div className="animate-spin h-10 w-10 border-4 border-sky-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex-grow min-h-screen flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full mx-auto flex flex-col flex-grow justify-center">
        
        {/* HEADER / BRAND */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            dont<span className="text-sky-400">movie</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400 font-light">
            Sincronizador de Listas M3U para Smart TV
          </p>
        </div>

        {/* NOT LOGGED IN STATE */}
        {!session ? (
          <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-8 text-center shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4">Acesse sua Conta</h2>
            <p className="text-slate-400 font-light text-sm mb-6 max-w-md mx-auto leading-relaxed">
              Conecte-se com sua conta Google para enviar suas listas M3U. Nós cuidamos do processamento pesado na nuvem e geramos um código rápido para você usar na TV.
            </p>
            <button
              onClick={() => signIn("google")}
              className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-3 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all duration-200"
            >
              <svg className="w-4 h-4 mr-2.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.51 0-6.357-2.829-6.357-6.315 0-3.486 2.848-6.315 6.357-6.315 1.62 0 3.096.604 4.221 1.597l3.069-3.048C19.263 2.115 15.939 1 12.24 1A11 11 0 001.25 12a11 11 0 0010.99 11c6.048 0 10.98-4.364 10.98-11 0-.67-.08-1.324-.22-1.715H12.24z"/>
              </svg>
              Entrar com o Google
            </button>
          </div>
        ) : (
          /* LOGGED IN USER INTERFACE */
          <div className="flex flex-col gap-6">
            
            {/* User Profile bar */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-5 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                {session.user.image && (
                  <img src={session.user.image} alt={session.user.name} className="w-8 h-8 rounded-full border border-sky-400/50" />
                )}
                <div className="flex flex-col text-left">
                  <span className="text-xs text-slate-500">Logado como</span>
                  <span className="text-sm font-semibold text-slate-200">{session.user.email}</span>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors"
              >
                Sair
              </button>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4 text-sm text-rose-300 text-left">
                <strong>Erro:</strong> {errorMsg}
              </div>
            )}

            {/* Success Code View */}
            {successData && (
              <div className="bg-[#0e2238]/60 border border-sky-800/30 rounded-2xl p-6 text-center shadow-lg animate-fadeIn">
                <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400 bg-sky-950/50 border border-sky-900/30 px-3 py-1 rounded-full">
                  Sincronização Pronta
                </span>
                
                <h3 className="text-sm text-slate-400 font-light mt-4">Digite este código na sua TV:</h3>
                
                {/* 4 digit code block */}
                <div className="flex justify-center gap-3 my-4 select-all">
                  {successData.code.split("").map((char, index) => (
                    <div key={index} className="w-14 h-16 rounded-xl bg-slate-950/80 border border-sky-500/30 flex items-center justify-center font-extrabold text-2xl text-sky-400 shadow-md">
                      {char}
                    </div>
                  ))}
                </div>

                <div className="bg-slate-950/40 rounded-xl p-4 mt-6 text-left border border-slate-800">
                  <h4 className="text-xs uppercase font-bold text-slate-400 mb-2">Estatísticas da Lista:</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 font-light">
                    <div>Filmes: <strong className="text-white font-bold">{successData.counts.movies}</strong></div>
                    <div>Séries: <strong className="text-white font-bold">{successData.counts.series}</strong></div>
                    <div>Canais de TV: <strong className="text-white font-bold">{successData.counts.live}</strong></div>
                    <div>Total de Episódios: <strong className="text-white font-bold">{successData.counts.episodes}</strong></div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-4 leading-relaxed font-light">
                  Como sincronizar: Abra as <strong>Configurações</strong> no app da Smart TV, insira o código de 4 dígitos acima e clique em "Sincronizar". Os arquivos serão baixados instantaneamente.
                </p>
              </div>
            )}

            {/* Input Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option A: Upload File */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex flex-col text-left">
                  <h3 className="text-base font-bold text-white">Opção A: Upload de Arquivo</h3>
                  <p className="text-xs text-slate-500 mt-1 font-light leading-relaxed">
                    Carregue seu arquivo local da lista M3U (normalmente baixado do seu painel IPTV).
                  </p>
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`mt-4 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-200
                    ${dragActive ? 'border-sky-400 bg-sky-950/20' : 'border-slate-800 bg-slate-950/20 hover:border-slate-700'}`}
                >
                  <input
                    type="file"
                    accept=".m3u,.m3u8,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                    id="m3u-file-upload"
                  />
                  <label htmlFor="m3u-file-upload" className="cursor-pointer text-center flex flex-col items-center">
                    <svg className="w-8 h-8 text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-xs text-slate-400 font-medium">
                      {file ? file.name : "Arraste ou selecione seu arquivo .m3u"}
                    </span>
                  </label>
                </div>

                {file && (
                  <button
                    onClick={handleFileUploadSubmit}
                    disabled={isLoading}
                    className="mt-4 w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? "Processando..." : "Enviar Arquivo"}
                  </button>
                )}
              </div>

              {/* Option B: Enter URL */}
              <form onSubmit={handleUrlSubmit} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between text-left">
                <div className="flex flex-col mb-4">
                  <h3 className="text-base font-bold text-white">Opção B: URL da Lista M3U</h3>
                  <p className="text-xs text-slate-500 mt-1 font-light leading-relaxed">
                    Cole o link completo da sua lista M3U (fornecido pelo seu provedor). Nós baixaremos e processaremos diretamente na nuvem.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <input
                    type="url"
                    placeholder="http://seu-provedor.com/get.php?username=..."
                    value={m3uUrl}
                    onChange={(e) => setM3uUrl(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !m3uUrl}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? "Processando..." : "Importar URL"}
                  </button>
                </div>
              </form>

            </div>

          </div>
        )}

      </div>

      {/* FOOTER */}
      <div className="text-center text-xs text-slate-600 select-none mt-12">
        &copy; {new Date().getFullYear()} dontmovie companion. Todos os direitos reservados.
      </div>
    </div>
  );
}
