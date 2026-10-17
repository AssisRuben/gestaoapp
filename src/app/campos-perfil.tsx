"use client";

import { useState } from "react";
import {
  RACAS,
  INSEMINACAO,
  MAO_DE_OBRA,
  ORDENHA,
  ORDENHAS_DIA,
  DESTINO_LEITE,
  TANQUE,
  type Opcao,
  type PerfilFazenda,
} from "@/lib/perfil-fazenda";

// Campos do perfil da fazenda (0053). Os nomes "perfil_<campo>" são lidos por perfilDoFormulario.

type Classes = { campo: string; rotulo: string };

function Selecao({
  campo,
  rotulo,
  opcoes,
  inicial,
  classes,
}: {
  campo: string;
  rotulo: string;
  opcoes: readonly Opcao[];
  inicial?: string | number | null;
  classes: Classes;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={classes.rotulo}>{rotulo}</span>
      <select name={`perfil_${campo}`} defaultValue={inicial === null || inicial === undefined ? "" : String(inicial)} className={classes.campo}>
        <option value="">Escolha</option>
        {opcoes.map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
    </label>
  );
}

function Hectares({
  campo,
  rotulo,
  inicial,
  classes,
}: {
  campo: string;
  rotulo: string;
  inicial?: number | null;
  classes: Classes;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={classes.rotulo}>{rotulo}</span>
      <input
        name={`perfil_${campo}`}
        inputMode="decimal"
        placeholder="em hectares"
        defaultValue={inicial === null || inicial === undefined ? "" : String(inicial).replace(".", ",")}
        className={classes.campo}
      />
    </label>
  );
}

// "Tem pasto irrigado?" + quantos hectares (só aparece quando é sim)
function Irrigacao({ perfil, classes }: { perfil?: PerfilFazenda | null; classes: Classes }) {
  const [irrigado, setIrrigado] = useState<boolean | null>(perfil?.irrigado ?? null);
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="perfil_irrigado_presente" value="1" />
      <span className={classes.rotulo}>Tem pasto irrigado?</span>
      <div className="flex gap-2">
        {(
          [
            [true, "Sim"],
            [false, "Não"],
          ] as const
        ).map(([valor, texto]) => (
          <label
            key={texto}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-2 text-base font-medium ${
              irrigado === valor
                ? "border-brand-green bg-brand-green/10 text-black dark:text-zinc-50"
                : "border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400"
            }`}
          >
            <input
              type="radio"
              name="perfil_irrigado"
              value={String(valor)}
              checked={irrigado === valor}
              onChange={() => setIrrigado(valor)}
              className="sr-only"
            />
            {texto}
          </label>
        ))}
      </div>
      {irrigado && <Hectares campo="area_irrigada_ha" rotulo="Quantos hectares irrigados?" inicial={perfil?.area_irrigada_ha} classes={classes} />}
    </div>
  );
}

// As 3 perguntas do cadastro (área usada pro leite, irrigação e raça)
export function CamposPerfilCadastro({ classes }: { classes: Classes }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold text-black dark:text-zinc-50">Sobre a fazenda</h3>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Três perguntas rápidas pros relatórios. Se não souber agora, pode completar depois.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Hectares campo="area_leite_ha" rotulo="Área usada pro leite" classes={classes} />
        <Selecao campo="raca" rotulo="Raça predominante" opcoes={RACAS} classes={classes} />
      </div>
      <Irrigacao classes={classes} />
    </div>
  );
}

// Todas as perguntas (modal da fazenda)
export function CamposPerfilCompleto({ perfil, classes }: { perfil: PerfilFazenda | null; classes: Classes }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Hectares campo="area_total_ha" rotulo="Área total" inicial={perfil?.area_total_ha} classes={classes} />
        <Hectares campo="area_leite_ha" rotulo="Área usada pro leite" inicial={perfil?.area_leite_ha} classes={classes} />
      </div>
      <Irrigacao perfil={perfil} classes={classes} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Selecao campo="raca" rotulo="Raça predominante" opcoes={RACAS} inicial={perfil?.raca} classes={classes} />
        <Selecao campo="inseminacao" rotulo="Usa inseminação?" opcoes={INSEMINACAO} inicial={perfil?.inseminacao} classes={classes} />
        <Selecao campo="mao_de_obra" rotulo="Quem trabalha no leite" opcoes={MAO_DE_OBRA} inicial={perfil?.mao_de_obra} classes={classes} />
        <label className="flex min-w-0 flex-col gap-1">
          <span className={classes.rotulo}>Quantas pessoas</span>
          <input
            name="perfil_pessoas"
            inputMode="numeric"
            placeholder="no trabalho do leite"
            defaultValue={perfil?.pessoas ?? ""}
            className={classes.campo}
          />
        </label>
        <Selecao campo="ordenha" rotulo="Ordenha" opcoes={ORDENHA} inicial={perfil?.ordenha} classes={classes} />
        <Selecao campo="ordenhas_dia" rotulo="Ordenhas por dia" opcoes={ORDENHAS_DIA} inicial={perfil?.ordenhas_dia} classes={classes} />
        <Selecao campo="destino_leite" rotulo="Pra quem vende o leite" opcoes={DESTINO_LEITE} inicial={perfil?.destino_leite} classes={classes} />
        <Selecao campo="tanque" rotulo="Tanque de resfriamento" opcoes={TANQUE} inicial={perfil?.tanque} classes={classes} />
      </div>
    </div>
  );
}
