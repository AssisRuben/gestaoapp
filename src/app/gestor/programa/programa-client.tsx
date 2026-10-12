"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { salvarTouro, excluirTouro, salvarEntrega, excluirEntrega } from "./actions";
import { MobileCard, CardHeader, CardRow, EmptyCard } from "../../(app)/mobile-list";
import { useSuccessToast, SuccessToast } from "../../(app)/toast";
import { formatarDataBR } from "../../(app)/format";
import {
  rotuloTouro,
  type Touro,
  type EntregaDoses,
  type SaldoDoses,
  type Adesao,
  type IndicadoresAtuais,
  type BaixaDoses,
  type IndicadoresReprodutivos,
  MOTIVOS_BAIXA,
} from "@/lib/programa";
import { AdesaoSecao } from "./adesao";
import { ResultadosReprodutivos } from "./resultados";
import {
  CAMPO_CLASSES,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  Modal,
  Campo,
  BotaoExcluir,
} from "./ui";
import { hojeBrasil } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/telefone";
import { mascaraCnpj } from "@/lib/cnpj";

type Propriedade = { id: string; nome_propriedade: string };

function Indicador({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{rotulo}</span>
      <span className="text-2xl font-bold text-black dark:text-zinc-50">{valor}</span>
    </div>
  );
}

