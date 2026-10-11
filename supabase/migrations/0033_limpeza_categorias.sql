-- Limpeza das categorias do financeiro (resultado de supabase/diagnosticos/dados_antigos.sql em
-- 2026-10-11: 12 lançamentos fora do padrão — "venda_leite", "mao_de_obra", "venda_bezerro" vindos
-- do formato antigo do bot, com sublinhado, além de "insumos" e "Sal mineral").
--
-- 1. _categoria_normalizada passa a trocar "_" por espaço e a juntar sinônimos óbvios com as
--    categorias da lista do site, pra o problema não voltar com o bot.
-- 2. Os lançamentos existentes são regravados com a categoria normalizada.
-- "insumos" e "sal mineral" ficam como estão (só minúsculas) até decidir pra qual categoria vão.

create or replace function _categoria_normalizada(p_categoria text) returns text
language sql
immutable
as $$
  select case c
    when 'venda leite' then 'venda de leite'
    when 'venda bezerro' then 'venda de animal'
    when 'venda bezerra' then 'venda de animal'
    when 'venda vaca' then 'venda de animal'
    when 'venda de vaca' then 'venda de animal'
    when 'venda de bezerro' then 'venda de animal'
    when 'venda de bezerra' then 'venda de animal'
    when 'mao obra' then 'mao de obra'
    when 'energia' then 'energia eletrica'
    when 'luz' then 'energia eletrica'
    when 'remedio' then 'medicacao'
    when 'remedios' then 'medicacao'
    when 'vacina' then 'medicacao'
    when 'vermifugo' then 'medicacao'
    when 'inseminacao' then 'inseminacao artificial'
    when 'semen' then 'inseminacao artificial'
    when 'diesel' then 'combustivel'
    when 'gasolina' then 'combustivel'
    else c
  end
  from (
    select coalesce(nullif(trim(
      regexp_replace(
        translate(lower(coalesce(p_categoria, '')),
          'áàâãäéèêëíìîïóòôõöúùûüç_', 'aaaaaeeeeiiiiooooouuuuc '),
        '\s+', ' ', 'g')),
      ''), 'outros') as c
  ) x;
$$;

-- correção de manutenção: sem o trigger de autoria (0030), senão os lançamentos apareceriam como
-- "alterado pelo WhatsApp" (a migration roda sem usuário logado)
alter table financeiro disable trigger autoria;

update financeiro
set categoria = _categoria_normalizada(categoria)
where categoria is distinct from _categoria_normalizada(categoria);

alter table financeiro enable trigger autoria;
