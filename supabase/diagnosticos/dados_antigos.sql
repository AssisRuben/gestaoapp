-- Diagnóstico de dados antigos (só LEITURA — não altera nada). Rodar inteiro no SQL Editor do
-- Supabase e mandar o resultado (a tabela) pra montar a correção.
--
-- Procura sujeira deixada por bugs antigos do bot e por cadastros sem as validações de hoje:
-- categorias fora do padrão, diagnóstico marcado em várias coberturas de uma vez (bug 5 do
-- CLAUDE.md), números de vaca repetidos, bezerros sem número/sexo, lactações duplicadas, leite
-- lançado em dobro, telefones fora do formato, fazendas sem ninguém.

with
fin as (
  select categoria, count(*) n
  from financeiro
  where categoria is null
     or categoria <> _categoria_normalizada(categoria)
     or _categoria_normalizada(categoria) not in (
       'racao', 'medicacao', 'veterinario', 'combustivel', 'energia eletrica', 'mao de obra',
       'manutencao', 'produtos da ordenha', 'inseminacao artificial', 'custo com pastagem',
       'venda de leite', 'venda de animal', 'outros')
  group by categoria
),
-- cobertura positiva/negativa com outra cobertura MAIS NOVA da mesma vaca com o mesmo diagnóstico
-- e nenhuma das duas virou parto: sinal do UPDATE por vaca_id do bot antigo
cob as (
  select p.nome_propriedade, v.numero_identificacao numero, c.data_cobertura, c.diagnostico_prenhez
  from coberturas c
  join vacas v on v.id = c.vaca_id
  join propriedades p on p.id = v.propriedade_id
  where c.diagnostico_prenhez in ('positivo', 'negativo')
    and not exists (select 1 from partos pa where pa.cobertura_id = c.id)
    and exists (
      select 1 from coberturas c2
      where c2.vaca_id = c.vaca_id and c2.data_cobertura > c.data_cobertura
        and c2.diagnostico_prenhez = c.diagnostico_prenhez
        and not exists (select 1 from partos pa where pa.cobertura_id = c2.id)
    )
),
vaca_dup as (
  select p.nome_propriedade, v.numero_identificacao numero, count(*) n
  from vacas v join propriedades p on p.id = v.propriedade_id
  group by 1, 2 having count(*) > 1
),
bez as (
  select p.nome_propriedade,
         count(*) filter (where b.numero_identificacao is null) sem_numero,
         count(*) filter (where b.sexo is null) sem_sexo
  from bezerros b join propriedades p on p.id = b.propriedade_id
  group by 1
),
lact as (
  select p.nome_propriedade, v.numero_identificacao numero, count(*) n
  from partos pa join vacas v on v.id = pa.vaca_id join propriedades p on p.id = v.propriedade_id
  where pa.ativa
  group by 1, 2 having count(*) > 1
),
status_sem_parto as (
  select p.nome_propriedade, v.numero_identificacao numero
  from vacas v join propriedades p on p.id = v.propriedade_id
  where v.status_produtivo = 'lactacao'
    and not exists (select 1 from partos pa where pa.vaca_id = v.id and pa.ativa)
),
leite_dup as (
  select p.nome_propriedade, v.numero_identificacao numero, c.data_controle, c.litros, count(*) n
  from controle_leite c join vacas v on v.id = c.vaca_id join propriedades p on p.id = v.propriedade_id
  group by 1, 2, 3, 4 having count(*) > 1
),
tel as (
  select telefone from usuarios_whatsapp where telefone <> _telefone_normalizado(telefone)
),
orfas as (
  select p.nome_propriedade from propriedades p
  where not exists (select 1 from usuarios_whatsapp u where u.propriedade_id = p.id)
    and not exists (select 1 from usuarios_propriedades up where up.propriedade_id = p.id)
)
select 1 ordem, 'Financeiro: categoria fora do padrão' problema, coalesce(sum(n), 0) quantidade,
       string_agg(format('"%s" (%s)', coalesce(categoria, 'vazia'), n), ', ' order by n desc) exemplos
from fin
union all
select 2, 'Coberturas: diagnóstico repetido em cobertura antiga (bug do bot)', (select count(*) from cob),
       (select string_agg(format('%s / vaca %s: %s %s', nome_propriedade, numero, to_char(data_cobertura, 'DD/MM/YY'), diagnostico_prenhez), '; ')
        from (select * from cob order by nome_propriedade, numero, data_cobertura limit 15) x)
union all
select 3, 'Vacas: número repetido na mesma fazenda', count(*),
       string_agg(format('%s / vaca %s (%sx)', nome_propriedade, numero, n), '; ')
from vaca_dup
union all
select 4, 'Bezerros: sem número', coalesce(sum(sem_numero), 0),
       string_agg(format('%s: %s', nome_propriedade, sem_numero), '; ') filter (where sem_numero > 0)
from bez
union all
select 5, 'Bezerros: sem sexo informado', coalesce(sum(sem_sexo), 0),
       string_agg(format('%s: %s', nome_propriedade, sem_sexo), '; ') filter (where sem_sexo > 0)
from bez
union all
select 6, 'Vacas com mais de uma lactação ativa', count(*),
       string_agg(format('%s / vaca %s (%s)', nome_propriedade, numero, n), '; ')
from lact
union all
select 7, 'Vacas "em lactação" sem parto registrado', (select count(*) from status_sem_parto),
       (select string_agg(format('%s / vaca %s', nome_propriedade, numero), '; ')
        from (select * from status_sem_parto order by 1, 2 limit 20) x)
union all
select 8, 'Leite: mesmo valor lançado 2x no mesmo dia (possível duplicata)', (select count(*) from leite_dup),
       (select string_agg(format('%s / vaca %s: %s %s L (%sx)', nome_propriedade, numero, to_char(data_controle, 'DD/MM/YY'), litros, n), '; ')
        from (select * from leite_dup order by 1, 2, 3 limit 15) x)
union all
select 9, 'WhatsApp: telefone fora do formato (não normalizado em 0024)', count(*),
       string_agg(telefone, ', ')
from tel
union all
select 10, 'Fazendas sem WhatsApp nem usuário do site', count(*),
       string_agg(nome_propriedade, ', ')
from orfas
order by 1;
