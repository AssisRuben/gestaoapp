import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";
import { CopiarEmail, AtualizarAcesso } from "./sem-propriedade-acoes";

// Conta sem vínculo com fazenda — quase sempre técnico recém-cadastrado esperando o produtor (ou o
// gestor) liberar o acesso pelo e-mail (0023_acesso_tecnicos.sql).
export async function SemPropriedade() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  // produtor que se cadastrou com o WhatsApp de uma fazenda que já existe: o banco não criou outra
  // (0046) e a conta espera o gestor ligar
  const produtor = user?.user_metadata?.perfil === "produtor" || !!user?.user_metadata?.nome_propriedade;

  return (
    <div className="flex flex-1 items-start justify-center p-4 sm:items-center sm:p-16">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-black/[.08] bg-surface p-6 dark:border-white/[.145]">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Falta liberar seu acesso</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Sua conta foi criada, mas ainda não está ligada a nenhuma fazenda.
          </p>
        </div>

        {email && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Seu e-mail de acesso</span>
            <span className="break-all rounded-lg bg-zinc-100 px-3 py-2 font-mono text-base text-black dark:bg-white/[.08] dark:text-zinc-50">
              {email}
            </span>
            <CopiarEmail email={email} />
          </div>
        )}

        {produtor ? (
          <>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Se o seu WhatsApp já está cadastrado numa fazenda do Gestão Pec, não criamos outra: o gestor liga
            esta conta à fazenda que já existe.
          </p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base text-black dark:text-zinc-50">
            <li>Mande esse e-mail pro gestor do programa (pode ser pelo WhatsApp).</li>
            <li>Ele liga esta conta à sua fazenda — os dados que você já mandou pro bot aparecem aqui.</li>
            <li>Depois que ele avisar, toque no botão abaixo.</li>
          </ol>
          </>
        ) : (
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base text-black dark:text-zinc-50">
            <li>Mande esse e-mail pro produtor da fazenda (ou pro gestor do programa).</li>
            <li>
              O produtor libera no site dele: toca no <strong>nome da fazenda</strong>, no topo da tela →{" "}
              <strong>Acessos</strong> → <strong>Dar acesso a um técnico</strong>.
            </li>
            <li>Depois que liberarem, toque no botão abaixo.</li>
          </ol>
        )}

        <div className="flex flex-col gap-2">
          <AtualizarAcesso />
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-full px-4 py-2.5 text-base font-medium text-red-600 transition-colors hover:bg-red-500/[.06] dark:text-red-400"
            >
              Sair
            </button>
          </form>
        </div>

        {!produtor && (
          <p className="border-t border-black/[.08] pt-4 text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
            É produtor e queria cadastrar a sua fazenda? Saia e crie uma conta nova na tela de login, em{" "}
            <strong>Cadastre-se → Sou produtor</strong>, com outro e-mail.
          </p>
        )}
      </div>
    </div>
  );
}
