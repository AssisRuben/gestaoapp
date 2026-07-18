-- financeiro tem propriedade_id direto na tabela (diferente de coberturas/bezerros), e as regras
-- de negócio (regra 8 do CLAUDE.md) são só normalização de texto — sem invariante de múltiplas
-- tabelas —, então não precisa de RPC SECURITY DEFINER aqui: policies normais de RLS bastam,
-- com a normalização de categoria feita na Server Action antes do insert/update.

alter table financeiro enable row level security;

create policy "usuario ve financeiro da propriedade"
  on financeiro for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = financeiro.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario insere financeiro da propriedade"
  on financeiro for insert
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = financeiro.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario atualiza financeiro da propriedade"
  on financeiro for update
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = financeiro.propriedade_id and up.usuario_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = financeiro.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario deleta financeiro da propriedade"
  on financeiro for delete
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = financeiro.propriedade_id and up.usuario_id = auth.uid()
    )
  );