export function ProgramaClient({
  propriedades,
  touros,
  entregas,
  saldos,
  adesoes,
  atuais,
  baixas,
  reprodutivos,
}: {
  propriedades: Propriedade[];
  touros: Touro[];
  entregas: EntregaDoses[];
  saldos: SaldoDoses[];
  adesoes: Adesao[];
  atuais: IndicadoresAtuais[];
  baixas: BaixaDoses[];
  reprodutivos: IndicadoresReprodutivos[];
}) {
  const { mensagemToast, mostrarToast } = useSuccessToast();
  // null = fechado; objeto vazio = novo; objeto com id = edição
  const [touroAberto, setTouroAberto] = useState<Partial<Touro> | null>(null);
  const [entregaAberta, setEntregaAberta] = useState<Partial<EntregaDoses> | null>(null);

  const totais = useMemo(() => {
    const t = { recebidas: 0, aReceber: 0, utilizadas: 0, baixas: 0, saldo: 0 };
    for (const s of saldos) {
      t.recebidas += s.recebidas;
      t.aReceber += s.a_receber;
      t.utilizadas += s.utilizadas;
      t.baixas += s.baixas;
      t.saldo += s.saldo;
    }
    return t;
  }, [saldos]);

  const porFazenda = useMemo(() => {
    type Totais = { recebidas: number; aReceber: number; utilizadas: number; baixas: number; saldo: number };
    const mapa = new Map<string, Totais>();
    for (const s of saldos) {
      const atual = mapa.get(s.propriedade_id) ?? { recebidas: 0, aReceber: 0, utilizadas: 0, baixas: 0, saldo: 0 };
      atual.recebidas += s.recebidas;
      atual.aReceber += s.a_receber;
      atual.utilizadas += s.utilizadas;
      atual.baixas += s.baixas;
      atual.saldo += s.saldo;
      mapa.set(s.propriedade_id, atual);
    }
    return propriedades
      .filter((p) => mapa.has(p.id))
      .map((p) => ({ ...p, ...mapa.get(p.id)! }));
  }, [saldos, propriedades]);

  const usoPercentual =
    totais.recebidas > 0 ? `${Math.round((totais.utilizadas / totais.recebidas) * 100)}%` : "—";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <SuccessToast mensagem={mensagemToast} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">
          Programa de sêmen
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Adesão das fazendas, linha de base, doses entregues, uso nas inseminações e resultados.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Indicador rotulo="Fazendas atendidas" valor={porFazenda.length} />
        <Indicador rotulo="Doses recebidas" valor={totais.recebidas} />
        <Indicador rotulo="Aguardando confirmação" valor={totais.aReceber} />
        <Indicador rotulo="Doses usadas" valor={totais.utilizadas} />
        <Indicador rotulo="Doses perdidas" valor={totais.baixas} />
        <Indicador rotulo="Uso das recebidas" valor={usoPercentual} />
      </div>

      <AdesaoSecao
        propriedades={propriedades}
        adesoes={adesoes}
        atuais={atuais}
        onSucesso={mostrarToast}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Doses por fazenda</h2>
        {porFazenda.length === 0 ? (
          <EmptyCard>Nenhuma fazenda recebeu doses ainda.</EmptyCard>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                  <th className="px-4 py-2 font-medium">Fazenda</th>
                  <th className="px-4 py-2 text-right font-medium">Recebidas</th>
                  <th className="px-4 py-2 text-right font-medium">A confirmar</th>
                  <th className="px-4 py-2 text-right font-medium">Usadas</th>
                  <th className="px-4 py-2 text-right font-medium">Perdidas</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {porFazenda.map((f, i) => (
                  <tr key={f.id} className={i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""}>
                    <td className="px-4 py-2 text-black dark:text-zinc-50">{f.nome_propriedade}</td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">{f.recebidas}</td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">{f.aReceber}</td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">{f.utilizadas}</td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">{f.baixas}</td>
                    <td className="px-4 py-2 text-right font-semibold text-black dark:text-zinc-50">{f.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {baixas.length > 0 && (
          <details className="text-base">
            <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Perdas registradas pelas fazendas ({baixas.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {baixas.map((b) => (
                <li key={b.id} className="text-black dark:text-zinc-50">
                  {formatarDataBR(b.data_baixa)} · {b.propriedade?.nome_propriedade ?? "—"} ·{" "}
                  {b.quantidade} {b.quantidade === 1 ? "dose" : "doses"} de {rotuloTouro(b.touro)} ·{" "}
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {MOTIVOS_BAIXA[b.motivo]}
                    {b.observacao ? ` — ${b.observacao}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <ResultadosReprodutivos propriedades={propriedades} indicadores={reprodutivos} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Entregas de doses</h2>
          <button
            type="button"
            onClick={() => setEntregaAberta({})}
            disabled={touros.length === 0}
            title={touros.length === 0 ? "Cadastre um touro primeiro" : undefined}
            className={BOTAO_PRIMARIO}
          >
            + Nova entrega
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {entregas.map((e) => (
            <MobileCard key={e.id} onClick={e.recebido_em ? undefined : () => setEntregaAberta(e)}>
              <CardHeader
                title={e.propriedade?.nome_propriedade ?? "—"}
                accentClassName="bg-reproducao"
                badge={
                  e.recebido_em ? (
                    <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-sm font-medium text-brand-green">
                      Recebida
                    </span>
                  ) : (
                    <span className="rounded-full bg-financeiro-tint px-2 py-0.5 text-sm font-medium text-financeiro-ink">
                      Aguardando
                    </span>
                  )
                }
              />
              {e.entidade && (
                <CardRow
                  label="Entidade"
                  value={[e.entidade.nome, e.entidade.responsavel].filter(Boolean).join(" · ")}
                />
              )}
              <CardRow label="Touro" value={rotuloTouro(e.touro)} />
              <CardRow label="Doses" value={e.kits ? `${e.quantidade} (${e.kits} ${e.kits === 1 ? "kit" : "kits"})` : e.quantidade} />
              <CardRow label="Enviada em" value={formatarDataBR(e.data_entrega)} />
              {e.recebido_em && (
                <CardRow label="Recebida em" value={formatarDataBR(e.recebido_em.slice(0, 10))} />
              )}
            </MobileCard>
          ))}
        </div>
        {entregas.length === 0 && <EmptyCard>Nenhuma entrega registrada ainda.</EmptyCard>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Catálogo de touros</h2>
          <button type="button" onClick={() => setTouroAberto({})} className={BOTAO_PRIMARIO}>
            + Novo touro
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {touros.map((t) => (
            <MobileCard key={t.id} onClick={() => setTouroAberto(t)}>
              <CardHeader
                title={rotuloTouro(t)}
                accentClassName="bg-reproducao"
                badge={
                  !t.ativo && (
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Inativo
                    </span>
                  )
                }
              />
              <CardRow label="Raça" value={t.raca ?? "—"} />
              <CardRow label="Central" value={t.central ?? "—"} />
              <CardRow
                label="PTA leite (kg)"
                value={t.pta_leite === null ? "—" : t.pta_leite.toLocaleString("pt-BR")}
              />
            </MobileCard>
          ))}
        </div>
        {touros.length === 0 && <EmptyCard>Nenhum touro cadastrado ainda.</EmptyCard>}
      </section>

      {touroAberto && (
        <TouroModal
          touro={touroAberto}
          onFechar={() => setTouroAberto(null)}
          onSucesso={(msg) => {
            setTouroAberto(null);
            mostrarToast(msg);
          }}
        />
      )}

      {entregaAberta && (
        <EntregaModal
          entrega={entregaAberta}
          propriedades={propriedades}
          touros={touros}
          entidades={entidadesConhecidas(entregas)}
          onFechar={() => setEntregaAberta(null)}
          onSucesso={(msg) => {
            setEntregaAberta(null);
            mostrarToast(msg);
          }}
        />
      )}
    </div>
  );
}

function TouroModal({
  touro,
  onFechar,
  onSucesso,
}: {
  touro: Partial<Touro>;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [salvarState, salvarAction, salvando] = useActionState(salvarTouro, undefined);
  const [excluirState, excluirAction, excluindo] = useActionState(excluirTouro, undefined);
  const edicao = !!touro.id;

  useEffect(() => {
    if (salvarState?.success) queueMicrotask(() => onSucesso(edicao ? "Touro atualizado!" : "Touro cadastrado!"));
  }, [salvarState, onSucesso, edicao]);

  useEffect(() => {
    if (excluirState?.success) queueMicrotask(() => onSucesso("Touro excluído!"));
  }, [excluirState, onSucesso]);

  const erro = salvarState?.error ?? excluirState?.error;

  return (
    <Modal onFechar={onFechar}>
      <form action={salvarAction} className="flex flex-col gap-4">
        {edicao && <input type="hidden" name="touro_id" value={touro.id} />}
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          {edicao ? "Editar touro" : "Novo touro"}
        </h2>

        <Campo id="nome" label="Nome">
          <input id="nome" name="nome" required defaultValue={touro.nome ?? ""} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="codigo" label="Código na central (opcional)">
          <input id="codigo" name="codigo" defaultValue={touro.codigo ?? ""} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="raca" label="Raça (opcional)">
          <input id="raca" name="raca" defaultValue={touro.raca ?? ""} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="central" label="Central / fornecedor (opcional)">
          <input id="central" name="central" defaultValue={touro.central ?? ""} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="pta_leite" label="PTA leite em kg (opcional)">
          <input
            id="pta_leite"
            name="pta_leite"
            inputMode="decimal"
            defaultValue={touro.pta_leite ?? ""}
            className={CAMPO_CLASSES}
          />
        </Campo>

        {edicao && (
          <label className="flex items-center gap-3 text-base text-black dark:text-zinc-50">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={touro.ativo}
              className="h-5 w-5 accent-brand-green"
            />
            Ativo (aparece na lista das fazendas)
          </label>
        )}

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex items-center justify-between gap-2">
          {edicao ? (
            <BotaoExcluir acao={excluirAction} excluindo={excluindo} />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

type EntidadeOpcao = { nome: string; cnpj?: string | null; responsavel: string | null; telefone: string | null };

// Entidades já usadas em entregas (pra sugerir e preencher responsável/telefone ao escolher).
function entidadesConhecidas(entregas: EntregaDoses[]): EntidadeOpcao[] {
  const mapa = new Map<string, EntidadeOpcao>();
  for (const e of entregas) if (e.entidade) mapa.set(e.entidade.nome.trim().toLowerCase(), e.entidade);
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// Entidade beneficiada (associação, cooperativa…) por onde a fazenda recebe — 0048. Digitar um
// nome já usado preenche responsável e telefone.
function CamposEntidade({ entidades, inicial }: { entidades: EntidadeOpcao[]; inicial: EntidadeOpcao | null }) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [responsavel, setResponsavel] = useState(inicial?.responsavel ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [cnpj, setCnpj] = useState(inicial?.cnpj ? mascaraCnpj(inicial.cnpj) : "");

  function escolher(valor: string) {
    setNome(valor);
    const conhecida = entidades.find((e) => e.nome.trim().toLowerCase() === valor.trim().toLowerCase());
    if (conhecida) {
      setResponsavel(conhecida.responsavel ?? "");
      setTelefone(conhecida.telefone ?? "");
      setCnpj(conhecida.cnpj ? mascaraCnpj(conhecida.cnpj) : "");
    }
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <legend className="px-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">Entidade beneficiada</legend>
      <Campo id="entidade_nome" label="Nome da entidade">
        <input
          id="entidade_nome"
          name="entidade_nome"
          required
          list="entidades_conhecidas"
          placeholder="ex.: Associação dos Produtores do Riacho"
          value={nome}
          onChange={(e) => escolher(e.target.value)}
          className={CAMPO_CLASSES}
        />
        <datalist id="entidades_conhecidas">
          {entidades.map((e) => (
            <option key={e.nome} value={e.nome} />
          ))}
        </datalist>
      </Campo>
      <Campo id="entidade_cnpj" label="CNPJ">
        <input
          id="entidade_cnpj"
          name="entidade_cnpj"
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          value={cnpj}
          onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
          className={CAMPO_CLASSES}
        />
      </Campo>
      <Campo id="entidade_responsavel" label="Responsável">
        <input
          id="entidade_responsavel"
          name="entidade_responsavel"
          required
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          className={CAMPO_CLASSES}
        />
      </Campo>
      <Campo id="entidade_telefone" label="Telefone do responsável">
        <input
          id="entidade_telefone"
          name="entidade_telefone"
          type="tel"
          inputMode="tel"
          required
          placeholder="(85) 99999-9999"
          value={telefone}
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
          className={CAMPO_CLASSES}
        />
      </Campo>
    </fieldset>
  );
}

function EntregaModal({
  entrega,
  propriedades,
  touros,
  entidades,
  onFechar,
  onSucesso,
}: {
  entrega: Partial<EntregaDoses>;
  entidades: EntidadeOpcao[];
  propriedades: Propriedade[];
  touros: Touro[];
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [salvarState, salvarAction, salvando] = useActionState(salvarEntrega, undefined);
  const [excluirState, excluirAction, excluindo] = useActionState(excluirEntrega, undefined);
  const edicao = !!entrega.id;

  useEffect(() => {
    if (salvarState?.success) queueMicrotask(() => onSucesso(edicao ? "Entrega atualizada!" : "Entrega registrada!"));
  }, [salvarState, onSucesso, edicao]);

  useEffect(() => {
    if (excluirState?.success) queueMicrotask(() => onSucesso("Entrega excluída!"));
  }, [excluirState, onSucesso]);

  const erro = salvarState?.error ?? excluirState?.error;
  const tourosOpcoes = touros.filter((t) => t.ativo || t.id === entrega.touro_id);

  return (
    <Modal onFechar={onFechar}>
      <form action={salvarAction} className="flex flex-col gap-4">
        {edicao && <input type="hidden" name="entrega_id" value={entrega.id} />}
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          {edicao ? "Editar entrega" : "Nova entrega de doses"}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          As doses só entram no saldo da fazenda depois que ela confirmar o recebimento. Até lá, a
          entrega pode ser corrigida ou excluída.
        </p>

        <CamposEntidade entidades={entidades} inicial={entrega.entidade ?? null} />

        <Campo id="propriedade_id" label="Fazenda que recebe">
          <select
            id="propriedade_id"
            name="propriedade_id"
            required
            defaultValue={entrega.propriedade_id ?? ""}
            className={CAMPO_CLASSES}
          >
            <option value="" disabled>
              Selecione
            </option>
            {propriedades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome_propriedade}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="touro_id" label="Touro">
          <select
            id="touro_id"
            name="touro_id"
            required
            defaultValue={entrega.touro_id ?? ""}
            className={CAMPO_CLASSES}
          >
            <option value="" disabled>
              Selecione
            </option>
            {tourosOpcoes.map((t) => (
              <option key={t.id} value={t.id}>
                {rotuloTouro(t)}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="quantidade" label="Quantidade de doses">
          <input
            id="quantidade"
            name="quantidade"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={entrega.quantidade ?? ""}
            className={CAMPO_CLASSES}
          />
        </Campo>

        <Campo id="kits" label="Quantidade de kits">
          <input
            id="kits"
            name="kits"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={entrega.kits ?? ""}
            className={CAMPO_CLASSES}
          />
        </Campo>

        <Campo id="data_entrega" label="Data da entrega">
          <input
            id="data_entrega"
            name="data_entrega"
            type="date"
            required
            defaultValue={entrega.data_entrega ?? hojeBrasil()}
            className={CAMPO_CLASSES}
          />
        </Campo>

        <Campo id="observacao" label="Observação (opcional)">
          <input
            id="observacao"
            name="observacao"
            defaultValue={entrega.observacao ?? ""}
            className={CAMPO_CLASSES}
          />
        </Campo>

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex items-center justify-between gap-2">
          {edicao ? (
            <BotaoExcluir acao={excluirAction} excluindo={excluindo} />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
