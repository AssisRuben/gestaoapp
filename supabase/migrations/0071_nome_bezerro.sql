-- Bezerro com nome ("Malu" é a bezerra 11 da Graúna — Fazenda Sousa, 26/11/2026).
--
-- O produtor dá nome à cria antes de ela virar vaca. Até aqui só vacas tinham nome.
--   - bezerros.nome (opcional). Escrita pelo site em definir_nome_bezerro (mesmo padrão de
--     definir_nome_vaca, 0045: chamada depois de cadastrar/atualizar o bezerro).
--   - Quando a bezerra vira vaca (promover_bezerro, cadastrar_vaca ligando pela mãe, importação),
--     a vaca nova fica com o nome dela — trigger na ligação bezerro → vaca, vale pra todos os
--     caminhos. Só se a vaca ainda não tem nome e nenhuma outra vaca da fazenda usa esse nome (o bot
--     acha vaca pelo nome; dois iguais travam).
--   - O bot continua achando só VACA pelo nome; bezerro, pelo número.

alter table bezerros add column if not exists nome text;

create or replace function definir_nome_bezerro(p_bezerro_id uuid, p_nome text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
begin
  if not exists (
    select 1 from bezerros b join usuarios_propriedades up on up.propriedade_id = b.propriedade_id
    where b.id = p_bezerro_id and up.usuario_id = auth.uid()
  ) then
    raise exception 'sem acesso a este bezerro';
  end if;
  update bezerros set nome = v_nome where id = p_bezerro_id and nome is distinct from v_nome;
end;
$$;

revoke execute on function definir_nome_bezerro(uuid, text) from public, anon;
grant execute on function definir_nome_bezerro(uuid, text) to authenticated;

-- Bezerra virou vaca: a vaca leva o nome
create or replace function _bezerro_passa_nome_para_vaca() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vaca_id_gerada is not null
     and new.vaca_id_gerada is distinct from old.vaca_id_gerada
     and nullif(trim(coalesce(new.nome, '')), '') is not null then
    update vacas v set nome = trim(new.nome)
    where v.id = new.vaca_id_gerada
      and nullif(trim(coalesce(v.nome, '')), '') is null
      and not exists (
        select 1 from vacas o
        where o.propriedade_id = v.propriedade_id and o.id <> v.id
          and _nome_chave(o.nome) = _nome_chave(new.nome)
      );
  end if;
  return new;
end;
$$;

revoke execute on function _bezerro_passa_nome_para_vaca() from public, anon, authenticated;

drop trigger if exists bezerros_passa_nome_para_vaca on bezerros;
create trigger bezerros_passa_nome_para_vaca
  after update of vaca_id_gerada on bezerros
  for each row execute function _bezerro_passa_nome_para_vaca();
