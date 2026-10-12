import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";
import { CopiarEmail, AtualizarAcesso } from "./sem-propriedade-acoes";
import { CadastrarMinhaFazenda } from "./cadastrar-minha-fazenda";

// Conta sem vínculo com fazenda. Três casos:
//   - técnico recém-cadastrado: espera o produtor (ou o gestor) liberar pelo e-mail (0023);
//   - produtor que entrou com Google: cadastra a fazenda aqui — é o que libera o WhatsApp pro bot (0047);
//   - produtor que se cadastrou com um WhatsApp que já é de uma fazenda: o banco não criou outra
//     (0046); o gestor liga a conta à fazenda existente.
export async function SemPropriedade() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  const tecnico = user?.user_metadata?.perfil === "tecnico";
  const whatsappJaCadastrado = !!user?.user_metadata?.nome_propriedade;

  return (
    <div className="flex flex-1 items-start justify-center p-4 sm:items-center sm:p-16">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-black/[.08] bg-surface p-6 dark:border-white/[.145]">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            {tecnico || whatsappJaCadastrado ? "Falta liberar seu acesso" : "Sua conta ainda não tem fazenda"}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {whatsappJaCadastrado
              ? "O WhatsApp que você informou já está cadastrado numa fazenda do Gestão Pec, então não criamos outra. O gestor liga esta conta à fazenda que já existe."
              : "A conta foi criada, mas ainda não está ligada a nenhuma fazenda."}
          </p>
        </div>

        {/* produtor (sem o caso do WhatsApp repetido): cadastra a fazenda agora */}
        {!tecnico && !whatsappJaCadastrado && (
          <div className="flex flex-col gap-2">
            <p className="text-base text-black dark:text-zinc-50">
              <strong>É produtor?</strong> Cadastre a sua fazenda. O WhatsApp informado já fica liberado pro bot.
            </p>
            <CadastrarMinhaFazenda />
          </div>
        )}

        <div className={`flex flex-col gap-3 ${!tecnico && !whatsappJaCadastrado ? "border-t border-black/[.08] pt-4 dark:border-white/[.145]" : ""}`}>
          {!tecnico && !whatsappJaCadastrado && (
            <p className="text-base text-black dark:text-zinc-50">
              <strong>É técnico</strong> ou a fazenda já está no Gestão Pec? Peça pra liberar o seu acesso:
            </p>
          )}
          {email && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Seu e-mail de acesso</span>
              <span className="break-all rounded-lg bg-zinc-100 px-3 py-2 font-mono text-base text-black dark:bg-white/[.08] dark:text-zinc-50">
                {email}
              </span>
              <CopiarEmail email={email} />
            </div>
          )}
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base text-black dark:text-zinc-50">
            {whatsappJaCadastrado ? (
              <>
                <li>Mande esse e-mail pro gestor do programa (pode ser pelo WhatsApp).</li>
                <li>Ele liga esta conta à sua fazenda: os dados que você já mandou pro bot aparecem aqui.</li>
              </>
            ) : (
              <>
                <li>Mande esse e-mail pro produtor da fazenda (ou pro gestor do programa).</li>
                <li>
                  O produtor libera no site dele: toca no <strong>nome da fazenda</strong>, no topo da tela →{" "}
                  <strong>Acessos</strong> → <strong>Dar acesso a um técnico</strong>.
                </li>
              </>
            )}
            <li>Depois que liberarem, toque no botão abaixo.</li>
          </ol>
          <AtualizarAcesso />
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-full px-4 py-2.5 text-base font-medium text-red-600 transition-colors hover:bg-red-500/[.06] dark:text-red-400"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
