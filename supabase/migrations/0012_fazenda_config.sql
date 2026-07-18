-- Aba "Fazenda": edição de dados gerais da propriedade + gestão de usuários do WhatsApp
-- (usuarios_whatsapp) + patrimônio. Nenhuma dessas edições tem invariante de negócio
-- complexo (sem numeração compartilhada, sem cascata) — RLS direto basta, mesmo padrão
-- do financeiro, sem precisar de função SECURITY DEFINER.

-- propriedades já tinha SELECT (migration 0001); falta permitir UPDATE.
create policy "usuario atualiza propriedade vinculada"
  on propriedades for update
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = propriedades.id and up.usuario_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = propriedades.id and up.usuario_id = auth.uid()
    )
  );

alter table usuarios_whatsapp enable row level security;

create policy "usuario ve usuarios_whatsapp da propriedade"
  on usuarios_whatsapp for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = usuarios_whatsapp.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario insere usuarios_whatsapp da propriedade"
  on usuarios_whatsapp for insert
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = usuarios_whatsapp.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario atualiza usuarios_whatsapp da propriedade"
  on usuarios_whatsapp for update
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = usuarios_whatsapp.propriedade_id and up.usuario_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = usuarios_whatsapp.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario deleta usuarios_whatsapp da propriedade"
  on usuarios_whatsapp for delete
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = usuarios_whatsapp.propriedade_id and up.usuario_id = auth.uid()
    )
  );

alter table patrimonio enable row level security;

create policy "usuario ve patrimonio da propriedade"
  on patrimonio for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = patrimonio.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario insere patrimonio da propriedade"
  on patrimonio for insert
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = patrimonio.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario atualiza patrimonio da propriedade"
  on patrimonio for update
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = patrimonio.propriedade_id and up.usuario_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = patrimonio.propriedade_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario deleta patrimonio da propriedade"
  on patrimonio for delete
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = patrimonio.propriedade_id and up.usuario_id = auth.uid()
    )
  );
