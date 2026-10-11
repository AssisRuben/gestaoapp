"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { salvarAdesao, excluirAdesao, sugerirLinhaBase } from "./actions";
import { EmptyCard } from "../../(app)/mobile-list";
import { formatarDataBR } from "../../(app)/format";
import {
  CAMPOS_INDICADORES,
  type Adesao,
  type IndicadoresAtuais,
  type Indicadores,
} from "@/lib/programa";
import {
  CAMPO_CLASSES,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  Modal,
  Campo,
  BotaoExcluir,
} from "./ui";
import { hojeBrasil } from "@/lib/datas";

type Propriedade = { id: string; nome_propriedade: string };
type Tipo = (typeof CAMPOS_INDICADORES)[number]["tipo"];

function formatar(valor: number | null, tipo: Tipo) {
  if (valor === null || valor === undefined) return "—";
  if (tipo === "moeda") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  }
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: tipo === "inteiro" ? 0 : 2 });
}

function Variacao({
  base,
  atual,
  maiorMelhor,
}: {
  base: number | null;
  atual: number | null;
  maiorMelhor: boolean;
}) {
  if (base === null || atual === null || base === 0) {
    return <span className="text-zinc-500">—</span>;
  }
  const pct = ((atual - base) / base) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-zinc-600 dark:text-zinc-400">0%</span>;
  const melhorou = pct > 0 === maiorMelhor;
  return (
    <span
      className={`font-medium ${melhorou ? "text-brand-green" : "text-red-600 dark:text-red-400"}`}
    >
      {pct > 0 ? "+" : ""}
      {pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

export function AdesaoSecao({
  propriedades,
  adesoes,
  atuais,
  onSucesso,
}: {
  propriedades: Propriedade[];
  adesoes: Adesao[];
  atuais: IndicadoresAtuais[];
  onSucesso: (mensagem: string) => void;
}) {
  // null = fechado; objeto vazio = nova adesão; objeto com propriedade_id = edição
  const [aberta, setAberta] = useState<Partial<Adesao> | null>(null);

  const nomePorId = new Map(propriedades.map((p) => [p.id, p.nome_propriedade]));
  const atualPorId = new Map(atuais.map((a) => [a.propriedade_id, a]));
  const semAdesao = propriedades.filter((p) => !adesoes.some((a) => a.propriedade_id === p.id));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Adesão e linha de base
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Situação de cada fazenda ao entrar no programa, comparada com hoje.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberta({})}
          disabled={semAdesao.length === 0}
          className={`shrink-0 ${BOTAO_PRIMARIO}`}
        >
          + Registrar adesão
        </button>
      </div>

      {adesoes.length === 0 && <EmptyCard>Nenhuma fazenda registrada no programa ainda.</EmptyCard>}

      <div className="grid gap-3 lg:grid-cols-2">
        {adesoes.map((adesao) => {
          const atual = atualPorId.get(adesao.propriedade_id);
          return (
            <article
              key={adesao.propriedade_id}
              className="flex flex-col gap-2 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-black dark:text-zinc-50">
                    {nomePorId.get(adesao.propriedade_id) ?? "—"}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Aderiu em {formatarDataBR(adesao.data_adesao)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAberta(adesao)}
                  className="text-sm font-medium text-brand-green hover:underline"
                >
                  Editar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                      <th className="py-1.5 pr-3 font-medium">Indicador</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Linha de base</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Hoje</th>
                      <th className="py-1.5 text-right font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPOS_INDICADORES.map(({ campo, rotulo, tipo, maiorMelhor }) => {
                      const base = adesao[campo];
                      const hojeValor = atual?.[campo] ?? null;
                      return (
                        <tr
                          key={campo}
                          className="border-b border-black/[.04] last:border-0 dark:border-white/[.06]"
                        >
                          <td className="py-1.5 pr-3 text-black dark:text-zinc-50">{rotulo}</td>
                          <td className="py-1.5 pr-3 text-right text-zinc-600 dark:text-zinc-400">
                            {formatar(base, tipo)}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-black dark:text-zinc-50">
                            {formatar(hojeValor, tipo)}
                          </td>
                          <td className="py-1.5 text-right">
                            <Variacao base={base} atual={hojeValor} maiorMelhor={maiorMelhor} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {adesao.observacao && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{adesao.observacao}</p>
              )}
            </article>
          );
        })}
      </div>

      {aberta && (
        <AdesaoModal
          adesao={aberta}
          opcoes={aberta.propriedade_id ? propriedades : semAdesao}
          onFechar={() => setAberta(null)}
          onSucesso={(msg) => {
            setAberta(null);
            onSucesso(msg);
          }}
        />
      )}
    </section>
  );
}

function AdesaoModal({
  adesao,
  opcoes,
  onFechar,
  onSucesso,
}: {
  adesao: Partial<Adesao>;
  opcoes: Propriedade[];
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [salvarState, salvarAction, salvando] = useActionState(salvarAdesao, undefined);
  const [excluirState, excluirAction, excluindo] = useActionState(excluirAdesao, undefined);
  const [calculando, iniciarCalculo] = useTransition();
  const edicao = !!adesao.propriedade_id;

  const [propriedadeId, setPropriedadeId] = useState(adesao.propriedade_id ?? "");
  const [dataAdesao, setDataAdesao] = useState(adesao.data_adesao ?? hojeBrasil());
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CAMPOS_INDICADORES.map(({ campo }) => [campo, adesao[campo]?.toString() ?? ""]),
    ),
  );
  const [avisoCalculo, setAvisoCalculo] = useState<string | null>(null);

  useEffect(() => {
    if (salvarState?.success) {
      queueMicrotask(() => onSucesso(edicao ? "Linha de base atualizada!" : "Adesão registrada!"));
    }
  }, [salvarState, onSucesso, edicao]);

  useEffect(() => {
    if (excluirState?.success) queueMicrotask(() => onSucesso("Adesão excluída!"));
  }, [excluirState, onSucesso]);

  function preencherComSistema() {
    setAvisoCalculo(null);
    iniciarCalculo(async () => {
      const resultado = await sugerirLinhaBase(propriedadeId, dataAdesao);
      if (resultado.error || !resultado.valores) {
        setAvisoCalculo(resultado.error ?? "Não foi possível calcular.");
        return;
      }
      const sugeridos = resultado.valores as Partial<Indicadores>;
      setValores(
        Object.fromEntries(
          CAMPOS_INDICADORES.map(({ campo }) => [campo, sugeridos[campo]?.toString() ?? ""]),
        ),
      );
      const semDados = CAMPOS_INDICADORES.filter(({ campo }) => sugeridos[campo] == null);
      setAvisoCalculo(
        semDados.length > 0
          ? `Sem dados no sistema para: ${semDados.map((c) => c.rotulo).join(", ")}. Preencha com o diagnóstico da visita.`
          : "Valores preenchidos com os dados do sistema. Confira antes de salvar.",
      );
    });
  }

  const erro = salvarState?.error ?? excluirState?.error;

  return (
    <Modal onFechar={onFechar}>
      <form action={salvarAction} className="flex flex-col gap-4">
        {edicao && <input type="hidden" name="propriedade_id" value={propriedadeId} />}
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          {edicao ? "Editar linha de base" : "Registrar adesão"}
        </h2>

        <Campo id="propriedade_id" label="Fazenda">
          <select
            id="propriedade_id"
            name={edicao ? undefined : "propriedade_id"}
            required
            disabled={edicao}
            value={propriedadeId}
            onChange={(e) => setPropriedadeId(e.target.value)}
            className={CAMPO_CLASSES}
          >
            <option value="" disabled>
              Selecione
            </option>
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome_propriedade}
              </option>
            ))}
          </select>
        </Campo>

        <Campo id="data_adesao" label="Data de adesão">
          <input
            id="data_adesao"
            name="data_adesao"
            type="date"
            required
            value={dataAdesao}
            onChange={(e) => setDataAdesao(e.target.value)}
            className={CAMPO_CLASSES}
          />
        </Campo>

        <div className="flex flex-col gap-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/[.04]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Leite: média dos 30 dias até a data. Financeiro: média mensal dos 12 meses até a data.
            Rebanho: situação atual das vacas.
          </p>
          <button
            type="button"
            onClick={preencherComSistema}
            disabled={!propriedadeId || !dataAdesao || calculando}
            className={BOTAO_SECUNDARIO}
          >
            {calculando ? "Calculando..." : "Preencher com dados do sistema"}
          </button>
          {avisoCalculo && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{avisoCalculo}</p>
          )}
        </div>

        {CAMPOS_INDICADORES.map(({ campo, rotulo, tipo }) => (
          <Campo key={campo} id={campo} label={tipo === "moeda" ? `${rotulo} (R$)` : rotulo}>
            <input
              id={campo}
              name={campo}
              inputMode={tipo === "inteiro" ? "numeric" : "decimal"}
              value={valores[campo]}
              onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              className={CAMPO_CLASSES}
            />
          </Campo>
        ))}

        <Campo id="observacao" label="Observação (opcional)">
          <input
            id="observacao"
            name="observacao"
            defaultValue={adesao.observacao ?? ""}
            placeholder="Ex.: dados do diagnóstico da visita de adesão"
            className={CAMPO_CLASSES}
          />
        </Campo>

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex items-center justify-between gap-2">
          {edicao ? <BotaoExcluir acao={excluirAction} excluindo={excluindo} /> : <span />}
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
