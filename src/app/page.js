"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const [playlistName, setPlaylistName] = useState("");
  const [uploadMethod, setUploadMethod] = useState("file"); // "file" or "url"
  const [m3uUrl, setM3uUrl] = useState("");
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successData, setSuccessData] = useState(null);
  const [userLists, setUserLists] = useState([]);

  // Fetch active sync codes for the logged-in user
  const fetchUserLists = async () => {
    try {
      const res = await fetch("/api/user-lists");
      if (res.ok) {
        const data = await res.json();
        setUserLists(data.lists || []);
      }
    } catch (err) {
      console.error("Error fetching user playlists:", err);
    }
  };

  useEffect(() => {
    if (session) {
      fetchUserLists();
    } else {
      setUserLists([]);
    }
  }, [session]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!playlistName.trim()) {
      setErrorMsg("O nome da lista é obrigatório.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    setSuccessData(null);

    try {
      let res;
      if (uploadMethod === "file") {
        if (!file) {
          throw new Error("Selecione um arquivo de lista M3U.");
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", playlistName.trim());

        res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
      } else {
        if (!m3uUrl.trim()) {
          throw new Error("Cole o link completo da sua lista M3U.");
        }
        res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            url: m3uUrl.trim(),
            name: playlistName.trim()
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Erro ao processar lista.");
      }

      setSuccessData(data);
      setM3uUrl("");
      setFile(null);
      setPlaylistName("");
      fetchUserLists(); // Reload the sync codes list
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteList = async (code) => {
    if (!confirm(`Deseja realmente excluir a lista associada ao código ${code}?`)) return;

    try {
      const res = await fetch(`/api/delete-list?code=${code}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erro ao deletar lista.");
      }

      // Clear success view if the deleted list was just created
      if (successData && successData.code === code) {
        setSuccessData(null);
      }

      fetchUserLists();
    } catch (err) {
      console.error(err);
      alert(err.message || "Erro ao deletar a lista.");
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
      <div className="max-w-xl w-full mx-auto flex flex-col flex-grow justify-center">
        
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

            {/* Unified Upload Form Card */}
            <form onSubmit={handleSubmit} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col text-left">
              <div className="flex flex-col mb-4">
                <h3 className="text-lg font-bold text-white">Adicionar Lista M3U</h3>
                <p className="text-xs text-slate-500 mt-1 font-light leading-relaxed">
                  Envie sua lista M3U. Nós baixamos, filtramos e preparamos tudo para carregar na sua Smart TV sem travamentos.
                </p>
              </div>

              {/* Playlist Name Input */}
              <div className="flex flex-col mb-4">
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">Nome da Lista (Obrigatório)</label>
                <input
                  type="text"
                  placeholder="Ex: Canais da Sala, Minha Lista Principal..."
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 transition-colors"
                />
              </div>

              {/* Radio Method Selector */}
              <div className="flex flex-col mb-5">
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Método de Envio</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950/40 border border-slate-850 p-1.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => { setUploadMethod("file"); setM3uUrl(""); }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${uploadMethod === "file" ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Arquivo .m3u
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUploadMethod("url"); setFile(null); }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${uploadMethod === "url" ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Link / URL
                  </button>
                </div>
              </div>

              {/* Conditional Inputs */}
              {uploadMethod === "file" ? (
                /* FILE DRAG AND DROP */
                <div className="flex flex-col mb-4">
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200
                      ${dragActive ? 'border-sky-400 bg-sky-950/20' : 'border-slate-800 bg-slate-950/20 hover:border-slate-700'}`}
                  >
                    <input
                      type="file"
                      accept=".m3u,.m3u8,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                      id="m3u-file-upload"
                    />
                    <label htmlFor="m3u-file-upload" className="cursor-pointer text-center flex flex-col items-center w-full">
                      <svg className="w-8 h-8 text-sky-500/80 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-xs text-slate-300 font-medium">
                        {file ? file.name : "Arraste ou clique para selecionar seu arquivo .m3u"}
                      </span>
                      {file && <span className="text-[10px] text-slate-500 mt-1 font-light">Tamanho: {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                    </label>
                  </div>
                </div>
              ) : (
                /* URL INPUT */
                <div className="flex flex-col mb-4">
                  <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">URL da Lista</label>
                  <input
                    type="url"
                    placeholder="http://seu-provedor.com/get.php?username=..."
                    value={m3uUrl}
                    onChange={(e) => setM3uUrl(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !playlistName.trim() || (uploadMethod === "file" ? !file : !m3uUrl.trim())}
                className="w-full py-3 px-4 rounded-xl text-xs font-extrabold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:hover:bg-sky-500 transition-colors shadow-lg"
              >
                {isLoading ? "Processando e Sincronizando..." : "Enviar e Gerar Código"}
              </button>
            </form>

            {/* List of Sincronized Codes (Single line items) */}
            <div className="flex flex-col text-left mt-2 bg-slate-900/20 border border-slate-800/60 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Lista de Códigos Ativos</h2>
              
              {userLists.length === 0 ? (
                <p className="text-xs text-slate-500 font-light py-4 text-center">Nenhuma lista sincronizada ainda. Faça um upload acima para gerar seu primeiro código!</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {userLists.map((list, index) => (
                    <div 
                      key={list.code} 
                      className="flex items-center justify-between py-3 px-4 bg-slate-950/60 border border-slate-850 rounded-xl hover:border-slate-700 transition-colors text-slate-200"
                    >
                      {/* Left: Playlist Name */}
                      <div className="flex flex-col max-w-[150px] truncate">
                        <span className="text-xs text-slate-500 font-light">Playlist #{userLists.length - index}</span>
                        <span className="text-sm font-bold text-white truncate" title={list.name}>{list.name || "Lista Sem Nome"}</span>
                      </div>

                      {/* Middle: Counts with Icons */}
                      <div className="flex items-center gap-4 text-xs font-light text-slate-400">
                        {/* Movies */}
                        <div className="flex items-center" title="Filmes">
                          <svg className="w-4 h-4 mr-1.5 text-sky-400 fill-current" viewBox="0 0 24 24">
                            <path d="M18,4l2,3h-3l-2-3h-2l2,3h-3l-2-3H8l2,3H7L5,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V4H18M16,17H14V12H16V17M12,17H10V12H12V17M8,17H6V12H8V17Z" />
                          </svg>
                          <span>{list.movies_count || 0}</span>
                        </div>
                        {/* Series */}
                        <div className="flex items-center" title="Séries">
                          <svg className="w-4 h-4 mr-1.5 text-sky-400 fill-current" viewBox="0 0 24 24">
                            <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M9 5h2v2H9V5m0 4h2v2H9V9m0 4h2v2H9v-2m6 7H9v-2h6v2m0-4h-2v-2h2v2m0-4h-2V9h2v2m0-4h-2V5h2v2z" />
                          </svg>
                          <span>{list.series_count || 0}</span>
                        </div>
                        {/* Live TV Channels */}
                        <div className="flex items-center" title="Canais Ao Vivo">
                          <svg className="w-4 h-4 mr-1.5 text-sky-400 fill-current" viewBox="0 0 24 24">
                            <path d="M21,17A2,2 0 0,0 23,15V5A2,2 0 0,0 21,3H3A2,2 0 0,0 1,5V15A2,2 0 0,0 3,17H9L7.5,19.5L9,20.5L11,17.5H13L15,20.5L16.5,19.5L15,17H21M3,5H21V15H3V5Z" />
                          </svg>
                          <span>{list.live_count || 0}</span>
                        </div>
                      </div>

                      {/* Right: Code Highlight and Delete Button */}
                      <div className="flex items-center gap-3">
                        <div className="bg-sky-950/40 border border-sky-900/30 text-sky-400 font-mono px-3 py-1 rounded-lg font-black text-sm tracking-wider select-all">
                          {list.code}
                        </div>
                        <button
                          onClick={() => handleDeleteList(list.code)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-900/40 transition-all duration-200"
                          title="Excluir código"
                        >
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                          </svg>
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Instruction Banner (Outside the list) */}
            <div className="mt-2 text-center bg-sky-950/20 border border-sky-900/20 rounded-xl p-4 text-xs text-sky-300/80 leading-relaxed font-light select-none">
              💡 <strong>Como sincronizar na TV:</strong> Abra a aba <strong>Configurações</strong> no app da Smart TV dontmovie, clique em <strong>"Sincronizar via Código"</strong>, insira um dos códigos de 4 dígitos ativos exibidos acima e clique em "Sincronizar". Os arquivos de mídia serão baixados e configurados na hora!
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
