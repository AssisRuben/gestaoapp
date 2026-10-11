-- "Virou vaca" na tela de Bezerros: cadastra a bezerra como vaca (novilha) ligando os dois
-- registros diretamente. cadastrar_vaca acha o bezerro pela mãe + número (e, sem número, pega o
-- mais recente sem vínculo da mãe); aqui o bezerro já é conhecido, então não há adivinhação.
-- O número continua o mesmo (espaço compartilhado vacas/bezerros, ver 0005); bezerro sem número
-- ganha o próximo livre.

create or replace function promover_bezerro(p_bezerro_id uuid) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bezerro bezerros;
  v_numero integer;
  v_vaca vacas;
begin
  select * into v_bezerro from bezerros where id = p_bezerro_id;
  if v_bezerro.id is null then
    raise exception 'bezerro não encontrado';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_bezerro.propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if v_bezerro.vaca_id_gerada is not null then
    raise exception 'esse animal já foi cadastrado como vaca';
  end if;

  if v_bezerro.sexo in ('macho', 'natimorto') then
    raise exception 'só bezerras viram vaca no cadastro';
  end if;

  v_numero := v_bezerro.numero_identificacao;
  if v_numero is null then
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = v_bezerro.propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = v_bezerro.propriedade_id)
    ), 0) + 1 into v_numero;
  elsif exists (
    select 1 from vacas where propriedade_id = v_bezerro.propriedade_id and numero_identificacao = v_numero
  ) then
    raise exception 'já existe uma vaca com o número % — mude o número do bezerro antes', v_numero;
  end if;

  insert into vacas (propriedade_id, mae_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (v_bezerro.propriedade_id, v_bezerro.mae_id, v_numero, 'novilha', 'vazia')
  returning * into v_vaca;

  update bezerros set vaca_id_gerada = v_vaca.id, numero_identificacao = v_numero
  where id = p_bezerro_id;

  return v_vaca;
end;
$$;

revoke execute on function promover_bezerro(uuid) from public, anon;
grant execute on function promover_bezerro(uuid) to authenticated;
