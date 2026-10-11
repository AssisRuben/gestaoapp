-- Destino das duas categorias que a 0033 deixou em aberto (decisão de 2026-10-11):
--   "sal mineral" → ração (alimentação/suplementação)
--   "insumos"     → custo com pastagem (eram compras de adubo)
-- e os sinônimos passam a valer daqui pra frente (bot e site gravam já na categoria certa).

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
    when 'sal mineral' then 'racao'
    when 'sal' then 'racao'
    when 'suplemento mineral' then 'racao'
    when 'insumos' then 'custo com pastagem'
    when 'insumo' then 'custo com pastagem'
    when 'adubo' then 'custo com pastagem'
    when 'adubos' then 'custo com pastagem'
    when 'adubacao' then 'custo com pastagem'
    when 'fertilizante' then 'custo com pastagem'
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

-- correção de manutenção, sem marcar os lançamentos como editados (ver 0033)
alter table financeiro disable trigger autoria;

update financeiro
set categoria = _categoria_normalizada(categoria)
where categoria is distinct from _categoria_normalizada(categoria);

alter table financeiro enable trigger autoria;
